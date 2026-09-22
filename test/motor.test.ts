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

describe("rng — semilla explícita", () => {
  it("la misma semilla da la misma secuencia y otra semilla da otra", () => {
    const a = Array.from({ length: 20 }, () => makeRng("dilema").next());
    const b = Array.from({ length: 20 }, () => makeRng("dilema").next());
    const c = Array.from({ length: 20 }, () => makeRng("dilemA").next());
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(hashSeed("dilema")).toBe(hashSeed("dilema"));
  });

  it("next está en [0, 1), int en rango, y bool respeta los extremos", () => {
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

describe("regla de Fermi — K12", () => {
  it("w = 0 es exactamente 1/2, sean cuales sean los pagos", () => {
    for (const [a, b] of [[10, 14], [14, 10], [5, 5], [0, 100]] as const) {
      expect(fermi(a, b, 0)).toBe(0.5);
    }
  });

  it("con w > 0 se copia más al que gana más, y es simétrica en el medio", () => {
    expect(fermi(10, 14, 0.5)).toBeGreaterThan(0.5);
    expect(fermi(14, 10, 0.5)).toBeLessThan(0.5);
    expect(fermi(10, 14, 0.5) + fermi(14, 10, 0.5)).toBeCloseTo(1, 12);
  });
});

describe("el juego como parámetro — pagos de 18 §3.1", () => {
  it("el trust game paga 5/5 afuera, 10/10 con Roll y 0/14 con Don't", () => {
    expect(TRUST.outside).toEqual({ firstMover: 5, decider: 5 });
    expect(TRUST.outsideOption).toBe(5);
    expect(TRUST.deciderPayoff("roll")).toBe(10);
    expect(TRUST.deciderPayoff("dont")).toBe(14);
    expect(TRUST.firstMoverPayoff("roll")).toBe(10);
    expect(TRUST.firstMoverPayoff("dont")).toBe(0);
  });

  it("Vanberg tiene los mismos pagos del decisor y no tiene etapa de entrada", () => {
    expect(VANBERG.hasEntry).toBe(false);
    expect(VANBERG.outside).toBeNull();
    expect(VANBERG.outsideOption).toBeNull();
    expect(VANBERG.deciderPayoff("roll")).toBe(TRUST.deciderPayoff("roll"));
    expect(VANBERG.deciderPayoff("dont")).toBe(TRUST.deciderPayoff("dont"));
  });

  it("el tope de PGA sale del juego: apagado en Vanberg, prendido en el trust game", () => {
    expect(capForGame(VANBERG)).toEqual(CAP_OFF);
    expect(capForGame(TRUST)).toEqual({ enabled: true, outsideOption: 5 });
  });
});

describe("población y creencias", () => {
  it("el censo suma N y la población uniforme reparte parejo", () => {
    const pop = uniformPopulation(100);
    const counts = census(pop);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(100);
    for (const spec of SPECS) expect(counts[spec]).toBe(20);
    expect(fixatedSpec(pop)).toBeNull();
    expect(fixatedSpec(["GA", "GA", "GA"])).toBe("GA");
  });

  it("β₁ sale de la conducta de los promisores y β₀ = φ·β₁ con r = 0", () => {
    const b = beliefsFrom({ acted: 40, promisers: 20, promiserRolls: 15, silentRolls: 0 }, 0.5, 0.76);
    expect(b.beta1).toBeCloseTo(0.75, 12);
    expect(b.beta0).toBeCloseTo(0.375, 12);
  });

  it("sin promisores contabilizados, β₁ se queda en el valor anterior", () => {
    const b = beliefsFrom({ acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 }, 0.5, 0.76);
    expect(b.beta1).toBe(0.76);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q10 — K13. Lo que decide el signo de todo el eje s.
// ─────────────────────────────────────────────────────────────────────────────

const BELIEFS: Beliefs = { beta0: 0.45, beta1: 0.9 };

function switchedMatch(): MatchState {
  return {
    promised: true,
    bindsThisPartner: false, // el sorteo de switch salió, y es PRIVADO
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
    action: "dont", // lo que el tipo realmente hace: la promesa no lo ata
    observes: true,
    s,
    mode,
    cap: capForGame(TRUST),
  });
}

describe("Q10 — qué ve el primer mover (K13)", () => {
  it("la lectura FUERTE le muestra el sorteo privado y lo deja afuera", () => {
    for (const s of [0, 0.25, 0.5, 1]) {
      expect(expectation("PGA", "strong", s)).toBe(0);
      expect(firstMoverEnters(expectation("PGA", "strong", s), TRUST)).toBe(false);
    }
  });

  it("la lectura DÉBIL le esconde la institución: entra siempre, para cualquier s", () => {
    for (const s of [0, 0.25, 0.5, 1]) {
      expect(expectation("PGA", "weak", s)).toBe(10);
      expect(firstMoverEnters(expectation("PGA", "weak", s), TRUST)).toBe(true);
    }
  });

  it("la lectura RACIONAL mezcla las dos acciones contrafactuales con s", () => {
    expect(expectation("PGA", "rational", 0)).toBeCloseTo(10, 12);
    expect(expectation("PGA", "rational", 0.25)).toBeCloseTo(7.5, 12);
    expect(expectation("PGA", "rational", 0.5)).toBeCloseTo(5, 12);
    expect(expectation("PGA", "rational", 1)).toBeCloseTo(0, 12);
  });

  it("el umbral de MC-b es s = 1/2 exacto, y el empate lo manda afuera", () => {
    expect(firstMoverEnters(expectation("MC-b", "rational", 0.49), TRUST)).toBe(true);
    expect(firstMoverEnters(expectation("MC-b", "rational", 0.5), TRUST)).toBe(false);
    expect(firstMoverEnters(expectation("MC-b", "rational", 0.51), TRUST)).toBe(false);
    // 1/2 es 5/10, y es 5/10 porque Don't le paga 0 al primer mover.
    expect(expectation("MC-b", "rational", 0.5)).toBe(TRUST.outside!.firstMover);
  });

  it("con s = 0 las tres lecturas coinciden", () => {
    const match: MatchState = { ...switchedMatch(), bindsThisPartner: true };
    const args = { spec: "PGA" as const, sens: SENS, match, game: TRUST, action: "roll" as const, observes: true, s: 0, cap: capForGame(TRUST) };
    const values = (["strong", "weak", "rational"] as const).map((mode) =>
      entryExpectation({ ...args, mode }),
    );
    expect(new Set(values).size).toBe(1);
  });

  it("sin observar el tipo usa la creencia poblacional, y β = 0.5 no alcanza", () => {
    const match: MatchState = { ...switchedMatch(), partnerExpectation: 0.5 };
    const value = entryExpectation({
      spec: "PGA", sens: SENS, match, game: TRUST, action: "dont",
      observes: false, s: 0, mode: "rational", cap: capForGame(TRUST),
    });
    expect(value).toBe(5);
    expect(firstMoverEnters(value, TRUST)).toBe(false);
  });
});

describe("Moran — determinismo y validaciones", () => {
  it("la misma semilla da la misma corrida", () => {
    const p = params({ game: TRUST, p: 1 });
    const a = run(p, 60, "repetible");
    const b = run(p, 60, "repetible");
    expect(a.counts).toEqual(b.counts);
    expect(a.final.beliefs).toEqual(b.final.beliefs);
    expect(a.history.map((h) => h.rollRate)).toEqual(b.history.map((h) => h.rollRate));
  });

  it("rechaza una población inicial de otro tamaño, y encounters ≤ 0", () => {
    const p = params({ game: TRUST, p: 1 });
    expect(() => run(p, 10, "x", uniformPopulation(99))).toThrow(RangeError);
    expect(() => run({ ...p, encounters: 0 }, 10, "x")).toThrow(RangeError);
    expect(() => run({ ...p, phi: 1.5 }, 10, "x")).toThrow(RangeError);
    expect(() => run(p, -1, "x")).toThrow(RangeError);
  });
});

describe("tests de sanidad de §6.3, sobre el trust game", () => {
  it("p = 0 ⇒ el resultado es el Nash material: nadie entra, nadie tira (DEY prop. 5)", () => {
    for (const seed of seeds) {
      const last = run(params({ game: TRUST, p: 0 }), GENS, seed).history.at(-1);
      expect(last!.entryRate).toBe(0);
      expect(last!.meanSocialPayoff).toBeCloseTo(10, 12);
    }
  });

  it("p = 1 ⇒ SELF se extingue y la entrada queda en φ (DEY prop. 2, con el techo de K11)", () => {
    for (const seed of seeds) {
      const result = run(params({ game: TRUST, p: 1 }), GENS, seed);
      const last = result.history.at(-1);
      expect(result.counts.SELF).toBe(0);
      // El techo de K11: solo se entra contra promisores, así que la entrada
      // ronda φ. La banda es el ruido binomial de 200 encuentros (σ ≈ 0.035).
      expect(Math.abs(last!.entryRate - 0.5)).toBeLessThan(0.12);
      expect(last!.socialPayoffGivenEntry).toBeCloseTo(20, 12);
    }
  });

  it("con φ = 1 y p = 1 la entrada es total y el pago social llega a 20", () => {
    const last = run(params({ game: TRUST, p: 1, phi: 1 }), GENS, "eficiencia").history.at(-1);
    expect(last!.entryRate).toBe(1);
    expect(last!.meanSocialPayoff).toBeCloseTo(20, 12);
  });
});

describe("el eje s cruza en 1/2 — K13, `26`", () => {
  it("con s = 0.25 sobreviven los explotadores: PGA y MC-b", () => {
    for (const seed of seeds) {
      const { counts } = run(params({ game: TRUST, p: 1, s: 0.25 }), GENS, seed);
      expect(counts.SELF).toBe(0);
      expect(counts.GA).toBe(0);
      expect(counts["MC-a"]).toBe(0);
      expect(counts.PGA + counts["MC-b"]).toBe(100);
    }
  });

  it("con s = 0.6 el primer mover les cierra la puerta y sobreviven GA y MC-a", () => {
    for (const seed of seeds) {
      const { counts } = run(params({ game: TRUST, p: 1, s: 0.6 }), GENS, seed);
      expect(counts.SELF).toBe(0);
      expect(counts.PGA).toBe(0);
      expect(counts["MC-b"]).toBe(0);
      expect(counts.GA + counts["MC-a"]).toBe(100);
    }
  });

  it("la lectura DÉBIL invierte el resultado arriba de 1/2: MC-b explota y nadie tira", () => {
    const result = run(params({ game: TRUST, p: 1, s: 1, observation: "weak" }), GENS, "debil");
    const last = result.history.at(-1);
    expect(result.counts["MC-b"]).toBe(100);
    expect(last!.rollRate).toBe(0);
    expect(last!.entryRate).toBeGreaterThan(0); // el primer mover sigue entrando y cobrando 0
    expect(last!.socialPayoffGivenEntry).toBeCloseTo(14, 12);
  });

  it("Q11: con β₁ estructural, GA pierde el lado alto de s contra MC-a", () => {
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

describe("el dictador de Vanberg es degenerado — §6.8", () => {
  it("nadie tira al final, con cualquier p, y el pago social se queda en 14", () => {
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

describe("w = 0 es deriva, no selección", () => {
  it("con selección SELF se extingue siempre; con w = 0 su frecuencia media se queda cerca de 1/5", () => {
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

describe("moral overdrive — Q4, con la corrección de §6.8", () => {
  it("un θ enorme sube la ENTRADA y no cambia el pago condicional a entrar", () => {
    const moderate = run(params({ game: TRUST, p: 1 }), GENS, "overdrive").history.at(-1);
    const huge = run(
      params({ game: TRUST, p: 1, sens: { theta: 100, c: 100 } }), GENS, "overdrive",
    ).history.at(-1);

    expect(huge!.entryRate).toBeGreaterThan(moderate!.entryRate);
    expect(huge!.socialPayoffGivenEntry).toBeCloseTo(moderate!.socialPayoffGivenEntry, 12);
    expect(huge!.socialPayoffGivenEntry).toBeCloseTo(20, 12);
  });

  it("identidad contable: el pago social es entrada × lo de adentro + salida × 10", () => {
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
