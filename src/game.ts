import { DICTATOR, RECEIVER, materialPayoff, type Action } from "./payoffs.js";
import { CAP_OFF, type GuiltCap } from "./pga.js";

/**
 * The game is a parameter.
 *
 * Both games share the decider's payoffs — 10 for rolling, 14 for not —
 * and the receiver's expectation if the decider rolls — 10.
 *
 * What changes is whether the first mover has an action:
 *
 *   Vanberg: the receiver is passive. The decider's payoff depends on nobody else.
 *   Trust:   the first mover chooses In or Out, and Out pays 5 to both.
 *
 * That difference is what gives selection something to attach to.
 */
export type Game = {
  id: "vanberg" | "trust";
  /** Does the first mover choose whether to enter? */
  hasEntry: boolean;
  /** Payoffs if the first mover stays out. null if the game has no such stage. */
  outside: { firstMover: number; decider: number } | null;
  /** Outside option used by the personal-guilt cap. null if there is none. */
  outsideOption: number | null;
  /** Material payoff of the decider. */
  deciderPayoff(action: Action): number;
  /** Expected payoff of the first mover given the decider's action. */
  firstMoverPayoff(action: Action): number;
};

/** Vanberg 2008. The receiver chooses nothing. */
export const VANBERG: Game = {
  id: "vanberg",
  hasEntry: false,
  outside: null,
  outsideOption: null,
  deciderPayoff: materialPayoff,
  firstMoverPayoff: (action) =>
    action === "roll" ? RECEIVER.expectedIfRoll : RECEIVER.ifDont,
};

/**
 * Trust game with hidden action (Charness & Dufwenberg 2006), the one
 * Kawagoe & Narita use:
 *
 *              A
 *           Out    In
 *         (5, 5)    B
 *                Roll                       Don't
 *        A: 12 with 5/6 · 0 with 1/6 → 10   A: 0
 *        B: 10                              B: 14
 */
export const TRUST: Game = {
  id: "trust",
  hasEntry: true,
  outside: { firstMover: 5, decider: 5 },
  outsideOption: 5,
  deciderPayoff: materialPayoff,
  firstMoverPayoff: (action) =>
    action === "roll" ? RECEIVER.expectedIfRoll : RECEIVER.ifDont,
};

/** The decider's material gap, 14 − 10. The same in both games. */
export const DECIDER_GAP = DICTATOR.gap;

/**
 * Personal-guilt cap `min{10·β₀, outsideOption}`, by game.
 *
 * Vanberg has no outside option, so the cap is off: that is the principal specification.
 * In the trust game the outside option exists, so the cap is the native form.
 *
 * With `φ = 0.5` and `r = 0` the cap does not move any payoff, because
 * `β₀ = β₁/2 ≤ 0.5` and `10·β₀ ≤ 5`. It binds only when `φ` is high.
 */
export function capForGame(game: Game): GuiltCap {
  return game.outsideOption === null
    ? CAP_OFF
    : { enabled: true, outsideOption: game.outsideOption };
}
