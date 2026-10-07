/**
 * Exports the payoff curve against background trust to `export/curve.json`.
 *
 *   npm run export:curve
 *
 * Runs through Vitest (`vitest.export.config.ts`) because Node does not
 * rewrite the `.js` imports of `src/` to `.ts`. `npm test` does not run it.
 * Aborts if the working tree has changes outside `export/`, so that
 * `engineCommit` is the code that produced the file.
 *
 * Fields:
 *   schemaVersion  Version of this format. Bump it when a field changes meaning.
 *   provenance     engineRepo, engineCommit (`git rev-parse HEAD`), generatedAt
 *                  (ISO 8601 UTC), node (`process.version`), command, rngSeed.
 *                  The only part that is not compared by `test/curve-export.test.ts`.
 *   params         The measurement parameters, from `scripts/curve-data.ts`.
 *                  beta1 is an exact fraction.
 *                  cap is the cap used for every column but the robustness one;
 *                  capRobustness is the cap used for that one.
 *   note           What the curve is and what it is not.
 *   axis           The x axis: beta0 from 0 to beta1, as exact fractions.
 *   peak           beta0 at the guilt maximum, peakBeta0(beta1) = beta1 / 2.
 *   series         Series ids and their role: "main" or "control".
 *   grid           18 rows, ascending in beta0: 0, 0.05, …, 0.75 with the peak
 *                  (0.38) and beta1 (0.76) in place.
 *     beta0          Exact fraction over 100.
 *     guilt          guiltMass with the cap off, a(76 − a)/100 with a = beta0 in hundredths.
 *     rolls          Whether `choose` rolls, per series, with the promise binding the partner.
 *     payoff         meanDeciderPayoff of one generation in a pure population, per series.
 *                    Asserted to be an integer.
 *     robustness.payoffPgaCapOn
 *                    The PGA payoff with the cap on.
 *
 * Only ids go in the file. Labels in natural language belong to whoever renders it.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import {
  CURVE_AXIS,
  CURVE_NOTE,
  CURVE_SCHEMA_VERSION,
  buildCurveData,
} from "./curve-data.js";

const OUT_DIR = new URL("../export/", import.meta.url);
const OUT_FILE = new URL("curve.json", OUT_DIR);

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function assertCleanOutsideExport(): void {
  const dirty = git("status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => line.slice(3).split(" -> "))
    .filter((path) => !path.startsWith("export/"));
  if (dirty.length > 0) {
    throw new Error(
      `working tree has changes outside export/, engineCommit would not describe the run:\n${dirty.join("\n")}`,
    );
  }
}

it("writes export/curve.json", () => {
  assertCleanOutsideExport();
  const data = buildCurveData();
  const document = {
    schemaVersion: CURVE_SCHEMA_VERSION,
    provenance: {
      engineRepo: "Montse2308/Dilema-del-Prisionero",
      engineCommit: git("rev-parse", "HEAD").trim(),
      generatedAt: new Date().toISOString(),
      node: process.version,
      command: "npm run export:curve",
      rngSeed: data.params.seed,
    },
    params: data.params,
    note: CURVE_NOTE,
    axis: CURVE_AXIS,
    peak: data.peak,
    series: data.series,
    grid: data.grid,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(document, null, 2)}\n`);
});
