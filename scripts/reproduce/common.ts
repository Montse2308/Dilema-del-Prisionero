/**
 * Shared by the reproduction scripts in this folder.
 *
 *   npm run reproduce        every run, one after the other
 *   npm run reproduce:r1     one run (r1 … r6)
 *
 * Like `scripts/export-curve.ts`, the runs go through Vitest
 * (`vitest.reproduce.config.ts`) because Node does not rewrite the `.js`
 * imports of `src/` to `.ts`. `npm test` and CI do not run them.
 * Each run aborts if the working tree has changes outside `results/`, so
 * that `engineCommit` is the code that produced the file.
 *
 * Each run writes `results/<id>-<name>.json`:
 *   schemaVersion  Version of this format. Bump it when a field changes meaning.
 *   id             r1 … r6.
 *   claim          What the text reports for this run, as the text states it.
 *   provenance     engineRepo, engineCommit (`git rev-parse HEAD`), generatedAt
 *                  (ISO 8601 UTC), node (`process.version`), command, durationMs.
 *   params         Every parameter of the run, cap included.
 *   seeds          The seed names, in order.
 *   summary        The numbers compared against the text.
 *   runs           Final census and fixated type per seed and configuration.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  SPECS,
  TRUST,
  capForGame,
  emptyCensus,
  type Census,
  type MoranParams,
  type Spec,
} from "../../src/index.js";

export const RESULTS_SCHEMA_VERSION = 1;

export const SENS = { theta: 0.6, c: 5 };
export const BETA1_INIT = 0.76;

/**
 * Parameters shared by every run unless the run says otherwise.
 * `cap` is left out so it comes from `capForGame(TRUST)`: on, outside option 5.
 * `encounters: 2` and the uniform five-type population are those of
 * `test/motor.test.ts`; the runs that fix them say so.
 */
export function baseParams(overrides: Partial<MoranParams> = {}): MoranParams {
  return {
    game: TRUST,
    size: 200,
    phi: 0.5,
    s: 0,
    p: 1,
    w: 0.5,
    r: 0,
    sens: SENS,
    encounters: 2,
    beta1Init: BETA1_INIT,
    observation: "rational",
    beta1Kind: "entered",
    ...overrides,
  };
}

/** The parameters as plain data. The game is named by id; the cap is resolved. */
export function describeParams(params: MoranParams) {
  return {
    game: params.game.id,
    size: params.size,
    phi: params.phi,
    protocol: params.protocol ?? "unilateral",
    messages: params.messages ?? null,
    s: params.s,
    p: params.p,
    w: params.w,
    r: params.r ?? 0,
    sens: params.sens,
    encounters: params.encounters ?? 1,
    beta1Init: params.beta1Init ?? BETA1_INIT,
    observation: params.observation ?? "rational",
    beta1Kind: params.beta1Kind ?? "entered",
    cap: params.cap ?? capForGame(params.game),
    capSource: params.cap === undefined ? "capForGame" : "explicit",
  };
}

export function seedNames(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

export type SeedResult = { seed: string; counts: Census; fixated: Spec | null };

export type Summary = {
  seeds: number;
  /** Mean final count per type, over seeds. */
  meanCount: Census;
  /** Mean final share per type, in percent of N. */
  sharePct: Census;
  /** Seeds in which each type filled the population. */
  fixated: Census;
  /** Seeds in which several types still coexist. */
  unfixed: number;
};

export function summarize(results: readonly SeedResult[], size: number): Summary {
  const total = emptyCensus();
  const fixated = emptyCensus();
  let unfixed = 0;
  for (const result of results) {
    for (const spec of SPECS) total[spec] += result.counts[spec];
    if (result.fixated === null) unfixed += 1;
    else fixated[result.fixated] += 1;
  }
  const meanCount = emptyCensus();
  const sharePct = emptyCensus();
  for (const spec of SPECS) {
    meanCount[spec] = round(total[spec] / results.length, 4);
    sharePct[spec] = round((100 * total[spec]) / (results.length * size), 4);
  }
  return { seeds: results.length, meanCount, sharePct, fixated, unfixed };
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** One line per summary, for the console. */
export function formatSummary(label: string, summary: Summary, field: "meanCount" | "sharePct"): string {
  const unit = field === "sharePct" ? "%" : "";
  const cells = SPECS.map((spec) => `${spec} ${summary[field][spec].toFixed(1)}${unit}`);
  const fixed = SPECS.filter((spec) => summary.fixated[spec] > 0)
    .map((spec) => `${spec} ${summary.fixated[spec]}`)
    .join(", ");
  return `${label.padEnd(28)} ${cells.join("  ")}  | fixated: ${fixed || "none"}; unfixed ${summary.unfixed}/${summary.seeds}`;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

export function assertCleanOutsideResults(): void {
  const dirty = git("status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => line.slice(3).split(" -> "))
    .filter((path) => !path.startsWith("results/"));
  if (dirty.length > 0) {
    throw new Error(
      `working tree has changes outside results/, engineCommit would not describe the run:\n${dirty.join("\n")}`,
    );
  }
}

/** Starts the clock after checking the tree. Call `write` with what it returns. */
export function start(): { startedAt: number } {
  assertCleanOutsideResults();
  return { startedAt: performance.now() };
}

export function write(
  id: string,
  name: string,
  clock: { startedAt: number },
  body: { claim: string; params: unknown; seeds: unknown; summary: unknown; runs: unknown },
): void {
  const durationMs = Math.round(performance.now() - clock.startedAt);
  const lifecycle = process.env["npm_lifecycle_event"];
  const document = {
    schemaVersion: RESULTS_SCHEMA_VERSION,
    id,
    claim: body.claim,
    provenance: {
      engineRepo: "Montse2308/Dilema-del-Prisionero",
      engineCommit: git("rev-parse", "HEAD").trim(),
      generatedAt: new Date().toISOString(),
      node: process.version,
      command: lifecycle === undefined ? `npm run reproduce:${id}` : `npm run ${lifecycle}`,
      durationMs,
    },
    params: body.params,
    seeds: body.seeds,
    summary: body.summary,
    runs: body.runs,
  };
  const dir = new URL("../../results/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`${id}-${name}.json`, dir);
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${id}: ${(durationMs / 1000).toFixed(1)} s → results/${id}-${name}.json`);
}
