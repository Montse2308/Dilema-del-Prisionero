/**
 * Juego de Vanberg (17 §2.6). El dado cae sobre el receptor.
 * El dictador cobra 10 si tira y 14 si no tira, sin azar.
 *
 * 12 × 5/6 = 10 es el pago esperado del receptor si el dictador tira.
 * Ese 10 es el que entra en la culpa. No es el pago del dictador.
 */
export const DICTATOR = {
  roll: 10,
  dont: 14,
  /** 14 − 10. Lo que el dictador gana desviándose a Don't. */
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

/** Pago esperado del receptor si cree que el dictador tira con probabilidad β. */
export function expectedReceiverPayoff(beta: number): number {
  return RECEIVER.expectedIfRoll * beta;
}
