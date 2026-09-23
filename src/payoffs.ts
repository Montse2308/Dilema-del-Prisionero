/**
 * Vanberg's dictator payoffs. The die falls on the receiver.
 * The dictator receives 10 for rolling and 14 for not rolling, with no chance.
 *
 * 12 × 5/6 = 10 is the receiver's expected payoff if the dictator rolls.
 * That 10 is what enters guilt. It is not the dictator's payoff.
 */
export const DICTATOR = {
  roll: 10,
  dont: 14,
  /** 14 − 10. What the dictator gains by switching to Don't. */
  gap: 4,
} as const;

export const RECEIVER = {
  rollFace: 12,
  rollSuccess: 5 / 6,
  expectedIfRoll: 10,
  ifDont: 0,
} as const;

export type Action = "roll" | "dont";

export function materialPayoff(action: Action): number {
  return action === "roll" ? DICTATOR.roll : DICTATOR.dont;
}

/** Receiver's expected payoff if they believe the dictator rolls with probability β. */
export function expectedReceiverPayoff(beta: number): number {
  return RECEIVER.expectedIfRoll * beta;
}
