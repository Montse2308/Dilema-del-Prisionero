import { describe, expect, it } from "vitest";
import {
  CAP_OFF,
  SPECS,
  TRUST,
  VANBERG,
  beliefsFrom,
  capForGame,
  census,
  entryExpectation,
  fermi,
  firstMoverEnters,
  fixatedSpec,
  hashSeed,
  makeRng,
  run,
  uniformPopulation,
  type Beliefs,
  type MatchState,
  type MoranParams,
  type ObservationMode,
  type Sensitivities,
} from "../src/index.js";

const SENS: Sensitivities = { theta: 0.6, c: 5 };

function params(overrides: Partial<MoranParams> & Pick<MoranParams, "game" | "p">): MoranParams {
  return { size: 100, phi: 0.5, s: 0, w: 0.5, sens: SENS, encounters: 2, ...overrides };
}

const seeds = Array.from({ length: 12 }, (_, i) => `semilla-${i}`);
const GENS = 300;

describe("rng — explicit seed", () => {
  it("the same seed gives the same sequence and another seed gives another", () => {
    const a = Array.from({ length: 20 }, () => makeRng("dilema").next());
    const b = Array.from({ length: 20 }, () => makeRng("dilema").next());
    const c = Array.from({ length: 20 }, () => makeRng("dilemA").next());
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(hashSeed("dilema")).toBe(hashSeed("dilema"));
  });

  it("next is in [0, 1), int is in range, and bool respects the extremes", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(rng.int(5)).toBeLessThan(5);
      expect(rng.bool(0)).toBe(false);
      expect(rng.bool(1)).toBe(true);
    }
    expect(() => rng.int(0)).toThrow(RangeError);
  });
});

describe("Fermi rule", () => {
  it("w = 0 is exactly 1/2, whatever the payoffs", () => {
    for (const [a, b] of [[10, 14], [14, 10], [5, 5], [0, 100]] as const) {
      expect(fermi(a, b, 0)).toBe(0.5);
    }
  });

  it("with w > 0 the higher payoff is copied more often, and the rule is symmetric", () => {
    expect(fermi(10, 14, 0.5)).toBeGreaterThan(0.5);
    expect(fermi(14, 10, 0.5)).toBeLessThan(0.5);
    expect(fermi(10, 14, 0.5) + fermi(14, 10, 0.5)).toBeCloseTo(1, 12);
  });
});

describe("the game as a parameter", () => {
  it("the trust game pays 5/5 outside, 10/10 on Roll, and 0/14 on Don't", () => {
    expect(TRUST.outside).toEqual({ firstMover: 5, decider: 5 });
    expect(TRUST.outsideOption).toBe(5);
    expect(TRUST.deciderPayoff("roll")).toBe(10);
    expect(TRUST.deciderPayoff("dont")).toBe(14);
    expect(TRUST.firstMoverPayoff("roll")).toBe(10);
    expect(TRUST.firstMoverPayoff("dont")).toBe(0);
  });

  it("Vanberg has the same decider payoffs and no entry stage", () => {
    expect(VANBERG.hasEntry).toBe(false);
    expect(VANBERG.outside).toBeNull();
    expect(VANBERG.outsideOption).toBeNull();
    expect(VANBERG.deciderPayoff("roll")).toBe(TRUST.deciderPayoff("roll"));
    expect(VANBERG.deciderPayoff("dont")).toBe(TRUST.deciderPayoff("dont"));
  });

  it("PGA's cap comes from the game: off in Vanberg, on in the trust game", () => {
    expect(capForGame(VANBERG)).toEqual(CAP_OFF);
    expect(capForGame(TRUST)).toEqual({ enabled: true, outsideOption: 5 });
  });
});

describe("population and beliefs", () => {
  it("the census sums to N and a uniform population splits evenly", () => {
    const pop = uniformPopulation(100);
    const counts = census(pop);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(100);
    for (const spec of SPECS) expect(counts[spec]).toBe(20);
    expect(fixatedSpec(pop)).toBeNull();
    expect(fixatedSpec(["GA", "GA", "GA"])).toBe("GA");
  });

  it("β₁ comes from promisers' behavior and β₀ = φ·β₁ with r = 0", () => {
    const b = beliefsFrom({ acted: 40, promisers: 20, promiserRolls: 15, silentRolls: 0 }, 0.5, 0.76);
    expect(b.beta1).toBeCloseTo(0.75, 12);
    expect(b.beta0).toBeCloseTo(0.375, 12);
  });

  it("with no promisers counted, β₁ stays at the previous value", () => {
    const b = beliefsFrom({ acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 }, 0.5, 0.76);
    expect(b.beta1).toBe(0.76);
  });
});

const BELIEFS: Beliefs = { beta0: 0.45, beta1: 0.9 };

function switchedMatch(): MatchState {
  return {
    promised: true,
    bindsThisPartner: false,
    partnerExpectation: BELIEFS.beta1,
    beliefs: BELIEFS,
  };
}

function expectation(spec: "PGA" | "MC-b", mode: ObservationMode, s: number): number {
  const match = switchedMatch();
  return entryExpectation({
    spec,
    sens: SENS,
    match,
    game: TRUST,
    action: "dont",
    observes: true,
    s,
    mode,
    cap: capForGame(TRUST),
  });
}

describe("what the first mover sees", () => {
  it("the strong reading shows the private draw and keeps the first mover out", () => {
    for (const s of [0, 0.25, 0.5, 1]) {
      expect(expectation("PGA", "strong", s)).toBe(0);
      expect(firstMoverEnters(expectation("PGA", "strong", s), TRUST)).toBe(false);
    }
  });

  it("the weak reading hides the institution: the first mover always enters, at any s", () => {
    for (const s of [0, 0.25, 0.5, 1]) {
      expect(expectation("PGA", "weak", s)).toBe(10);
      expect(firstMoverEnters(expectation("PGA", "weak", s), TRUST)).toBe(true);
    }
  });

  it("the rational reading mixes the two counterfactual actions with s", () => {
    expect(expectation("PGA", "rational", 0)).toBeCloseTo(10, 12);
    expect(expectation("PGA", "rational", 0.25)).toBeCloseTo(7.5, 12);
    expect(expectation("PGA", "rational", 0.5)).toBeCloseTo(5, 12);
    expect(expectation("PGA", "rational", 1)).toBeCloseTo(0, 12);
  });

  it("MC-b's threshold is exactly s = 1/2, and a tie sends the first mover out", () => {
    expect(firstMoverEnters(expectation("MC-b", "rational", 0.49), TRUST)).toBe(true);
    expect(firstMoverEnters(expectation("MC-b", "rational", 0.5), TRUST)).toBe(false);
    expect(firstMoverEnters(expectation("MC-b", "rational", 0.51), TRUST)).toBe(false);
    expect(expectation("MC-b", "rational", 0.5)).toBe(TRUST.outside!.firstMover);
  });

  it("at s = 0 the three readings agree", () => {
    const match: MatchState = { ...switchedMatch(), bindsThisPartner: true };
    const args = { spec: "PGA" as const, sens: SENS, match, game: TRUST, action: "roll" as const, observes: true, s: 0, cap: capForGame(TRUST) };
    const values = (["strong", "weak", "rational"] as const).map((mode) =>
      entryExpectation({ ...args, mode }),
    );
    expect(new Set(values).size).toBe(1);
  });

  it("without observing the type, the population belief is used, and β = 0.5 is not enough", () => {
    const match: MatchState = { ...switchedMatch(), partnerExpectation: 0.5 };
    const value = entryExpectation({
      spec: "PGA", sens: SENS, match, game: TRUST, action: "dont",
      observes: false, s: 0, mode: "rational", cap: capForGame(TRUST),
    });
    expect(value).toBe(5);
    expect(firstMoverEnters(value, TRUST)).toBe(false);
  });
});

describe("Moran — determinism and validation", () => {
  it("the same seed gives the same run", () => {
    const p = params({ game: TRUST, p: 1 });
    const a = run(p, 60, "repetible");
    const b = run(p, 60, "repetible");
    expect(a.counts).toEqual(b.counts);
    expect(a.final.beliefs).toEqual(b.final.beliefs);
    expect(a.history.map((h) => h.rollRate)).toEqual(b.history.map((h) => h.rollRate));
  });

  it("rejects an initial population of the wrong size, and encounters ≤ 0", () => {
    const p = params({ game: TRUST, p: 1 });
    expect(() => run(p, 10, "x", uniformPopulation(99))).toThrow(RangeError);
    expect(() => run({ ...p, encounters: 0 }, 10, "x")).toThrow(RangeError);
    expect(() => run({ ...p, phi: 1.5 }, 10, "x")).toThrow(RangeError);
    expect(() => run(p, -1, "x")).toThrow(RangeError);
  });
});

describe("sanity on the trust game", () => {
  it("p = 0 is the material Nash: nobody enters and nobody rolls", () => {
    for (const seed of seeds) {
      const last = run(params({ game: TRUST, p: 0 }), GENS, seed).history.at(-1);
      expect(last!.entryRate).toBe(0);
      expect(last!.meanSocialPayoff).toBeCloseTo(10, 12);
    }
  });

  it("p = 1 drives SELF extinct and entry stays near φ", () => {
    for (const seed of seeds) {
      const result = run(params({ game: TRUST, p: 1 }), GENS, seed);
      const last = result.history.at(-1);
      expect(result.counts.SELF).toBe(0);
      // Entry is only against promisers, so the rate sits near φ.
      // The band is binomial noise from 200 encounters (σ ≈ 0.035).
      expect(Math.abs(last!.entryRate - 0.5)).toBeLessThan(0.12);
      expect(last!.socialPayoffGivenEntry).toBeCloseTo(20, 12);
    }
  });

  it("with φ = 1 and p = 1, entry is complete and the social payoff reaches 20", () => {
    const last = run(params({ game: TRUST, p: 1, phi: 1 }), GENS, "eficiencia").history.at(-1);
    expect(last!.entryRate).toBe(1);
    expect(last!.meanSocialPayoff).toBeCloseTo(20, 12);
  });
});

describe("the s axis crosses at 1/2", () => {
  it("at s = 0.25, PGA and MC-b survive", () => {
    for (const seed of seeds) {
      const { counts } = run(params({ game: TRUST, p: 1, s: 0.25 }), GENS, seed);
      expect(counts.SELF).toBe(0);
      expect(counts.GA).toBe(0);
      expect(counts["MC-a"]).toBe(0);
      expect(counts.PGA + counts["MC-b"]).toBe(100);
    }
  });

  it("at s = 0.6 the first mover shuts them out and GA and MC-a survive", () => {
    for (const seed of seeds) {
      const { counts } = run(params({ game: TRUST, p: 1, s: 0.6 }), GENS, seed);
      expect(counts.SELF).toBe(0);
      expect(counts.PGA).toBe(0);
      expect(counts["MC-b"]).toBe(0);
      expect(counts.GA + counts["MC-a"]).toBe(100);
    }
  });

  it("the weak reading reverses the result above 1/2: MC-b fixates and nobody rolls", () => {
    const result = run(params({ game: TRUST, p: 1, s: 1, observation: "weak" }), GENS, "debil");
    const last = result.history.at(-1);
    expect(result.counts["MC-b"]).toBe(100);
    expect(last!.rollRate).toBe(0);
    expect(last!.entryRate).toBeGreaterThan(0);
    expect(last!.socialPayoffGivenEntry).toBeCloseTo(14, 12);
  });

  it("with structural β₁, GA loses the high side of s to MC-a", () => {
    let gaEntered = 0;
    let gaStructural = 0;
    for (const seed of seeds) {
      gaEntered += run(params({ game: TRUST, p: 1, s: 0.75 }), GENS, seed).counts.GA;
      gaStructural += run(
        params({ game: TRUST, p: 1, s: 0.75, beta1Kind: "structural" }), GENS, seed,
      ).counts.GA;
    }
    expect(gaStructural).toBeLessThan(gaEntered);
  });
});

describe("Vanberg's dictator is degenerate", () => {
  it("nobody rolls at the end, at any p, and the social payoff stays at 14", () => {
    for (const p of [0, 0.5, 1]) {
      for (const seed of seeds.slice(0, 6)) {
        const result = run(params({ game: VANBERG, p }), GENS, seed);
        const last = result.history.at(-1);
        expect(last!.entryRate).toBe(1);
        expect(last!.rollRate).toBe(0);
        expect(last!.meanSocialPayoff).toBeCloseTo(14, 12);
        expect(result.final.beliefs.beta1).toBe(0);
      }
    }
  });
});

describe("w = 0 is drift, not selection", () => {
  it("under selection SELF is always extinct; at w = 0 its mean frequency stays near 1/5", () => {
    let underSelection = 0;
    let underDrift = 0;
    for (const seed of seeds) {
      underSelection += run(params({ game: TRUST, p: 1 }), GENS, seed).counts.SELF;
      underDrift += run(params({ game: TRUST, p: 1, w: 0 }), GENS, seed).counts.SELF;
    }
    const driftFrequency = underDrift / (seeds.length * 100);
    expect(underSelection).toBe(0);
    expect(driftFrequency).toBeGreaterThan(0.05);
    expect(driftFrequency).toBeLessThan(0.45);
  });
});

describe("moral overdrive", () => {
  it("a huge θ raises entry and does not change the payoff conditional on entry", () => {
    const moderate = run(params({ game: TRUST, p: 1 }), GENS, "overdrive").history.at(-1);
    const huge = run(
      params({ game: TRUST, p: 1, sens: { theta: 100, c: 100 } }), GENS, "overdrive",
    ).history.at(-1);

    expect(huge!.entryRate).toBeGreaterThan(moderate!.entryRate);
    expect(huge!.socialPayoffGivenEntry).toBeCloseTo(moderate!.socialPayoffGivenEntry, 12);
    expect(huge!.socialPayoffGivenEntry).toBeCloseTo(20, 12);
  });

  it("accounting identity: social payoff is entry times the inside payoff plus exit times 10", () => {
    for (const p of [0, 0.5, 1]) {
      for (const s of [0, 0.25, 0.75]) {
        const result = run(params({ game: TRUST, p, s }), GENS, "contabilidad");
        for (const h of result.history) {
          const inside = h.entryRate > 0 ? h.socialPayoffGivenEntry : 0;
          expect(h.meanSocialPayoff).toBeCloseTo(h.entryRate * inside + (1 - h.entryRate) * 10, 8);
        }
      }
    }
  });
});
