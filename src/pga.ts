import { assertUnitInterval } from "./domain.js";
import { DICTATOR, expectedReceiverPayoff } from "./payoffs.js";

/**
 * Forma de población de PGA (Kawagoe & Narita, 17 §3.2, 18 §7.2).
 *
 * Culpa disponible, en euros², antes de multiplicar por θ:
 *
 *   sin tope:  100 · β₀ · (β₁ − β₀)
 *   con tope:  M · (10·β₁ − M),   M = min{10·β₀, outsideOption}
 *
 * θ multiplica euros × euros. No es el θ de GA, que multiplica euros.
 *
 * Producto negativo significa que la promesa no levantó la expectativa.
 * Eso es culpa 0, no un premio por decepcionar.
 *
 * El tope es el outside option del trust game de K&N (paga 5).
 * Vanberg no lo tiene. Default apagado. La cola β₀ > 0.5 no se aplana a mano.
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
    throw new RangeError("outsideOption debe ser > 0 cuando el tope está prendido");
  }

  const base = cap.enabled
    ? Math.min(expectedReceiverPayoff(beliefs.beta0), cap.outsideOption)
    : expectedReceiverPayoff(beliefs.beta0);
  const increment = expectedReceiverPayoff(beliefs.beta1) - base;
  return Math.max(0, base * increment);
}

/** θ por encima del cual PGA prefiere tirar. ∞ si no hay culpa disponible. */
export function pgaThreshold(beliefs: Beliefs, cap: GuiltCap = CAP_OFF): number {
  const mass = guiltMass(beliefs, cap);
  if (mass === 0) return Number.POSITIVE_INFINITY;
  return DICTATOR.gap / mass;
}

/**
 * Forma corta, solo para el partner-switch de laboratorio.
 *
 * I · decepción completa, en euros. No es el producto.
 * Con la creencia 0.76 de Vanberg el umbral es 4/7.6 ≈ 0.53,
 * el mismo número que GA. En población ese número no se usa.
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
