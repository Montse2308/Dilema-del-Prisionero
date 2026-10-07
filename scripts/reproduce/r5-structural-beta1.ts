/**
 * R5 — structural β₁ against entered β₁, at s = 0.60 and s = 1.
 *
 *   npm run reproduce:r5
 *
 * Same configuration as R3: N = 200, 400 generations, 2 encounters, uniform
 * five-type population, seeds s-axis-0 … s-axis-19. Only `beta1Kind` changes.
 */
import { it } from "vitest";
import { run, type Beta1Kind } from "../../src/index.js";
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
const S_VALUES = [0.6, 1];
const KINDS: Beta1Kind[] = ["structural", "entered"];
const SEEDS = seedNames("s-axis-", 20);

it("R5 — structural β₁", () => {
  const clock = start();
  const lines: string[] = [];
  const summary = [];
  const runs = [];

  for (const beta1Kind of KINDS) {
    for (const s of S_VALUES) {
      const results: SeedResult[] = SEEDS.map((seed) => {
        const result = run(baseParams({ s, beta1Kind }), GENERATIONS, seed);
        return { seed, counts: result.counts, fixated: result.fixated };
      });
      const row = summarize(results, 200);
      summary.push({ beta1Kind, s, ...row });
      runs.push({ beta1Kind, s, results });
      lines.push(formatSummary(`${beta1Kind} s=${s}`, row, "sharePct"));
    }
  }

  console.log(["R5 — structural against entered β₁ (mean final share, % of N = 200)", ...lines].join("\n"));
  write("r5", "structural-beta1", clock, {
    claim: "With structural β₁, GA 11.0 % at s = 0.60 and 5.2 % at s = 1. With entered β₁, 51.6 % and 48.4 %.",
    params: {
      generations: GENERATIONS,
      sValues: S_VALUES,
      beta1Kinds: KINDS,
      run: describeParams(baseParams({ s: 0.6 })),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default)",
      encountersNote: "not given for this run; 2, as R3",
      seedsNote: "the original seed names are not documented; the R3 seeds are reused",
    },
    seeds: SEEDS,
    summary,
    runs,
  });
});
