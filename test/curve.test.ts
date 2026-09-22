import { describe, expect, it } from "vitest";
import {
  CAP_OFF,
  TRUST,
  beliefsFrom,
  census,
  choose,
  guiltMass,
  makeRng,
  openingCells,
  priorBeta0,
  run,
  step,
  uniformPopulation,
  type Beliefs,
  type GuiltCap,
  type MatchState,
  type MoranParams,
  type MoranState,
  type Spec,
} from "../src/index.js";

/**
 * Q9 / `29`. La confianza de fondo se inyecta en el estado que `step` consume.
 * `run()` no aprende a clavarla: el test de abajo exige que el update oficial
 * siga siendo β₀ = φ·β₁ + (1−φ)·r.
 *
 * La conducta se lee con `choose`. Con p = 1 el Don't no entra, y `rollRate`
 * queda en 0 por el denominador vacío (`26`).
 */

const BETA1 = 0.76;
const THETA = 0.6;
const SENS = { theta: THETA, c: 5 };
const POINTS = [0.05, 0.38, 0.74] as const;
const CAP_ON: GuiltCap = { enabled: true, outsideOption: 5 };

function beliefs(beta0: number): Beliefs {
  return { beta0, beta1: BETA1 };
}

function binding(beta0: number): MatchState {
  return {
    promised: true,
    bindsThisPartner: true,
    partnerExpectation: BETA1,
    beliefs: beliefs(beta0),
  };
}

function curveParams(size: number, cap: GuiltCap = CAP_OFF): MoranParams {
  return {
    game: TRUST,
    size,
    phi: 1,
    s: 0,
    p: 1,
    w: 0.5,
    sens: SENS,
    encounters: 1,
    cap,
    observation: "rational",
    beta1Kind: "entered",
  };
}

function playPure(spec: Spec, beta0: number, cap: GuiltCap = CAP_OFF) {
  const params = curveParams(20, cap);
  const state: MoranState = {
    population: Array.from({ length: params.size }, () => spec),
    beliefs: beliefs(beta0),
    cells: openingCells(BETA1, beta0),
    generation: 0,
  };
  return step(state, params, makeRng("curva"));
}

describe("Q9 — la loma llega al pago, con la creencia clavada", () => {
  it("la culpa en los tres puntos repite la tabla de §3.3", () => {
    expect(guiltMass(beliefs(0.05))).toBeCloseTo(3.55, 10);
    expect(guiltMass(beliefs(0.38))).toBeCloseTo(14.44, 10);
    expect(guiltMass(beliefs(0.74))).toBeCloseTo(1.48, 10);
    expect(guiltMass(beliefs(0.38))).toBeGreaterThan(guiltMass(beliefs(0.05)));
    expect(guiltMass(beliefs(0.38))).toBeGreaterThan(guiltMass(beliefs(0.74)));
  });

  it("PGA no tira, tira, no tira; MC-b y GA tiran en los tres", () => {
    const pga = POINTS.map((beta0) => choose("PGA", SENS, binding(beta0)));
    const mcb = POINTS.map((beta0) => choose("MC-b", SENS, binding(beta0)));
    const ga = POINTS.map((beta0) => choose("GA", SENS, binding(beta0)));
    expect(pga).toEqual(["dont", "roll", "dont"]);
    expect(mcb).toEqual(["roll", "roll", "roll"]);
    expect(ga).toEqual(["roll", "roll", "roll"]);
  });

  it("el euro es 5, 10, 5 para PGA y 10 plano para MC-b y para GA", () => {
    const payoff = (spec: Spec, beta0: number) => playPure(spec, beta0).stats.meanDeciderPayoff;
    expect(POINTS.map((beta0) => payoff("PGA", beta0))).toEqual([5, 10, 5]);
    expect(POINTS.map((beta0) => payoff("MC-b", beta0))).toEqual([10, 10, 10]);
    expect(POINTS.map((beta0) => payoff("GA", beta0))).toEqual([10, 10, 10]);
  });

  it("la generación usa el β₀ inyectado, y el paso siguiente vuelve a la fórmula", () => {
    const played = playPure("PGA", 0.05);
    expect(played.stats.beliefs.beta0).toBe(0.05);
    expect(played.state.beliefs.beta0).toBeCloseTo(
      priorBeta0(1, played.state.beliefs.beta1, 0),
      12,
    );
    expect(played.state.beliefs.beta0).not.toBe(0.05);
  });

  it("una corrida normal sigue derivando β₀ = φ·β₁", () => {
    const phi = 0.5;
    const result = run(
      {
        game: TRUST,
        size: 30,
        phi,
        s: 0,
        p: 1,
        w: 0.5,
        sens: SENS,
        encounters: 2,
        cap: CAP_OFF,
      },
      5,
      "formula",
      uniformPopulation(30, ["PGA", "MC-b"]),
    );
    const opening = result.history[0];
    if (opening === undefined) throw new Error("corrida sin generaciones");
    expect(opening.beliefs).toEqual(beliefsFrom(
      { acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 },
      phi,
      BETA1,
      0,
    ));
    expect(result.final.beliefs.beta0).toBeCloseTo(priorBeta0(phi, result.final.beliefs.beta1, 0), 12);
  });

  it("la grilla cobra 10 solo donde la culpa supera el hueco de 4", () => {
    for (let i = 0; i <= 15; i += 1) {
      const beta0 = i / 20;
      const rolls = choose("PGA", SENS, binding(beta0)) === "roll";
      expect(rolls).toBe(THETA * guiltMass(beliefs(beta0)) > 4);
      expect(playPure("PGA", beta0).stats.meanDeciderPayoff).toBe(rolls ? 10 : 5);
      expect(playPure("MC-b", beta0).stats.meanDeciderPayoff).toBe(10);
      expect(playPure("GA", beta0).stats.meanDeciderPayoff).toBe(10);
    }
    expect(choose("PGA", SENS, binding(0.1))).toBe("dont");
    expect(choose("PGA", SENS, binding(0.15))).toBe("roll");
    expect(choose("PGA", SENS, binding(0.65))).toBe("roll");
    expect(choose("PGA", SENS, binding(0.7))).toBe("dont");
  });

  it("con el tope prendido la cola derecha no baja: en 0.74 PGA cobra 10", () => {
    expect(guiltMass(beliefs(0.74), CAP_ON)).toBeCloseTo(13, 10);
    expect(choose("PGA", SENS, binding(0.74), CAP_ON)).toBe("roll");
    expect(playPure("PGA", 0.74, CAP_ON).stats.meanDeciderPayoff).toBe(10);
    expect(playPure("PGA", 0.05, CAP_ON).stats.meanDeciderPayoff).toBe(5);
  });

  it("en las dos colas, clavar la creencia extingue a PGA", () => {
    expect(evolvePinned(0.05, 200, "cola-baja").PGA).toBe(0);
    expect(evolvePinned(0.74, 200, "cola-alta").PGA).toBe(0);
  });
});

function evolvePinned(beta0: number, generations: number, seed: string) {
  const size = 40;
  const params = curveParams(size);
  const rng = makeRng(seed);
  let state: MoranState = {
    population: uniformPopulation(size, ["PGA", "MC-b"]),
    beliefs: beliefs(beta0),
    cells: openingCells(BETA1, beta0),
    generation: 0,
  };
  for (let generation = 0; generation < generations; generation += 1) {
    const result = step(state, params, rng);
    state = { ...result.state, beliefs: beliefs(beta0) };
  }
  return census(state.population);
}
