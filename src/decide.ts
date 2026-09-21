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
 * S-guilt: la culpa se calcula con las creencias que se le pasan al agente,
 * no con las creencias reales del otro. Es la única que el agente puede computar.
 *
 * θ y c son parámetros del llamado. No son genes: la selección, cuando exista,
 * copia el tipo, no estos números.
 */
export type Spec = "SELF" | "GA" | "PGA" | "MC-a" | "MC-b";

export type Sensitivities = {
  theta: number;
  c: number;
};

export type MatchState = {
  /** Mandé una promesa de tirar. */
  promised: boolean;
  /**
   * Esa promesa se la hice a quien tengo enfrente.
   * En el partner-switch es false: la promesa de la mesa la hizo otro.
   */
  bindsThisPartner: boolean;
  /**
   * Probabilidad que esta pareja asigna a que yo tire.
   * GA la usa tal cual. En el laboratorio es la misma con switch y sin switch.
   */
  partnerExpectation: number;
  /** β₀ y β₁ de la población. PGA en forma completa las usa solo si la promesa es mía. */
  beliefs: Beliefs;
};

function assertMatch(match: MatchState): void {
  if (match.bindsThisPartner && !match.promised) {
    throw new RangeError("bindsThisPartner implica promised");
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
 * Tira solo si es estrictamente mejor. En la igualdad, Don't.
 * Así está escrito el umbral de 17 §3.2: "tiro si 10 > 14 − …".
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
 * Utilidad de la forma corta de laboratorio. Sirve para reproducir la tabla
 * de 17 §3.2. La decisión de población no pasa por aquí.
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
