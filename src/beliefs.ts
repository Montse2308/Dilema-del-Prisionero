import { assertUnitInterval } from "./domain.js";

/**
 * β₀ es el prior poblacional, no la frecuencia de promisores.
 * Elección de modelado (17 §3.2, N3), no un teorema de Kawagoe & Narita.
 *
 * Oficial, r = 0:  β₀ = φ · β₁
 * Robustez:        β₀ = φ · β₁ + (1 − φ) · r
 *
 * r es la tasa de cumplimiento de quien no prometió. Default 0.
 * 0.25 es la celda "sin promesa" de Economics Letters 222; no es el default.
 */
export function priorBeta0(phi: number, beta1: number, r = 0): number {
  assertUnitInterval("phi", phi);
  assertUnitInterval("beta1", beta1);
  assertUnitInterval("r", r);
  return phi * beta1 + (1 - phi) * r;
}

/**
 * φ que coloca el prior en el pico β₀ = β₁/2, con β₁ fijo.
 * φ* = (β₁/2 − r) / (β₁ − r)
 *
 * null si r > β₁/2: el prior mínimo ya es r y la población nace
 * a la derecha del máximo. El pico se cita en β₀, no en φ.
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
