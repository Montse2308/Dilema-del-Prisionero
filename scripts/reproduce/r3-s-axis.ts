/**
 * R3 — the s axis.
 *
 *   npm run reproduce:r3
 *
 * N = 200, 400 generations, 20 seeds per s. The original seed names are not
 * documented; these are s-axis-0 … s-axis-19. The record gives 400–500
 * generations; this run uses 400. Encounters and the initial population are
 * not given either: they are those of `test/motor.test.ts`, 2 encounters and
 * a uniform five-type population.
 */
import { it } from "vitest";
import { run } from "../../src/index.js";
import {
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
const S_GRID = [0, 0.25, 0.4, 0.42, 0.44, 0.49, 0.5, 0.75, 1];
const SEEDS = seedNames("s-axis-", 20);

it("R3 — s axis", () => {
  const clock = start();
  const lines: string[] = [];
  const summary = [];
  const runs = [];
  const finals = new Map<number, string[][]>();

  for (const s of S_GRID) {
    const populations: string[][] = [];
    const results: SeedResult[] = SEEDS.map((seed) => {
      const result = run(baseParams({ s }), GENERATIONS, seed);
      populations.push(result.final.population);
      return { seed, counts: result.counts, fixated: result.fixated };
    });
    finals.set(s, populations);
    const row = summarize(results, 200);
    summary.push({ s, ...row });
    runs.push({ s, results });
    lines.push(formatSummary(`s=${s}`, row, "sharePct"));
  }

  const same = (a: number, b: number) => {
    const x = finals.get(a)!;
    const y = finals.get(b)!;
    return x.filter((pop, i) => pop.every((spec, k) => spec === y[i]![k])).length;
  };
  const identical = {
    "0.5 vs 0.75": same(0.5, 0.75),
    "0.5 vs 1": same(0.5, 1),
  };

  console.log(
    [
      "R3 — s axis (mean final share, % of N = 200)",
      ...lines,
      `same final population, seed by seed: 0.50 vs 0.75 in ${identical["0.5 vs 0.75"]}/20, 0.50 vs 1 in ${identical["0.5 vs 1"]}/20`,
    ].join("\n"),
  );
  write("r3", "s-axis", clock, {
    claim:
      "MC-b fixates in 20 of 20 at s = 0.49 and disappears at s = 0.50. At 0.50, 0.75 and 1 the result is identical. The PGA share falls toward 0 near 0.42–0.44 (reference measured with other seeds at 0f920ab: PGA 31.7 % at 0.42 and 0.1 % at 0.44).",
    params: {
      generations: GENERATIONS,
      generationsNote: "the record says 400–500; this run uses 400",
      sGrid: S_GRID,
      run: describeParams(baseParams()),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default, as test/motor.test.ts)",
      encountersNote: "not given for this run; 2, as test/motor.test.ts",
      seedsNote: "the original seed names are not documented",
    },
    seeds: SEEDS,
    summary: { bySValue: summary, seedsWithSameFinalPopulation: identical },
    runs,
  });
});
