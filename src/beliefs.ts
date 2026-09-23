import { assertUnitInterval } from "./domain.js";

/**
 * β₀ is the population prior, not the frequency of promisers.
 * It is a modeling choice, not Kawagoe and Narita's second-order belief.
 *
 * Default, r = 0:  β₀ = φ · β₁
 * Robustness:      β₀ = φ · β₁ + (1 − φ) · r
 *
 * r is the keeping rate of someone who did not promise. Default 0.
 * 0.25 is the "no promise" cell in Economics Letters 222; it is not the default.
 */
export function priorBeta0(phi: number, beta1: number, r = 0): number {
  assertUnitInterval("phi", phi);
  assertUnitInterval("beta1", beta1);
  assertUnitInterval("r", r);
  return phi * beta1 + (1 - phi) * r;
}

/**
 * φ that places the prior at the peak β₀ = β₁/2, with β₁ fixed.
 * φ* = (β₁/2 − r) / (β₁ − r)
 *
 * null if r > β₁/2: the lowest prior is already r, so the population
 * is born to the right of the maximum. The peak is stated in β₀, not in φ.
 */
export function phiAtPeak(beta1: number, r = 0): number | null {
  assertUnitInterval("beta1", beta1);
  assertUnitInterval("r", r);
  if (r > beta1 / 2) return null;
  const denominator = beta1 - r;
  if (denominator === 0) return null;
  return (beta1 / 2 - r) / denominator;
}

export function peakBeta0(beta1: number): number {
  assertUnitInterval("beta1", beta1);
  return beta1 / 2;
}
