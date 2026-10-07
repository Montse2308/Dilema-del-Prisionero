/**
 * R6 — the curve as an evolutionary illustration.
 *
 *   npm run reproduce:r6
 *
 * The long runs of `test/curve-sweep.test.ts` as measured at 6f59bad,
 * unchanged. That file has been removed; this script replaces it. N = 200, 400
 * generations, 4 encounters, half PGA and half MC-b, φ = 1, s = 0, cap off,
 * and the belief put back to (β₀, 0.76) after every generation. Seeds
 * q9-0 … q9-19 at β₀ ∈ {0.05, 0.38, 0.74}, and q9b-0 … q9b-39 at 0.38 only.
 *
 * These are not the common parameters of the other runs: φ = 1 and the cap
 * off are what that test used.
 */
import { it } from "vitest";
import {
  CAP_OFF,
  TRUST,
  census,
  fixatedSpec,
  makeRng,
  openingCells,
  step,
  uniformPopulation,
  type MoranParams,
  type MoranState,
} from "../../src/index.js";
import { BETA1_INIT, SENS, describeParams, round, seedNames, start, write, type SeedResult } from "./common.js";

const SIZE = 200;
const GENERATIONS = 400;
const BETA0_VALUES = [0.05, 0.38, 0.74];
const SEEDS = seedNames("q9-", 20);
const EXTRA_BETA0 = 0.38;
const EXTRA_SEEDS = seedNames("q9b-", 40);

const PARAMS: MoranParams = {
  game: TRUST,
  size: SIZE,
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

/** `evolve` of the removed `test/curve-sweep.test.ts`. */
function evolve(beta0: number, seed: string): SeedResult {
  const rng = makeRng(seed);
  let state: MoranState = {
    population: uniformPopulation(SIZE, ["PGA", "MC-b"]),
    beliefs: { beta0, beta1: BETA1_INIT },
    cells: openingCells(BETA1_INIT, beta0),
    generation: 0,
  };
  for (let generation = 0; generation < GENERATIONS; generation += 1) {
    const result = step(state, PARAMS, rng);
    state = { ...result.state, beliefs: { beta0, beta1: BETA1_INIT } };
  }
  return { seed, counts: census(state.population), fixated: fixatedSpec(state.population) };
}

function pgaSummary(results: readonly SeedResult[]) {
  const pga = results.map((r) => r.counts.PGA);
  return {
    seeds: results.length,
    meanPga: round(pga.reduce((a, b) => a + b, 0) / pga.length, 4),
    minPga: Math.min(...pga),
    maxPga: Math.max(...pga),
    pgaExtinct: pga.filter((n) => n === 0).length,
    fixPga: results.filter((r) => r.fixated === "PGA").length,
    fixMcb: results.filter((r) => r.fixated === "MC-b").length,
    unfixed: results.filter((r) => r.fixated === null).length,
  };
}

it("R6 — curve illustration", () => {
  const clock = start();
  const lines: string[] = [];
  const summary = [];
  const runs = [];

  for (const beta0 of BETA0_VALUES) {
    const results = SEEDS.map((seed) => evolve(beta0, seed));
    const row = pgaSummary(results);
    summary.push({ batch: "q9", beta0, ...row });
    runs.push({ batch: "q9", beta0, results });
    lines.push(`q9  β₀=${beta0}  PGA mean ${row.meanPga.toFixed(2)} / ${SIZE} (min ${row.minPga}, max ${row.maxPga}); PGA extinct in ${row.pgaExtinct}/${row.seeds}; fixated PGA ${row.fixPga}, MC-b ${row.fixMcb}; unfixed ${row.unfixed}`);
  }
  const extra = EXTRA_SEEDS.map((seed) => evolve(EXTRA_BETA0, seed));
  const extraRow = pgaSummary(extra);
  summary.push({ batch: "q9b", beta0: EXTRA_BETA0, ...extraRow });
  runs.push({ batch: "q9b", beta0: EXTRA_BETA0, results: extra });
  lines.push(`q9b β₀=${EXTRA_BETA0}  PGA mean ${extraRow.meanPga.toFixed(2)} / ${SIZE} (min ${extraRow.minPga}, max ${extraRow.maxPga}); PGA extinct in ${extraRow.pgaExtinct}/${extraRow.seeds}; fixated PGA ${extraRow.fixPga}, MC-b ${extraRow.fixMcb}; unfixed ${extraRow.unfixed}`);

  console.log(["R6 — curve illustration (final PGA count over 200)", ...lines].join("\n"));
  write("r6", "curve-illustration", clock, {
    claim:
      "PGA goes extinct in 20 of 20 at β₀ = 0.05 and 0.74. At 0.38 the mean PGA count is 57.75 of 200; in the q9b batch it is 94.45.",
    params: {
      generations: GENERATIONS,
      beta0Values: BETA0_VALUES,
      extraBeta0: EXTRA_BETA0,
      run: describeParams(PARAMS),
      beta1Held: BETA1_INIT,
      initialPopulation: "half PGA, half MC-b, alternating (uniformPopulation(200, [PGA, MC-b]))",
      beliefs: "put back to (beta0, beta1Held) after every generation",
      source: "evolve() of test/curve-sweep.test.ts, as of 6f59bad; that file was removed and this script replaces it",
    },
    seeds: { q9: SEEDS, q9b: EXTRA_SEEDS },
    summary,
    runs,
  });
});
