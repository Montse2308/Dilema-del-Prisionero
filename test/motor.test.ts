import { describe, expect, it } from "vitest";
import {
  SPECS,
  TRUST,
  VANBERG,
  beliefsFrom,
  census,
  fermi,
  fixatedSpec,
  hashSeed,
  makeRng,
  run,
  uniformPopulation,
  type MoranParams,
  type Spec,
} from "../src/index.js";

const SENS = { theta: 0.6, c: 5 } as const;

/** Corrida chica pero suficiente: la fijación llega mucho antes de 250. */
function params(overrides: Partial<MoranParams> & Pick<MoranParams, "game" | "p">): MoranParams {
  return { size: 100, phi: 0.5, s: 0, w: 0.5, sens: SENS, encounters: 2, ...overrides };
}

const seeds = Array.from({ length: 12 }, (_, i) => `semilla-${i}`);
const GENS = 250;

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

  it("sin promisores, β₁ se queda en el valor anterior en vez de colapsar a 0", () => {
    const b = beliefsFrom({ acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 }, 0.5, 0.76);
    expect(b.beta1).toBe(0.76);
  });
});

describe("Moran — determinismo", () => {
  it("la misma semilla da la misma corrida", () => {
    const p = params({ game: TRUST, p: 1 });
    const a = run(p, 60, "repetible");
    const b = run(p, 60, "repetible");
    expect(a.counts).toEqual(b.counts);
    expect(a.final.beliefs).toEqual(b.final.beliefs);
    expect(a.history.map((h) => h.rollRate)).toEqual(b.history.map((h) => h.rollRate));
  });
});

describe("tests de sanidad de §6.3, sobre el trust game", () => {
  it("p = 0 ⇒ el resultado es el Nash material: nadie entra, nadie tira (DEY prop. 5)", () => {
    for (const seed of seeds) {
      const result = run(params({ game: TRUST, p: 0 }), GENS, seed);
      const last = result.history[result.history.length - 1];
      expect(last).toBeDefined();
      expect(last!.entryRate).toBe(0);
      expect(last!.rollRate).toBe(0);
      expect(last!.meanSocialPayoff).toBeCloseTo(10, 12);
    }
  });

  it("p = 1 ⇒ SELF se extingue y el encuentro con promesa es eficiente (DEY prop. 2)", () => {
    for (const seed of seeds) {
      const result = run(params({ game: TRUST, p: 1 }), GENS, seed);
      const last = result.history[result.history.length - 1];
      expect(result.counts.SELF).toBe(0);
      expect(last!.rollRate).toBe(1);
      expect(last!.meanSocialPayoff).toBeGreaterThan(14);
    }
  });

  it("con φ = 1 y p = 1 la entrada es total y el pago social llega a 20", () => {
    const result = run(params({ game: TRUST, p: 1, phi: 1 }), GENS, "eficiencia");
    const last = result.history[result.history.length - 1];
    expect(last!.entryRate).toBe(1);
    expect(last!.meanSocialPayoff).toBeCloseTo(20, 12);
  });
});

describe("el dictador de Vanberg es degenerado — §6.8", () => {
  it("nadie tira al final, con cualquier p, y el pago social se queda en 14", () => {
    for (const p of [0, 0.5, 1]) {
      for (const seed of seeds.slice(0, 6)) {
        const result = run(params({ game: VANBERG, p }), GENS, seed);
        const last = result.history[result.history.length - 1];
        expect(last!.entryRate).toBe(1);
        expect(last!.rollRate).toBe(0);
        expect(last!.meanSocialPayoff).toBeCloseTo(14, 12);
        expect(result.final.beliefs.beta1).toBe(0);
      }
    }
  });
});

describe("w = 0 es deriva, no selección", () => {
  it("con selección SELF nunca sobrevive; con w = 0 sobrevive varias veces", () => {
    let aliveUnderSelection = 0;
    let aliveUnderDrift = 0;
    for (const seed of seeds) {
      if (run(params({ game: TRUST, p: 1 }), GENS, seed).counts.SELF > 0) aliveUnderSelection += 1;
      if (run(params({ game: TRUST, p: 1, w: 0 }), GENS, seed).counts.SELF > 0) aliveUnderDrift += 1;
    }
    expect(aliveUnderSelection).toBe(0);
    expect(aliveUnderDrift).toBeGreaterThan(0);
  });
});

describe("moral overdrive — Q4, con la corrección de §6.8", () => {
  it("un θ enorme sube la ENTRADA, no lo que pasa después de entrar", () => {
    const moderate = run(params({ game: TRUST, p: 1 }), GENS, "overdrive");
    const huge = run(params({ game: TRUST, p: 1, sens: { theta: 100, c: 100 } }), GENS, "overdrive");
    const a = moderate.history[moderate.history.length - 1]!;
    const b = huge.history[huge.history.length - 1]!;

    expect(b.entryRate).toBeGreaterThan(a.entryRate);
    // Condicional a que el decisor actúe, los dos terminan tirando: el pago
    // social por encuentro jugado es el mismo. El θ enorme no compra nada
    // adentro del juego, solo convence al primer mover de entrar.
    expect(a.rollRate).toBe(1);
    expect(b.rollRate).toBe(1);
  });

  it("identidad contable: el pago social es entrada × lo de adentro + salida × 10", () => {
    for (const p of [0, 0.5, 1]) {
      const result = run(params({ game: TRUST, p }), GENS, "contabilidad");
      for (const h of result.history) {
        const inside = h.rollRate * 20 + (1 - h.rollRate) * 14;
        expect(h.meanSocialPayoff).toBeCloseTo(h.entryRate * inside + (1 - h.entryRate) * 10, 8);
      }
    }
  });
});
