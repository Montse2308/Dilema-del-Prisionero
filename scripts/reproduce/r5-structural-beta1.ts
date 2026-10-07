/**
 * R5 — structural β₁ against entered β₁, at s = 0.60 and s = 1.
 *
 *   npm run reproduce:r5
 *
 * Same configuration as R3: N = 200, 400 generations, 4 encounters, uniform
 * five-type population, seeds s-axis-0 … s-axis-199. Only `beta1Kind` changes.
 */
import { it } from "vitest";
import { run, type Beta1Kind } from "../../src/index.js";
import {
  CONFIG_NOTE,
  PENDING_CLAIM,
  baseParams,
  describeParams,
  formatShare,
  formatSummary,
  seedNames,
  start,
  summarize,
  write,
  type SeedResult,
} from "./common.js";

const GENERATIONS = 400;
const ENCOUNTERS = 4;
const S_VALUES = [0.6, 1];
const KINDS: Beta1Kind[] = ["structural", "entered"];
const SEEDS = seedNames("s-axis-", 200);

function paramsFor(s: number, beta1Kind: Beta1Kind) {
  return baseParams({ s, beta1Kind, encounters: ENCOUNTERS });
}

it("R5 — structural β₁", () => {
  const clock = start();
  const lines: string[] = [];
  const headline: string[] = [];
  const summary = [];
  const runs = [];

  for (const beta1Kind of KINDS) {
    for (const s of S_VALUES) {
      const results: SeedResult[] = SEEDS.map((seed) => {
        const result = run(paramsFor(s, beta1Kind), GENERATIONS, seed);
        return { seed, counts: result.counts, fixated: result.fixated };
      });
      const row = summarize(results, 200);
      summary.push({ beta1Kind, s, ...row });
      runs.push({ beta1Kind, s, results });
      lines.push(formatSummary(`${beta1Kind} s=${s}`, row, "sharePct"));
      headline.push(`${`${beta1Kind} s=${s}`.padEnd(18)} GA ${formatShare(row, "GA")}   MC-a ${formatShare(row, "MC-a")}`);
    }
  }

  console.log(
    [
      `R5 — structural against entered β₁ (mean final share, % of N = 200, ± 95 % interval; ${SEEDS.length} seeds)`,
      ...headline,
      "",
      ...lines,
    ].join("\n"),
  );
  write("r5", "structural-beta1", clock, {
    claim: PENDING_CLAIM,
    configNote: CONFIG_NOTE,
    params: {
      generations: GENERATIONS,
      sValues: S_VALUES,
      beta1Kinds: KINDS,
      run: describeParams(paramsFor(0.6, "structural")),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default)",
      seedsNote: "the R3 seeds",
    },
    seeds: SEEDS,
    summary,
    runs,
  });
});
