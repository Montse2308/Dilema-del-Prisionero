/**
 * R3 — the s axis.
 *
 *   npm run reproduce:r3
 *
 * N = 200, 400 generations, 4 encounters per agent, uniform five-type
 * population, 200 seeds per s: s-axis-0 … s-axis-199. The encounters and seeds
 * of the original exploratory runs were not recorded; these are the runs the
 * working paper reports.
 */
import { it } from "vitest";
import { run } from "../../src/index.js";
import {
  CONFIG_NOTE,
  baseParams,
  describeParams,
  formatShare,
  formatSummary,
  seedNames,
  start,
  summarize,
  write,
  type SeedResult,
  type Summary,
} from "./common.js";

const GENERATIONS = 400;
const ENCOUNTERS = 4;
const S_GRID = [0, 0.25, 0.4, 0.42, 0.44, 0.49, 0.5, 0.75, 1];
const SEEDS = seedNames("s-axis-", 200);

function paramsFor(s: number) {
  return baseParams({ s, encounters: ENCOUNTERS });
}

it("R3 — s axis", () => {
  const clock = start();
  const lines: string[] = [];
  const summary: Array<{ s: number } & Summary> = [];
  const runs = [];
  const finals = new Map<number, string[][]>();

  for (const s of S_GRID) {
    const populations: string[][] = [];
    const results: SeedResult[] = SEEDS.map((seed) => {
      const result = run(paramsFor(s), GENERATIONS, seed);
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
  const at = (s: number) => summary.find((row) => row.s === s)!;
  const checks = {
    mcbFixatedAt049: at(0.49).fixated["MC-b"],
    mcbFixatedAt050: at(0.5).fixated["MC-b"],
    mcbExtinctAt050: at(0.5).extinct["MC-b"],
    sameFinalPopulation050vs075: same(0.5, 0.75),
    sameFinalPopulation050vs1: same(0.5, 1),
    pgaSharePct: { "0.40": at(0.4).sharePct.PGA, "0.42": at(0.42).sharePct.PGA, "0.44": at(0.44).sharePct.PGA },
  };

  const n = SEEDS.length;
  console.log(
    [
      `R3 — s axis (mean final share, % of N = 200, ± 95 % interval; ${n} seeds)`,
      ...lines,
      `MC-b fixated at 0.49 in ${checks.mcbFixatedAt049}/${n}; at 0.50 in ${checks.mcbFixatedAt050}/${n} (extinct in ${checks.mcbExtinctAt050}/${n})`,
      `same final population, seed by seed: 0.50 vs 0.75 in ${checks.sameFinalPopulation050vs075}/${n}, 0.50 vs 1 in ${checks.sameFinalPopulation050vs1}/${n}`,
      `PGA share: 0.40 ${formatShare(at(0.4), "PGA")}, 0.42 ${formatShare(at(0.42), "PGA")}, 0.44 ${formatShare(at(0.44), "PGA")}`,
    ].join("\n"),
  );
  write("r3", "s-axis", clock, {
    claim:
      "With N = 200, 400 generations, 4 encounters and 200 seeds: MC-b fixes in all seeds at s = 0.49 and in none at 0.50; 0.50, 0.75 and 1 give the same population; the share of PGA falls from 53.3% at 0.40 and 43.0% at 0.42 to 4.8% at 0.44 and 0 at 0.49.",
    configNote: CONFIG_NOTE,
    params: {
      generations: GENERATIONS,
      sGrid: S_GRID,
      run: describeParams(paramsFor(0)),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default)",
    },
    seeds: SEEDS,
    summary: { bySValue: summary, checks },
    runs,
  });
});
