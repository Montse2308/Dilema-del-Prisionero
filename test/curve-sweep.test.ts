import { describe, expect, it } from "vitest";
import {
  CAP_OFF,
  TRUST,
  census,
  choose,
  encounter,
  fixatedSpec,
  guiltMass,
  makeRng,
  openingCells,
  step,
  uniformPopulation,
  type GuiltCap,
  type MoranParams,
  type MoranState,
  type Spec,
} from "../src/index.js";

const BETA1 = 0.76;
const SENS = { theta: 0.6, c: 5 };
const CAP_ON: GuiltCap = { enabled: true, outsideOption: 5 };

function binding(beta0: number) {
  return {
    promised: true,
    bindsThisPartner: true,
    partnerExpectation: BETA1,
    beliefs: { beta0, beta1: BETA1 },
  };
}

function payoff(spec: Spec, beta0: number, cap: GuiltCap) {
  const size = 8;
  const params: MoranParams = {
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
  const state: MoranState = {
    population: Array.from({ length: size }, () => spec),
    beliefs: { beta0, beta1: BETA1 },
    cells: openingCells(BETA1, beta0),
    generation: 0,
  };
  return step(state, params, makeRng("grilla")).stats.meanDeciderPayoff;
}

function evolve(beta0: number, seed: string) {
  const size = 200;
  const params: MoranParams = {
    game: TRUST,
    size,
    phi: 1,
    s: 0,
    p: 1,
    w: 0.5,
    sens: SENS,
    encounters: 4,
    cap: CAP_OFF,
    observation: "rational",
    beta1Kind: "entered",
  };
  const rng = makeRng(seed);
  let state: MoranState = {
    population: uniformPopulation(size, ["PGA", "MC-b"]),
    beliefs: { beta0, beta1: BETA1 },
    cells: openingCells(BETA1, beta0),
    generation: 0,
  };
  for (let generation = 0; generation < 400; generation += 1) {
    const result = step(state, params, rng);
    state = { ...result.state, beliefs: { beta0, beta1: BETA1 } };
  }
  return { counts: census(state.population), fixated: fixatedSpec(state.population) };
}

describe("curve measurement — excluded from the default suite", () => {
  it("grid and 400 generations", { timeout: 180_000 }, () => {
    const grid = [];
    for (let i = 0; i <= 16; i += 1) {
      const beta0 = i === 16 ? 0.76 : i / 20;
      const held = { beta0, beta1: BETA1 };
      grid.push({
        beta0,
        guilt: guiltMass(held),
        guiltCap: guiltMass(held, CAP_ON),
        pga: choose("PGA", SENS, binding(beta0)),
        mcb: choose("MC-b", SENS, binding(beta0)),
        ga: choose("GA", SENS, binding(beta0)),
        payPga: payoff("PGA", beta0, CAP_OFF),
        payMcb: payoff("MC-b", beta0, CAP_OFF),
        payGa: payoff("GA", beta0, CAP_OFF),
        payPgaCap: payoff("PGA", beta0, CAP_ON),
      });
    }

    const long = [0.05, 0.38, 0.74].map((beta0) => {
      const seeds = Array.from({ length: 20 }, (_, i) => evolve(beta0, `q9-${i}`));
      const pga = seeds.map((seed) => seed.counts.PGA);
      const sum = pga.reduce((acc, value) => acc + value, 0);
      return {
        beta0,
        meanPga: sum / seeds.length,
        minPga: Math.min(...pga),
        maxPga: Math.max(...pga),
        fixPga: seeds.filter((seed) => seed.fixated === "PGA").length,
        fixMcb: seeds.filter((seed) => seed.fixated === "MC-b").length,
        unfixed: seeds.filter((seed) => seed.fixated === null).length,
      };
    });

    const beta0 = 0.38;
    const size = 200;
    const params: MoranParams = {
      game: TRUST,
      size,
      phi: 1,
      s: 0,
      p: 1,
      w: 0.5,
      sens: SENS,
      encounters: 4,
      cap: CAP_OFF,
      observation: "rational",
      beta1Kind: "entered",
    };
    const totals: Record<Spec, { payoff: number; n: number }> = {
      SELF: { payoff: 0, n: 0 },
      GA: { payoff: 0, n: 0 },
      PGA: { payoff: 0, n: 0 },
      "MC-a": { payoff: 0, n: 0 },
      "MC-b": { payoff: 0, n: 0 },
    };
    const probe = makeRng("pago");
    const cells = openingCells(BETA1, beta0);
    for (const spec of ["PGA", "MC-b"] as const) {
      for (let k = 0; k < 400; k += 1) {
        const result = encounter(spec, params, { beta0, beta1: BETA1 }, probe, cells);
        const row = totals[spec];
        row.payoff += result.deciderPayoff;
        row.n += 1;
      }
    }

    const counts = Array.from({ length: 20 }, (_, i) => evolve(beta0, `q9-${i}`).counts.PGA);
    const extra = Array.from({ length: 40 }, (_, i) => evolve(beta0, `q9b-${i}`).counts.PGA);
    console.log(JSON.stringify({
      grid,
      long,
      pay: {
        pga: totals.PGA.payoff / totals.PGA.n,
        mcb: totals["MC-b"].payoff / totals["MC-b"].n,
      },
      counts,
      extraMean: extra.reduce((acc, value) => acc + value, 0) / extra.length,
      extraMin: Math.min(...extra),
      extraMax: Math.max(...extra),
    }));
    expect(grid.length).toBe(17);
  });
});
