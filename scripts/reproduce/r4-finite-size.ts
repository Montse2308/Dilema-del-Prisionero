/**
 * R4 — finite-size scaling at s = 0.42.
 *
 *   npm run reproduce:r4
 *
 * N ∈ {100, 200, 400}, 20 seeds each, the same seeds and configuration as R3
 * (s-axis-0 … s-axis-19, 400 generations, 2 encounters, uniform five-type
 * population). N = 200 is therefore the s = 0.42 row of R3.
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
const S = 0.42;
const SIZES = [100, 200, 400];
const SEEDS = seedNames("s-axis-", 20);

it("R4 — finite-size scaling", () => {
  const clock = start();
  const lines: string[] = [];
  const summary = [];
  const runs = [];

  for (const size of SIZES) {
    const results: SeedResult[] = SEEDS.map((seed) => {
      const result = run(baseParams({ s: S, size }), GENERATIONS, seed);
      return { seed, counts: result.counts, fixated: result.fixated };
    });
    const row = summarize(results, size);
    summary.push({ size, ...row });
    runs.push({ size, results });
    lines.push(formatSummary(`N=${size}`, row, "sharePct"));
  }

  const pga = summary.map((row) => row.sharePct.PGA);
  const rises = pga.every((value, i) => i === 0 || value > pga[i - 1]!);
  console.log(
    [
      `R4 — finite-size scaling at s = ${S} (mean final share, % of N)`,
      ...lines,
      `PGA share by N: ${pga.map((v) => v.toFixed(2)).join(" → ")} %; rises with N: ${rises}`,
    ].join("\n"),
  );
  write("r4", "finite-size", clock, {
    claim:
      "PGA share 15.0 → 31.7 → 56.0 % for N = 100, 200, 400, and unfixed runs from 0 to 10 of 20. What the text needs is that it rises with N.",
    params: {
      generations: GENERATIONS,
      s: S,
      sizes: SIZES,
      run: describeParams(baseParams({ s: S })),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default)",
      encountersNote: "not given for this run; 2, as R3",
      seedsNote: "the original seed names are not documented; the R3 seeds are reused",
    },
    seeds: SEEDS,
    summary: { bySize: summary, pgaShareRisesWithN: rises },
    runs,
  });
});
