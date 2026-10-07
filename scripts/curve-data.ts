import {
  CAP_OFF,
  TRUST,
  choose,
  guiltMass,
  makeRng,
  openingCells,
  peakBeta0,
  step,
  type GuiltCap,
  type MatchState,
  type MoranParams,
  type MoranState,
  type Spec,
} from "../src/index.js";

/**
 * The payoff curve against background trust, as data.
 *
 * The grid that `test/curve-sweep.test.ts` printed before it was removed, with
 * the same measurement and parameters. Pure: no Node builtins, no clock, no I/O.
 * Every number is either an exact fraction over 100 or an asserted integer.
 */

export type Fraction = { num: number; den: number };

export type CurveRow = {
  beta0: Fraction;
  guilt: Fraction;
  rolls: Record<CurveSpec, boolean>;
  payoff: Record<CurveSpec, number>;
  robustness: { payoffPgaCapOn: number };
};

export const CURVE_SPECS = ["PGA", "MC-b", "GA"] as const satisfies readonly Spec[];
export type CurveSpec = (typeof CURVE_SPECS)[number];

export const CURVE_SCHEMA_VERSION = 1;
export const CURVE_NOTE =
  "Comparison across worlds with background trust held fixed at each value; not a trajectory of one population.";

const DEN = 100;
const BETA1_HUNDREDTHS = 76;
const BETA1 = BETA1_HUNDREDTHS / DEN;
const SENS = { theta: 0.6, c: 5 };
const SIZE = 8;
const SEED = "grilla";
const CAP_ON: GuiltCap = { enabled: true, outsideOption: 5 };

export const CURVE_AXIS = {
  id: "beta0",
  min: { num: 0, den: DEN },
  max: { num: BETA1_HUNDREDTHS, den: DEN },
} as const;

function params(cap: GuiltCap): MoranParams {
  return {
    game: TRUST,
    size: SIZE,
    phi: 1,
    s: 0,
    p: 1,
    w: 0.5,
    r: 0,
    sens: SENS,
    encounters: 1,
    cap,
    observation: "rational",
    beta1Kind: "entered",
  };
}

function binding(beta0: number): MatchState {
  return {
    promised: true,
    bindsThisPartner: true,
    partnerExpectation: BETA1,
    beliefs: { beta0, beta1: BETA1 },
  };
}

function payoff(spec: Spec, beta0: number, cap: GuiltCap): number {
  const state: MoranState = {
    population: Array.from({ length: SIZE }, () => spec),
    beliefs: { beta0, beta1: BETA1 },
    cells: openingCells(BETA1, beta0),
    generation: 0,
  };
  const value = step(state, params(cap), makeRng(SEED)).stats.meanDeciderPayoff;
  if (!Number.isInteger(value)) {
    throw new Error(`payoff of ${spec} at beta0 = ${beta0} is not an integer: ${value}`);
  }
  return value;
}

function peakHundredths(): number {
  const peak = peakBeta0(BETA1);
  const a = Math.round(peak * DEN);
  if (Math.abs(a / DEN - peak) >= 1e-12) {
    throw new Error(`peak ${peak} is not a whole number of hundredths`);
  }
  return a;
}

/** One row of the curve at β₀ = a/100. Exported so the test can probe points off the grid. */
export function measureRow(a: number): CurveRow {
  if (!Number.isInteger(a) || a < 0 || a > BETA1_HUNDREDTHS) {
    throw new RangeError(`beta0 must be a whole number of hundredths in [0, ${BETA1_HUNDREDTHS}]`);
  }
  const beta0 = a / DEN;
  const guiltNum = a * (BETA1_HUNDREDTHS - a);
  const mass = guiltMass({ beta0, beta1: BETA1 }, CAP_OFF);
  if (!(Math.abs(mass - guiltNum / DEN) < 1e-9)) {
    throw new Error(`guiltMass at beta0 = ${beta0} is ${mass}, expected ${guiltNum}/${DEN}`);
  }

  const rolls = {} as Record<CurveSpec, boolean>;
  const pay = {} as Record<CurveSpec, number>;
  for (const spec of CURVE_SPECS) {
    rolls[spec] = choose(spec, SENS, binding(beta0)) === "roll";
    pay[spec] = payoff(spec, beta0, CAP_OFF);
  }

  return {
    beta0: { num: a, den: DEN },
    guilt: { num: guiltNum, den: DEN },
    rolls,
    payoff: pay,
    robustness: { payoffPgaCapOn: payoff("PGA", beta0, CAP_ON) },
  };
}

/** β₀ in hundredths, ascending: 0, 5, …, 75 with the peak (38) and β₁ (76) in place. */
export function gridHundredths(): number[] {
  const steps = Array.from({ length: 16 }, (_, i) => i * 5);
  return [...steps, peakHundredths(), BETA1_HUNDREDTHS].sort((x, y) => x - y);
}

export function buildCurveData() {
  return {
    params: {
      game: TRUST.id,
      sens: SENS,
      beta1: { num: BETA1_HUNDREDTHS, den: DEN },
      r: 0,
      phi: 1,
      s: 0,
      p: 1,
      observation: "rational",
      beta1Kind: "entered",
      w: 0.5,
      encounters: 1,
      population: { kind: "pure", size: SIZE },
      seed: SEED,
      cap: CAP_OFF,
      capRobustness: CAP_ON,
    },
    peak: { num: peakHundredths(), den: DEN },
    series: [
      { id: "PGA", role: "main" },
      { id: "MC-b", role: "main" },
      { id: "GA", role: "control" },
    ],
    grid: gridHundredths().map(measureRow),
  };
}
