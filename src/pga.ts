import { assertUnitInterval } from "./domain.js";
import { DICTATOR, expectedReceiverPayoff } from "./payoffs.js";

/**
 * Population form of personal guilt.
 *
 * Available guilt, in money squared, before multiplying by θ:
 *
 *   cap off:  100 · β₀ · (β₁ − β₀)
 *   cap on:   M · (10·β₁ − M),   M = min{10·β₀, outsideOption}
 *
 * θ multiplies money by money. It is not the θ of general guilt, which multiplies money.
 *
 * max{0, ·} sets guilt to 0 when the promise does not raise the expectation
 * above the base. That guard is not the same comparison in both options:
 *
 *   cap off:  base = 10·β₀  ⇒  guilt is 0  ⟺  β₁ ≤ β₀
 *   cap on:   base = M      ⇒  guilt is 0  ⟺  10·β₁ ≤ M
 *
 * With the cap on, the base is the outside option, so the tail β₀ ≥ 0.5
 * is 13 even when β₁ ≤ β₀. The cap is the outside option of the trust game (it pays 5).
 * Vanberg's game does not have it. Default is off.
 */
export type GuiltCap = {
  enabled: boolean;
  outsideOption: number;
};

export const CAP_OFF: GuiltCap = { enabled: false, outsideOption: 5 };

export type Beliefs = {
  beta0: number;
  beta1: number;
};

export function guiltMass(beliefs: Beliefs, cap: GuiltCap = CAP_OFF): number {
  assertUnitInterval("beta0", beliefs.beta0);
  assertUnitInterval("beta1", beliefs.beta1);
  if (cap.enabled && !(cap.outsideOption > 0)) {
    throw new RangeError("outsideOption must be > 0 when the cap is on");
  }

  const base = cap.enabled
    ? Math.min(expectedReceiverPayoff(beliefs.beta0), cap.outsideOption)
    : expectedReceiverPayoff(beliefs.beta0);
  const increment = expectedReceiverPayoff(beliefs.beta1) - base;
  return Math.max(0, base * increment);
}

/** θ above which personal guilt prefers to roll. ∞ if no guilt is available. */
export function pgaThreshold(beliefs: Beliefs, cap: GuiltCap = CAP_OFF): number {
  const mass = guiltMass(beliefs, cap);
  if (mass === 0) return Number.POSITIVE_INFINITY;
  return DICTATOR.gap / mass;
}

/**
 * Short form, only for the laboratory partner switch.
 *
 * Full disappointment, in money. Not the product.
 * At Vanberg's belief 0.76 the threshold is 4/7.6 ≈ 0.53, the same number as general guilt.
 * The population comparison does not use this number.
 */
export function labDisappointment(partnerExpectation: number): number {
  assertUnitInterval("partnerExpectation", partnerExpectation);
  return expectedReceiverPayoff(partnerExpectation);
}

export function labPgaThreshold(partnerExpectation: number): number {
  const disappointment = labDisappointment(partnerExpectation);
  if (disappointment === 0) return Number.POSITIVE_INFINITY;
  return DICTATOR.gap / disappointment;
}
