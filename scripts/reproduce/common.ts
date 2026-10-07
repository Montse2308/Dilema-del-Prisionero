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
 *   claim          What the working paper states for this run.
 *   configNote     Present when the configuration of the original exploratory
 *                  runs was not recorded and this run fixes it.
 *   provenance     engineRepo, engineCommit (`git rev-parse HEAD`), generatedAt
 *                  (ISO 8601 UTC), node (`process.version`), command, durationMs.
 *   params         Every parameter of the run, cap included.
 *   seeds          The seed names, in order.
 *   summary        Per type: mean final count, mean final share in % of N with
 *                  its 95 % interval, seeds in which the type went extinct,
 *                  fixations, and unfixed runs.
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

export const RESULTS_SCHEMA_VERSION = 2;

export const SENS = { theta: 0.6, c: 5 };
export const BETA1_INIT = 0.76;

/**
 * Parameters shared by every run unless the run says otherwise.
 * `cap` is left out so it comes from `capForGame(TRUST)`: on, outside option 5.
 * `encounters: 2` and the uniform five-type population are those of
 * `test/motor.test.ts`. Every run here sets its own encounters: 4 in all of them.
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
  /**
   * Half-width of the 95 % interval of sharePct: 1.96 · sd / √seeds, with sd
   * the sample standard deviation (n − 1) of each seed's final share.
   */
  sharePctCi95: Census;
  /** Seeds in which the type ended with 0 agents. */
  extinct: Census;
  /** Seeds in which each type filled the population. */
  fixated: Census;
  /** Seeds in which several types still coexist. */
  unfixed: number;
};

export function summarize(results: readonly SeedResult[], size: number): Summary {
  const n = results.length;
  const meanCount = emptyCensus();
  const sharePct = emptyCensus();
  const sharePctCi95 = emptyCensus();
  const extinct = emptyCensus();
  const fixated = emptyCensus();
  let unfixed = 0;
  for (const result of results) {
    if (result.fixated === null) unfixed += 1;
    else fixated[result.fixated] += 1;
  }
  for (const spec of SPECS) {
    const shares = results.map((result) => (100 * result.counts[spec]) / size);
    const mean = shares.reduce((acc, value) => acc + value, 0) / n;
    const variance = n > 1 ? shares.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (n - 1) : 0;
    meanCount[spec] = round((mean * size) / 100, 4);
    sharePct[spec] = round(mean, 4);
    sharePctCi95[spec] = round((1.96 * Math.sqrt(variance)) / Math.sqrt(n), 4);
    extinct[spec] = results.filter((result) => result.counts[spec] === 0).length;
  }
  return { seeds: n, meanCount, sharePct, sharePctCi95, extinct, fixated, unfixed };
}

/** "36.50 ± 4.10 %" for one type. */
export function formatShare(summary: Summary, spec: Spec): string {
  return `${summary.sharePct[spec].toFixed(2)} ± ${summary.sharePctCi95[spec].toFixed(2)} %`;
}

/** For the runs whose original configuration was not recorded. */
export const CONFIG_NOTE =
  "the encounters and seeds of the original exploratory runs were not recorded; these runs fix 4 encounters, as the engine cut and R1, and 200 seeds";

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Two lines per summary, for the console: the mean per type (count, or share
 * with its 95 % interval), then extinctions, fixations, and unfixed runs.
 */
export function formatSummary(label: string, summary: Summary, field: "meanCount" | "sharePct"): string {
  const cells = SPECS.map((spec) =>
    field === "sharePct" ? `${spec} ${formatShare(summary, spec)}` : `${spec} ${summary.meanCount[spec].toFixed(2)}`,
  );
  const listed = (census: Census) =>
    SPECS.filter((spec) => census[spec] > 0)
      .map((spec) => `${spec} ${census[spec]}`)
      .join(", ") || "none";
  return [
    `${label.padEnd(28)} ${cells.join("  ")}`,
    `${"".padEnd(28)} extinct: ${listed(summary.extinct)} | fixated: ${listed(summary.fixated)} | unfixed ${summary.unfixed}/${summary.seeds}`,
  ].join("\n");
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
  body: { claim: string; configNote?: string; params: unknown; seeds: unknown; summary: unknown; runs: unknown },
): void {
  const durationMs = Math.round(performance.now() - clock.startedAt);
  const lifecycle = process.env["npm_lifecycle_event"];
  const document = {
    schemaVersion: RESULTS_SCHEMA_VERSION,
    id,
    claim: body.claim,
    ...(body.configNote === undefined ? {} : { configNote: body.configNote }),
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
