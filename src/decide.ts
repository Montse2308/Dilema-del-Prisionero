import { assertNonNegative, assertUnitInterval } from "./domain.js";
import {
  CAP_OFF,
  type Beliefs,
  type GuiltCap,
  guiltMass,
  labDisappointment,
} from "./pga.js";
import { type Action, materialPayoff, expectedReceiverPayoff, RECEIVER } from "./payoffs.js";

/**
 * Simple guilt: guilt is computed from the beliefs passed to the agent,
 * not from the other person's actual beliefs. Those are the only beliefs
 * the agent can compute.
 *
 * θ and c are arguments. They are not genes: selection copies the type, not these numbers.
 */
export type Spec = "SELF" | "GA" | "PGA" | "MC-a" | "MC-b";

export type Sensitivities = {
  theta: number;
  c: number;
};

export type MatchState = {
  /** This agent promised to roll. */
  promised: boolean;
  /**
   * That promise was made to the person now in front.
   * False under the partner switch: someone else made the promise at the table.
   */
  bindsThisPartner: boolean;
  /**
   * Probability this partner assigns to the agent rolling.
   * General guilt uses it as is. In the laboratory it is the same with and without the switch.
   */
  partnerExpectation: number;
  /** Population β₀ and β₁. Full personal guilt uses them only if the promise is this agent's. */
  beliefs: Beliefs;
};

function assertMatch(match: MatchState): void {
  if (match.bindsThisPartner && !match.promised) {
    throw new RangeError("bindsThisPartner requires promised");
  }
  assertUnitInterval("partnerExpectation", match.partnerExpectation);
}

function gaDisappointment(action: Action, partnerExpectation: number): number {
  const expected = expectedReceiverPayoff(partnerExpectation);
  const realized = action === "roll" ? RECEIVER.expectedIfRoll : RECEIVER.ifDont;
  return Math.max(0, expected - realized);
}

export function utility(
  spec: Spec,
  action: Action,
  sens: Sensitivities,
  match: MatchState,
  cap: GuiltCap = CAP_OFF,
): number {
  assertMatch(match);
  assertNonNegative("theta", sens.theta);
  assertNonNegative("c", sens.c);

  const payoff = materialPayoff(action);

  switch (spec) {
    case "SELF":
      return payoff;
    case "GA":
      return payoff - sens.theta * gaDisappointment(action, match.partnerExpectation);
    case "PGA": {
      if (action === "roll" || !match.bindsThisPartner) return payoff;
      return payoff - sens.theta * guiltMass(match.beliefs, cap);
    }
    case "MC-a": {
      const brokeOwnWord = match.promised && action === "dont";
      return payoff - (brokeOwnWord ? sens.c : 0);
    }
    case "MC-b": {
      const brokeWordToThisPartner = match.bindsThisPartner && action === "dont";
      return payoff - (brokeWordToThisPartner ? sens.c : 0);
    }
  }
}

/**
 * Rolls only if it is strictly better. At a tie, Don't.
 * The threshold is written as "roll if 10 > 14 − …".
 */
export function choose(
  spec: Spec,
  sens: Sensitivities,
  match: MatchState,
  cap: GuiltCap = CAP_OFF,
): Action {
  const roll = utility(spec, "roll", sens, match, cap);
  const dont = utility(spec, "dont", sens, match, cap);
  return roll > dont ? "roll" : "dont";
}

/**
 * Utility in the short laboratory form. The population decision does not go through here.
 */
export function labUtility(
  spec: "GA" | "PGA",
  action: Action,
  theta: number,
  causedExpectation: boolean,
  partnerExpectation: number,
): number {
  assertNonNegative("theta", theta);
  assertUnitInterval("partnerExpectation", partnerExpectation);
  const payoff = materialPayoff(action);
  if (spec === "GA" || causedExpectation) {
    const disappointment =
      action === "dont" ? labDisappointment(partnerExpectation) : 0;
    return payoff - theta * disappointment;
  }
  return payoff;
}

export function labChoose(
  spec: "GA" | "PGA",
  theta: number,
  causedExpectation: boolean,
  partnerExpectation: number,
): Action {
  const roll = labUtility(spec, "roll", theta, causedExpectation, partnerExpectation);
  const dont = labUtility(spec, "dont", theta, causedExpectation, partnerExpectation);
  return roll > dont ? "roll" : "dont";
}
