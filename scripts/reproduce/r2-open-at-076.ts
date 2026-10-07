/**
 * R2 — the reciprocal protocol of R1, with all four cells opening at 0.76.
 *
 *   npm run reproduce:r2
 *
 * `run()` always opens with `openingCells`, so this run builds the same first
 * state by hand and loops `step`, with only the cells changed. Before the
 * measurement, the same loop with `openingCells` is checked against `run()`
 * on the first seed of each s; if they differ, the run aborts.
 *
 * N = 200, 400 generations, 4 encounters per agent, seeds r10-0 … r10-19.
 */
import { it } from "vitest";
import {
  SPECS,
  beliefsFrom,
  census,
  fixatedSpec,
  initialCells,
  makeRng,
  openingCells,
  priorBeta0,
  run,
  step,
  uniformPopulation,
  type CellBeliefs,
  type MessageMix,
  type MoranParams,
  type MoranState,
} from "../../src/index.js";
import {
  BETA1_INIT,
  baseParams,
  describeParams,
  formatSummary,
  seedNames,
  start,
  summarize,
  write,
  type SeedResult,
} from "./common.js";

const GENERATIONS = 400;
const S_VALUES = [0, 0.25, 0.5];
const SEEDS = seedNames("r10-", 20);
const EVEN: MessageMix = { agreement: 0.25, deciderOnly: 0.25, partnerOnly: 0.25, none: 0.25 };
const PHI = EVEN.agreement + EVEN.deciderOnly;

function paramsFor(s: number): MoranParams {
  return baseParams({ s, encounters: 4, protocol: "reciprocal", messages: EVEN });
}

/** `run()` with the opening cells as an argument. Same stream, same first state otherwise. */
function runWithCells(params: MoranParams, generations: number, seed: string, cells: CellBeliefs) {
  const rng = makeRng(seed);
  const r = params.r ?? 0;
  let state: MoranState = {
    population: uniformPopulation(params.size, SPECS),
    beliefs: beliefsFrom({ acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 }, PHI, BETA1_INIT, r),
    cells,
    generation: 0,
  };
  for (let g = 0; g < generations; g += 1) state = step(state, params, rng).state;
  return { counts: census(state.population), fixated: fixatedSpec(state.population), population: state.population };
}

it("R2 — reciprocal, every cell opens at 0.76", () => {
  const clock = start();

  for (const s of S_VALUES) {
    const params = paramsFor(s);
    const seed = SEEDS[0]!;
    const harness = runWithCells(params, GENERATIONS, seed, openingCells(BETA1_INIT, priorBeta0(PHI, BETA1_INIT, 0)));
    const reference = run(params, GENERATIONS, seed);
    if (!harness.population.every((spec, i) => spec === reference.final.population[i])) {
      throw new Error(`the hand-built loop does not reproduce run() at s = ${s}, seed ${seed}`);
    }
  }

  const lines: string[] = [];
  const summary = [];
  const runs = [];
  for (const s of S_VALUES) {
    const results: SeedResult[] = SEEDS.map((seed) => {
      const { counts, fixated } = runWithCells(paramsFor(s), GENERATIONS, seed, initialCells(BETA1_INIT));
      return { seed, counts, fixated };
    });
    const row = summarize(results, 200);
    summary.push({ s, ...row });
    runs.push({ s, results });
    lines.push(formatSummary(`s=${s} reciprocal, all 0.76`, row, "meanCount"));
  }

  console.log(["R2 — reciprocal, every cell opens at 0.76 (mean final count over 200)", ...lines].join("\n"));
  write("r2", "open-at-076", clock, {
    claim: "GA fixates in 20 of 20 seeds at s = 0, 0.25 and 0.5.",
    params: {
      generations: GENERATIONS,
      sValues: S_VALUES,
      run: describeParams(paramsFor(0)),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (as run())",
      opening: "all four cells at beta1Init",
      harnessCheck: "the same loop with openingCells reproduces run() on the first seed of each s",
    },
    seeds: SEEDS,
    summary,
    runs,
  });
});
