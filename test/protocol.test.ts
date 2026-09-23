import { describe, expect, it } from "vitest";
import {
  CAP_OFF,
  TRUST,
  VANBERG,
  dictatorProbe,
  drawMessage,
  makeRng,
  matchFor,
  pgaBeliefs,
  run,
  unilateralMix,
  updateCells,
  utility,
  type CellBeliefs,
  type MessageMix,
  type MoranParams,
  type Sensitivities,
} from "../src/index.js";

const SENS: Sensitivities = { theta: 0.6, c: 5 };
const BETA1_INIT = 0.76;

const EVEN: MessageMix = { agreement: 0.25, deciderOnly: 0.25, partnerOnly: 0.25, none: 0.25 };

function params(overrides: Partial<MoranParams> & Pick<MoranParams, "game">): MoranParams {
  return { size: 80, phi: 0.5, s: 0, p: 1, w: 0.5, sens: SENS, encounters: 2, ...overrides };
}

describe("unilateral protocol — the previous engine, seed by seed", () => {
  it("drawMessage with unilateralMix consumes the same cut as bool(φ)", () => {
    for (const phi of [0, 0.3, 0.5, 1]) {
      const draw = makeRng("corte");
      const bool = makeRng("corte");
      for (let i = 0; i < 200; i += 1) {
        const cell = drawMessage(unilateralMix(phi), draw);
        expect(cell === "deciderOnly").toBe(bool.bool(phi));
        expect(cell === "agreement" || cell === "partnerOnly").toBe(false);
      }
      expect(draw.next()).toBe(bool.next());
    }
  });

  it("marking the protocol unilateral does not move population, beliefs, or payoffs", () => {
    const base = params({ game: TRUST, phi: 0.3, s: 0.25, p: 0.5, w: 0.5 });
    const marked = { ...base, protocol: "unilateral" as const };
    for (const seed of ["s-0", "s-1", "s-2", "s-3"]) {
      const a = run(base, 40, seed);
      const b = run(marked, 40, seed);
      expect(b.final.population).toEqual(a.final.population);
      expect(b.final.beliefs).toEqual(a.final.beliefs);
      expect(b.final.cells).toEqual(a.final.cells);
      expect(b.history.map((h) => h.rollRate)).toEqual(a.history.map((h) => h.rollRate));
      expect(b.history.map((h) => h.entryRate)).toEqual(a.history.map((h) => h.entryRate));
      expect(b.history.map((h) => h.meanSocialPayoff)).toEqual(a.history.map((h) => h.meanSocialPayoff));
    }
  });

  it("agreement and the receiver's promise have frequency 0, and their belief does not move", () => {
    const result = run(params({ game: VANBERG, phi: 0.3, s: 0.25, p: 1 }), 20, "frecuencia");
    for (const row of result.history) {
      expect(row.messageCounts.agreement).toBe(0);
      expect(row.messageCounts.partnerOnly).toBe(0);
      expect(row.messageCounts.deciderOnly + row.messageCounts.none).toBe(80 * 2);
    }
    expect(result.final.cells.agreement).toBe(BETA1_INIT);
    expect(result.final.cells.partnerOnly).toBe(0.3 * BETA1_INIT);
    expect(result.final.cells.deciderOnly).toBe(result.final.beliefs.beta1);
  });
});

describe("the receiver's message enters only as a belief", () => {
  const legacy = { beta0: 0.25, beta1: 0.76 };

  it("unilateral ignores per-cell beliefs and keeps reading the derived pair", () => {
    const wild: CellBeliefs = { agreement: 0.01, deciderOnly: 0.02, partnerOnly: 0.03, none: 0.04 };
    expect(
      matchFor({ protocol: "unilateral", cell: "deciderOnly", switched: false, cells: wild, beliefs: legacy }),
    ).toEqual({
      promised: true,
      bindsThisPartner: true,
      partnerExpectation: legacy.beta1,
      beliefs: legacy,
    });
    expect(
      matchFor({ protocol: "unilateral", cell: "none", switched: true, cells: wild, beliefs: legacy }),
    ).toEqual({
      promised: false,
      bindsThisPartner: false,
      partnerExpectation: legacy.beta0,
      beliefs: legacy,
    });
  });

  it("PGA receives the increment of its own promise, not a new guilt term", () => {
    const cells: CellBeliefs = { agreement: 0.9, deciderOnly: 0.55, partnerOnly: 0.2, none: 0.5 };
    expect(pgaBeliefs("agreement", cells)).toEqual({ beta0: 0.2, beta1: 0.9 });
    expect(pgaBeliefs("deciderOnly", cells)).toEqual({ beta0: 0.5, beta1: 0.55 });
    const agreement = matchFor({
      protocol: "reciprocal", cell: "agreement", switched: false, cells, beliefs: legacy,
    });
    const deciderOnly = matchFor({
      protocol: "reciprocal", cell: "deciderOnly", switched: false, cells, beliefs: legacy,
    });
    expect(agreement.partnerExpectation).toBe(0.9);
    expect(agreement.beliefs).toEqual({ beta0: 0.2, beta1: 0.9 });
    expect(deciderOnly.beliefs).toEqual({ beta0: 0.5, beta1: 0.55 });
  });

  it("MC-a and MC-b do not change between agreement and a one-sided promise", () => {
    const cells: CellBeliefs = { agreement: 0.9, deciderOnly: 0.55, partnerOnly: 0.2, none: 0.5 };
    for (const switched of [false, true]) {
      const agreement = matchFor({
        protocol: "reciprocal", cell: "agreement", switched, cells, beliefs: legacy,
      });
      const deciderOnly = matchFor({
        protocol: "reciprocal", cell: "deciderOnly", switched, cells, beliefs: legacy,
      });
      for (const spec of ["MC-a", "MC-b"] as const) {
        for (const action of ["roll", "dont"] as const) {
          expect(utility(spec, action, SENS, agreement)).toBe(utility(spec, action, SENS, deciderOnly));
        }
      }
      expect(utility("GA", "dont", SENS, agreement)).not.toBe(utility("GA", "dont", SENS, deciderOnly));
      const pgaAgreement = utility("PGA", "dont", SENS, agreement);
      const pgaDecider = utility("PGA", "dont", SENS, deciderOnly);
      if (switched) expect(pgaAgreement).toBe(pgaDecider);
      else expect(pgaAgreement).not.toBe(pgaDecider);
    }
  });

  it("with the same belief in every cell, agreement and a one-sided promise are the same encounter", () => {
    const cells: CellBeliefs = { agreement: 0.8, deciderOnly: 0.8, partnerOnly: 0.8, none: 0.8 };
    const agreement = matchFor({
      protocol: "reciprocal", cell: "agreement", switched: false, cells, beliefs: legacy,
    });
    const deciderOnly = matchFor({
      protocol: "reciprocal", cell: "deciderOnly", switched: false, cells, beliefs: legacy,
    });
    expect(agreement).toEqual(deciderOnly);
    for (const spec of ["MC-a", "MC-b"] as const) {
      expect(utility(spec, "dont", SENS, agreement)).toBe(utility(spec, "dont", SENS, deciderOnly));
    }
  });

  it("the reciprocal loop records each cell: PGA rolls where it promised and not elsewhere", () => {
    const initial = Array.from({ length: 80 }, () => "PGA" as const);
    const shared = params({ game: VANBERG, size: 80, phi: 0.5, s: 0, p: 1, encounters: 4 });
    const reciprocal = run({ ...shared, protocol: "reciprocal", messages: EVEN }, 1, "pga", initial);
    expect(reciprocal.final.cells.agreement).toBe(1);
    expect(reciprocal.final.cells.deciderOnly).toBe(1);
    expect(reciprocal.final.cells.partnerOnly).toBe(0);
    expect(reciprocal.final.cells.none).toBe(0);
  });

  it("when the promiser share is φ and cells open symmetric, reciprocal copies the unilateral population", () => {
    const shared = params({ game: TRUST, size: 60, phi: 0.5, s: 0.25, p: 1 });
    const unilateral = run({ ...shared, protocol: "unilateral" }, 80, "simetria");
    const reciprocal = run(
      { ...shared, protocol: "reciprocal", messages: EVEN },
      80,
      "simetria",
    );
    expect(reciprocal.final.population).toEqual(unilateral.final.population);
    expect(reciprocal.history.map((row) => row.rollRate)).toEqual(
      unilateral.history.map((row) => row.rollRate),
    );
  });
});

describe("belief by cell", () => {
  it("with observations it moves to the rate; without observations it stays", () => {
    const previous: CellBeliefs = { agreement: 0.76, deciderOnly: 0.76, partnerOnly: 0.76, none: 0.76 };
    const next = updateCells(
      {
        agreement: { observed: 4, rolls: 1 },
        deciderOnly: { observed: 0, rolls: 0 },
        partnerOnly: { observed: 2, rolls: 2 },
        none: { observed: 0, rolls: 0 },
      },
      previous,
    );
    expect(next.agreement).toBeCloseTo(0.25, 12);
    expect(next.partnerOnly).toBe(1);
    expect(next.deciderOnly).toBe(0.76);
    expect(next.none).toBe(0.76);
  });

  it("in the probe, MC-a's cell converges to its keeping rate and a zero-frequency cell does not move", () => {
    const population = Array.from({ length: 20 }, () => "MC-a" as const);
    const probe = dictatorProbe({
      population,
      sens: SENS,
      s: 0.5,
      cells: { agreement: BETA1_INIT, deciderOnly: BETA1_INIT, partnerOnly: BETA1_INIT, none: BETA1_INIT },
      mix: EVEN,
    });
    expect(probe.fixed).toBe(true);
    expect(probe.cells).toEqual({ agreement: 1, deciderOnly: 1, partnerOnly: 0, none: 0 });
    expect(probe.rates.agreement).toEqual({ stayed: 1, switched: 1 });
    expect(probe.rates.none).toEqual({ stayed: 0, switched: 0 });

    const quiet = dictatorProbe({
      population,
      sens: SENS,
      s: 0,
      cells: { agreement: BETA1_INIT, deciderOnly: BETA1_INIT, partnerOnly: BETA1_INIT, none: BETA1_INIT },
      mix: unilateralMix(0.5),
    });
    expect(quiet.fixed).toBe(true);
    expect(quiet.cells.agreement).toBe(BETA1_INIT);
    expect(quiet.cells.partnerOnly).toBe(BETA1_INIT);
    expect(quiet.cells.deciderOnly).toBe(1);
    expect(quiet.cells.none).toBe(0);
  });

  it("GA in one cell does not drag the belief of the others", () => {
    const population = Array.from({ length: 16 }, () => "GA" as const);
    const probe = dictatorProbe({
      population,
      sens: SENS,
      s: 0.5,
      cells: { agreement: 0.9, deciderOnly: 0.1, partnerOnly: 0.1, none: 0.1 },
      mix: EVEN,
    });
    expect(probe.fixed).toBe(true);
    expect(probe.cells.agreement).toBe(1);
    expect(probe.cells.deciderOnly).toBe(0);
    expect(probe.cells.partnerOnly).toBe(0);
    expect(probe.cells.none).toBe(0);
  });

  it("the probe freezes composition and the dictator cap comes off", () => {
    const population = Array.from({ length: 10 }, () => "PGA" as const);
    const cells: CellBeliefs = { agreement: 0.82, deciderOnly: 0, partnerOnly: 0.8, none: 0 };
    const mix: MessageMix = { agreement: 1, deciderOnly: 0, partnerOnly: 0, none: 0 };
    const before = population.slice();
    const off = dictatorProbe({ population, sens: SENS, s: 0, cells, mix, maxIterations: 1 });
    const explicit = dictatorProbe({
      population, sens: SENS, s: 0, cells, mix, maxIterations: 1, cap: CAP_OFF,
    });
    const on = dictatorProbe({
      population,
      sens: SENS,
      s: 0,
      cells,
      mix,
      maxIterations: 1,
      cap: { enabled: true, outsideOption: 5 },
    });
    expect(population).toEqual(before);
    expect(off.cells.agreement).toBe(0);
    expect(explicit.cells.agreement).toBe(off.cells.agreement);
    expect(on.cells.agreement).toBe(1);
    expect(off.cells.partnerOnly).toBe(0.8);
  });

  it("rejects a mix that does not sum to 1 and a reciprocal run without messages", () => {
    expect(() =>
      dictatorProbe({
        population: ["GA"],
        sens: SENS,
        s: 0,
        cells: { agreement: 0.5, deciderOnly: 0.5, partnerOnly: 0.5, none: 0.5 },
        mix: { agreement: 0.2, deciderOnly: 0.2, partnerOnly: 0.2, none: 0.2 },
      }),
    ).toThrow(RangeError);
    expect(() => run(params({ game: VANBERG, protocol: "reciprocal" }), 1, "x")).toThrow(RangeError);
  });
});
