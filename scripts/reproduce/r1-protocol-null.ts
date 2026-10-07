/**
 * R1 — the null of the protocol.
 *
 *   npm run reproduce:r1
 *
 * Unilateral against reciprocal at s ∈ {0, 0.25, 0.5}. The reciprocal mix puts
 * 0.25 in each of the four cells, so the decider promises with probability 0.5,
 * the same φ as the unilateral run. Both open the way `run()` opens them: cells
 * in which the decider promised at 0.76, the others at the prior φ·β₁.
 *
 * N = 200, 400 generations, 4 encounters per agent, seeds r10-0 … r10-19.
 * Initial population: `run()`'s default, uniform over the five types.
 */
import { it } from "vitest";
import { census, run, uniformPopulation, type MessageMix, type Protocol } from "../../src/index.js";
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
const S_VALUES = [0, 0.25, 0.5];
const SEEDS = seedNames("r10-", 20);
const EVEN: MessageMix = { agreement: 0.25, deciderOnly: 0.25, partnerOnly: 0.25, none: 0.25 };
const PROTOCOLS: Protocol[] = ["unilateral", "reciprocal"];

function paramsFor(protocol: Protocol, s: number) {
  return baseParams({
    s,
    encounters: 4,
    protocol,
    ...(protocol === "reciprocal" ? { messages: EVEN } : {}),
  });
}

it("R1 — protocol null", () => {
  const clock = start();
  const lines: string[] = [];
  const summary = [];
  const runs = [];

  for (const s of S_VALUES) {
    const bySeed: Record<Protocol, SeedResult[]> = { unilateral: [], reciprocal: [] };
    let samePopulation = 0;
    let sameTrajectory = 0;
    for (const seed of SEEDS) {
      const [a, b] = PROTOCOLS.map((protocol) => run(paramsFor(protocol, s), GENERATIONS, seed));
      if (a === undefined || b === undefined) throw new Error("missing run");
      bySeed.unilateral.push({ seed, counts: a.counts, fixated: a.fixated });
      bySeed.reciprocal.push({ seed, counts: b.counts, fixated: b.fixated });
      const population = a.final.population.every((spec, i) => spec === b.final.population[i]);
      const trajectory = a.history.every((row, g) => {
        const other = b.history[g];
        return other !== undefined && JSON.stringify(row.counts) === JSON.stringify(other.counts);
      });
      if (population) samePopulation += 1;
      if (trajectory) sameTrajectory += 1;
    }
    const unilateral = summarize(bySeed.unilateral, 200);
    const reciprocal = summarize(bySeed.reciprocal, 200);
    summary.push({
      s,
      unilateral,
      reciprocal,
      seedsWithSameFinalPopulation: samePopulation,
      seedsWithSameCensusEveryGeneration: sameTrajectory,
    });
    runs.push({ s, ...bySeed });
    lines.push(formatSummary(`s=${s} unilateral`, unilateral, "meanCount"));
    lines.push(formatSummary(`s=${s} reciprocal`, reciprocal, "meanCount"));
    lines.push(`${"".padEnd(28)} same final population in ${samePopulation}/${SEEDS.length} seeds; same census every generation in ${sameTrajectory}/${SEEDS.length}`);
  }

  console.log(["R1 — protocol null (mean final count over 200)", ...lines].join("\n"));
  write("r1", "protocol-null", clock, {
    claim:
      "Both protocols give the same population seed by seed. Mean final count over 200: s = 0 → GA 57.0, PGA 49.4, MC-a 30.8, MC-b 62.9; s = 0.25 → PGA 112.4, MC-b 87.6; s = 0.5 → GA 133.9, MC-a 66.2.",
    params: {
      generations: GENERATIONS,
      sValues: S_VALUES,
      unilateral: describeParams(paramsFor("unilateral", 0)),
      reciprocal: describeParams(paramsFor("reciprocal", 0)),
      initialPopulation: "uniform over SELF, GA, PGA, MC-a, MC-b (run() default)",
      opening: "run() default: cells where the decider promised at beta1Init, the others at phi * beta1Init",
      initialCensus: census(uniformPopulation(200)),
    },
    seeds: SEEDS,
    summary,
    runs,
  });
});
