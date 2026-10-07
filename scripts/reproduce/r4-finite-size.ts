/**
 * R4 — finite-size scaling at s = 0.42.
 *
 *   npm run reproduce:r4
 *
 * N ∈ {100, 200, 400}, with the seeds and configuration of R3: s-axis-0 …
 * s-axis-199, 400 generations, 4 encounters, uniform five-type population.
 * N = 200 is therefore the s = 0.42 row of R3.
 */
import { it } from "vitest";
import { run } from "../../src/index.js";
import {
  CONFIG_NOTE,
  baseParams,
  describeParams,
  formatShare,
  seedNames,
  start,
  summarize,
  write,
  type SeedResult,
} from "./common.js";

const GENERATIONS = 400;
const ENCOUNTERS = 4;
const S = 0.42;
const SIZES = [100, 200, 400];
const SEEDS = seedNames("s-axis-", 200);

function paramsFor(size: number) {
  return baseParams({ s: S, size, encounters: ENCOUNTERS });
}

/** True if every step moves in the given direction, strictly. */
function monotone(values: readonly number[], direction: 1 | -1): boolean {
  return values.every((value, i) => i === 0 || direction * (value - values[i - 1]!) > 0);
}

it("R4 — finite-size scaling", () => {
  const clock = start();
  const lines: string[] = [];
  const summary = [];
  const runs = [];

  for (const size of SIZES) {
    const results: SeedResult[] = SEEDS.map((seed) => {
      const result = run(paramsFor(size), GENERATIONS, seed);
      return { seed, counts: result.counts, fixated: result.fixated };
    });
    const row = summarize(results, size);
    summary.push({ size, ...row });
    runs.push({ size, results });
    lines.push(
      `N=${String(size).padEnd(4)} PGA ${formatShare(row, "PGA")} | PGA extinct in ${row.extinct.PGA}/${row.seeds} | unfixed ${row.unfixed}/${row.seeds}`,
    );
  }

  const checks = {
    pgaShareRisesAtEveryStep: monotone(summary.map((row) => row.sharePct.PGA), 1),
    pgaExtinctFallsAtEveryStep: monotone(summary.map((row) => row.extinct.PGA), -1),
    unfixedRisesAtEveryStep: monotone(summary.map((row) => row.unfixed), 1),
  };

  console.log(
    [
      `R4 — finite-size scaling at s = ${S} (PGA share, % of N, ± 95 % interval; ${SEEDS.length} seeds)`,
      ...lines,
      `PGA share rises at every step: ${checks.pgaShareRisesAtEveryStep}; PGA extinct falls at every step: ${checks.pgaExtinctFallsAtEveryStep}; unfixed rises at every step: ${checks.unfixedRisesAtEveryStep}`,
    ].join("\n"),
  );
  write("r4", "finite-size", clock, {
    claim:
      "At s = 0.42, as N goes from 100 to 200 to 400, PGA goes extinct in 158, 71 and 22 of 200 runs, unfixed runs go from 5 to 79 to 157, and the mean share of PGA rises from 19.7 to 43.0 to 47.4%.",
    configNote: CONFIG_NOTE,
    params: {
      generations: GENERATIONS,
      s: S,
      sizes: SIZES,
      run: describeParams(paramsFor(200)),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default)",
      seedsNote: "the R3 seeds",
    },
    seeds: SEEDS,
    summary: { bySize: summary, checks },
    runs,
  });
});
