/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  CURVE_AXIS,
  CURVE_NOTE,
  CURVE_SCHEMA_VERSION,
  buildCurveData,
  measureRow,
  type CurveRow,
} from "../scripts/curve-data.js";

/**
 * Regression on `export/curve.json`: the data recomputed from the kernel must
 * match the committed file in everything but `provenance`.
 *
 * The file is loaded with a glob so the suite still typechecks and runs before
 * the first export exists; in that case the comparison is skipped, not passed.
 */

const found = import.meta.glob("../export/curve.json", { eager: true, import: "default" });
const exported = found["../export/curve.json"] as Record<string, unknown> | undefined;

const data = buildCurveData();

function row(a: number): CurveRow {
  const hit = data.grid.find((r) => r.beta0.num === a && r.beta0.den === 100);
  if (hit === undefined) throw new Error(`beta0 = ${a}/100 is not on the grid`);
  return hit;
}

describe("exported curve", () => {
  it.skipIf(exported === undefined)("matches export/curve.json except provenance", () => {
    const { provenance: _provenance, ...rest } = exported ?? {};
    expect(rest).toStrictEqual({
      schemaVersion: CURVE_SCHEMA_VERSION,
      params: data.params,
      note: CURVE_NOTE,
      axis: CURVE_AXIS,
      peak: data.peak,
      series: data.series,
      grid: data.grid,
    });
  });

  it("has 18 rows, the steps of 0.05 then the peak and beta1", () => {
    expect(data.grid.map((r) => r.beta0.num)).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 38, 76,
    ]);
    expect(data.peak).toEqual({ num: 38, den: 100 });
  });

  it("PGA pays 5 at 0.05 and 0.74 and 10 at the peak", () => {
    expect(row(5).payoff.PGA).toBe(5);
    expect(measureRow(74).payoff.PGA).toBe(5);
    expect(row(38).payoff.PGA).toBe(10);
  });

  it("MC-b and GA pay 10 on every row", () => {
    for (const r of data.grid) {
      expect(r.payoff["MC-b"]).toBe(10);
      expect(r.payoff.GA).toBe(10);
    }
  });

  it("the PGA window on the 0.05 grid is 0.15–0.65, with the peak inside", () => {
    const steps = data.grid.filter((r) => r.beta0.num % 5 === 0);
    const window = steps.filter((r) => r.payoff.PGA === 10).map((r) => r.beta0.num);
    expect(window).toEqual([15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65]);
    expect(row(38).payoff.PGA).toBe(10);
  });

  it("with the cap on, PGA pays 10 at 0.70, 0.74, 0.75 and 0.76", () => {
    expect(row(70).robustness.payoffPgaCapOn).toBe(10);
    expect(measureRow(74).robustness.payoffPgaCapOn).toBe(10);
    expect(row(75).robustness.payoffPgaCapOn).toBe(10);
    expect(row(76).robustness.payoffPgaCapOn).toBe(10);
  });
});
