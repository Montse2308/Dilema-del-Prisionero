import { DICTATOR, RECEIVER, materialPayoff, type Action } from "./payoffs.js";
import { CAP_OFF, type GuiltCap } from "./pga.js";

/**
 * El juego entra como parámetro, no como segundo codebase (17 D2, §6.3).
 *
 * Los dos juegos comparten los pagos del decisor —10 si tira, 14 si no— y la
 * expectativa del receptor si tira —10—. Eso está verificado en 18 §3.4: el
 * mapeo de los puntos del experimento de K&N al juego 5/10/12/14 es exacto.
 *
 * Lo único que cambia es si el primer mover tiene una acción:
 *
 *   Vanberg  : el receptor es pasivo. π del decisor no depende de nadie.
 *   K&N/CD06 : A elige In / Out, y Out paga 5 a los dos.
 *
 * Esa diferencia no es cosmética. Es la que decide si la selección puede
 * agarrarse de algo: ver 17 §6.8.
 */
export type Game = {
  id: "vanberg" | "trust";
  /** ¿El primer mover elige entrar? */
  hasEntry: boolean;
  /** Pagos si el primer mover se sale. null si el juego no tiene esa etapa. */
  outside: { firstMover: number; decider: number } | null;
  /** El outside option que usa el tope de PGA (17 §3.2, N3). null si no existe. */
  outsideOption: number | null;
  /** Pago material del decisor. */
  deciderPayoff(action: Action): number;
  /** Pago esperado del primer mover dada la acción del decisor. */
  firstMoverPayoff(action: Action): number;
};

/** Vanberg 2008 (17 §2.6). El receptor no elige nada. */
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
 * Trust game con acción oculta de Charness & Dufwenberg 2006, el que usan
 * Kawagoe & Narita. Pagos de 18 §3.1, ya verificados contra los puntos del
 * experimento:
 *
 *              A
 *           Out    In
 *         (5, 5)    B
 *                Roll                       Don't
 *        A: 12 c/ 5/6 · 0 c/ 1/6 → 10       A: 0
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

/** El hueco material del decisor, 14 − 10. Igual en los dos juegos. */
export const DECIDER_GAP = DICTATOR.gap;

/**
 * El tope `min{10·β₀, outsideOption}` de la fórmula de PGA (17 §3.2, N3) por juego.
 *
 * En Vanberg el 5 es prestado y el tope va apagado: es la especificación principal.
 * En el trust game el outside option EXISTE, así que ahí el tope es la forma nativa
 * de K&N y no una robustez importada (17 §6.8).
 *
 * Con `φ = 0.5` y `r = 0` esto no mueve ningún pago, porque `β₀ = β₁/2 ≤ 0.5` y
 * `10·β₀ ≤ 5`: el tope solo muerde con `φ` alto.
 */
export function capForGame(game: Game): GuiltCap {
  return game.outsideOption === null
    ? CAP_OFF
    : { enabled: true, outsideOption: game.outsideOption };
}
