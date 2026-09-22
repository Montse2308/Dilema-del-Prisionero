import { choose, type MatchState, type Sensitivities, type Spec } from "./decide.js";
import { CAP_OFF, type Beliefs, type GuiltCap } from "./pga.js";
import { SPECS, census, type Census } from "./population.js";
import type { Rng } from "./rng.js";
import { assertUnitInterval } from "./domain.js";

/**
 * Etapa de mensajes (R-10). El protocolo es un parámetro; la frecuencia de
 * cada estado es exógena, como φ (K11).
 *
 *   "unilateral"  — solo el decisor puede prometer. Dos estados con masa:
 *                   deciderOnly y none. agreement y partnerOnly quedan en 0,
 *                   y el encuentro es el de antes de este corte, bit a bit.
 *   "reciprocal"  — los dos pueden hablar. Cuatro estados.
 *
 * El mensaje del receptor no entra en la utilidad. Entra como creencia:
 * GA lee la expectativa de la celda, PGA lee el incremento de SU promesa
 * con la misma guiltMass de siempre. MC-a y MC-b no leen ninguna de las dos.
 */
export const MESSAGE_STATES = ["agreement", "deciderOnly", "partnerOnly", "none"] as const;

export type MessageState = (typeof MESSAGE_STATES)[number];

export type Protocol = "unilateral" | "reciprocal";

/** Frecuencias exógenas. Tienen que sumar 1. */
export type MessageMix = Record<MessageState, number>;

/** Una creencia por estado de mensaje. No es β₀: β₀ sigue siendo el prior derivado. */
export type CellBeliefs = Record<MessageState, number>;

export type CellCount = { observed: number; rolls: number };

export type CellTally = Record<MessageState, CellCount>;

export type SwitchRates = {
  /** La promesa ata a esta pareja. */
  stayed: number;
  /** s soltó el vínculo. La expectativa de la celda no cambia. */
  switched: number;
};

export type CellRates = Record<MessageState, SwitchRates>;

export type DictatorProbe = {
  cells: CellBeliefs;
  /** Tasas por celda y por switch. Se calculan aunque la celda tenga frecuencia 0. */
  rates: CellRates;
  iterations: number;
  fixed: boolean;
};

export function emptyTally(): CellTally {
  return {
    agreement: { observed: 0, rolls: 0 },
    deciderOnly: { observed: 0, rolls: 0 },
    partnerOnly: { observed: 0, rolls: 0 },
    none: { observed: 0, rolls: 0 },
  };
}

export function emptyMessageCounts(): Record<MessageState, number> {
  return { agreement: 0, deciderOnly: 0, partnerOnly: 0, none: 0 };
}

/** La mezcla de dos estados que el motor ya tenía: φ promete, 1−φ calla. */
export function unilateralMix(phi: number): MessageMix {
  return { agreement: 0, deciderOnly: phi, partnerOnly: 0, none: 1 - phi };
}

export function assertMix(mix: MessageMix): void {
  let sum = 0;
  for (const cell of MESSAGE_STATES) {
    assertUnitInterval(cell, mix[cell]);
    sum += mix[cell];
  }
  if (Math.abs(sum - 1) > 1e-9) {
    throw new RangeError(`la mezcla de mensajes debe sumar 1; suma ${String(sum)}`);
  }
}

export function initialCells(beta: number): CellBeliefs {
  assertUnitInterval("beta", beta);
  return { agreement: beta, deciderOnly: beta, partnerOnly: beta, none: beta };
}

/**
 * Apertura consistente con el par de siempre.
 *
 * Las celdas en las que el decisor prometió abren en β₁. Las otras abren en
 * el prior β₀, no en β₁: si el silencio abre en 0.76, GA tira aunque nadie
 * haya prometido, el primer mover le abre siempre y GA fija. Eso no es el
 * protocolo; es la condición inicial.
 *
 * Acuerdo y promesa solo del decisor abren iguales, y promesa del receptor
 * y silencio también. Con esas igualdades ningún tipo trata distinto el
 * mensaje del receptor, así que la diferencia tiene que producirla la
 * conducta. No se siembra a mano.
 */
export function openingCells(beta1: number, beta0: number): CellBeliefs {
  assertUnitInterval("beta1", beta1);
  assertUnitInterval("beta0", beta0);
  return { agreement: beta1, deciderOnly: beta1, partnerOnly: beta0, none: beta0 };
}

/**
 * Un solo número del stream, igual que `rng.bool`.
 *
 * Con `unilateralMix(φ)` el corte cae en el mismo lugar que `bool(φ)`:
 * acuerdo y promesa del receptor tienen masa 0, así que u < φ es
 * deciderOnly y el resto es none. Por eso el protocolo unilateral no
 * desalinea la semilla.
 */
export function drawMessage(mix: MessageMix, rng: Rng): MessageState {
  const u = rng.next();
  if (u < mix.agreement) return "agreement";
  if (u < mix.agreement + mix.deciderOnly) return "deciderOnly";
  if (u < mix.agreement + mix.deciderOnly + mix.partnerOnly) return "partnerOnly";
  return "none";
}

/**
 * El par (β₀, β₁) que PGA ya sabe leer. No es una fórmula nueva:
 * β₁ es la celda en la que su promesa está dicha, β₀ es la misma celda
 * sin esa promesa. El incremento es lo que su palabra mueve.
 *
 *   acuerdo            β₁ = acuerdo,          β₀ = promesa del receptor
 *   solo el decisor    β₁ = solo el decisor,  β₀ = silencio
 *
 * En las celdas donde él no prometió el par no se usa: la culpa de PGA
 * pide que el vínculo ate, y ahí no ata.
 */
export function pgaBeliefs(cell: MessageState, cells: CellBeliefs): Beliefs {
  switch (cell) {
    case "agreement":
      return { beta0: cells.partnerOnly, beta1: cells.agreement };
    case "deciderOnly":
      return { beta0: cells.none, beta1: cells.deciderOnly };
    case "partnerOnly":
      return { beta0: cells.partnerOnly, beta1: cells.partnerOnly };
    case "none":
      return { beta0: cells.none, beta1: cells.none };
  }
}

/**
 * Traduce la celda al MatchState que el kernel ya consume.
 *
 * Unilateral no lee `cells`. Lee el par derivado de siempre —β₁ medido,
 * β₀ = φ·β₁ + (1−φ)·r— que es lo que hace que el corte reproduzca el
 * motor anterior semilla por semilla. Meter acá la tasa silenciosa medida
 * cambiaría la culpa de PGA con los mismos parámetros.
 *
 * Recíproco sí lee `cells`. GA se queda con la expectativa de la celda.
 * PGA se queda con el par de arriba. MC no mira ninguno de los dos campos.
 */
export function matchFor(args: {
  protocol: Protocol;
  cell: MessageState;
  switched: boolean;
  cells: CellBeliefs;
  beliefs: Beliefs;
}): MatchState {
  const promised = args.cell === "agreement" || args.cell === "deciderOnly";
  const bindsThisPartner = promised && !args.switched;
  if (args.protocol === "unilateral") {
    return {
      promised,
      bindsThisPartner,
      partnerExpectation: promised ? args.beliefs.beta1 : args.beliefs.beta0,
      beliefs: args.beliefs,
    };
  }
  return {
    promised,
    bindsThisPartner,
    partnerExpectation: args.cells[args.cell],
    beliefs: pgaBeliefs(args.cell, args.cells),
  };
}

/**
 * La misma regla que `beliefsFrom`: la tasa realizada en la celda, y si
 * nadie fue contabilizado, el valor anterior. El retraso de una generación
 * lo pone quien llama, pasando el vector previo.
 */
export function updateCells(tally: CellTally, previous: CellBeliefs): CellBeliefs {
  const next: CellBeliefs = { ...previous };
  for (const cell of MESSAGE_STATES) {
    const row = tally[cell];
    if (row.observed > 0) next[cell] = row.rolls / row.observed;
  }
  return next;
}

const PROBE_BELIEFS: Beliefs = { beta0: 0, beta1: 0 };

function ratesAt(
  counts: Census,
  size: number,
  cells: CellBeliefs,
  s: number,
  sens: Sensitivities,
  cap: GuiltCap,
): CellRates {
  const rates = {} as CellRates;
  for (const cell of MESSAGE_STATES) {
    let stayedRolls = 0;
    let switchedRolls = 0;
    for (const spec of SPECS) {
      const n = counts[spec];
      if (n === 0) continue;
      const stayed = choose(
        spec,
        sens,
        matchFor({
          protocol: "reciprocal",
          cell,
          switched: false,
          cells,
          beliefs: PROBE_BELIEFS,
        }),
        cap,
      );
      const switched = choose(
        spec,
        sens,
        matchFor({
          protocol: "reciprocal",
          cell,
          switched: true,
          cells,
          beliefs: PROBE_BELIEFS,
        }),
        cap,
      );
      if (stayed === "roll") stayedRolls += n;
      if (switched === "roll") switchedRolls += n;
    }
    rates[cell] = { stayed: stayedRolls / size, switched: switchedRolls / size };
  }
  return rates;
}

function cellsEqual(a: CellBeliefs, b: CellBeliefs): boolean {
  return MESSAGE_STATES.every((cell) => a[cell] === b[cell]);
}

/**
 * Sonda del dictador. La composición llega congelada: acá no hay Moran.
 *
 * Las creencias se resuelven en este juego, celda por celda, con la misma
 * regla de actualización. No se importa el β del trust game: ese β está
 * censurado por la entrada, y el dictador no tiene entrada.
 *
 * El tope queda apagado. Vanberg no tiene outside option; prenderlo sería
 * prestarle el 5 del trust game.
 *
 * Una celda con frecuencia 0 no se observa, así que su creencia no se mueve.
 * La tasa contrafactual sí se reporta: es lo que esta población haría ahí.
 */
export function dictatorProbe(args: {
  population: readonly Spec[];
  sens: Sensitivities;
  s: number;
  cells: CellBeliefs;
  mix: MessageMix;
  cap?: GuiltCap;
  maxIterations?: number;
}): DictatorProbe {
  assertUnitInterval("s", args.s);
  assertMix(args.mix);
  const size = args.population.length;
  if (size === 0) throw new RangeError("la sonda necesita una población");
  const counts = census(args.population);
  const cap = args.cap ?? CAP_OFF;
  const maxIterations = args.maxIterations ?? 32;
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    throw new RangeError(`maxIterations debe ser un entero > 0; recibido ${String(maxIterations)}`);
  }

  let cells: CellBeliefs = { ...args.cells };
  let rates = ratesAt(counts, size, cells, args.s, args.sens, cap);
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const next: CellBeliefs = { ...cells };
    for (const cell of MESSAGE_STATES) {
      if (args.mix[cell] > 0) {
        const row = rates[cell];
        next[cell] = (1 - args.s) * row.stayed + args.s * row.switched;
      }
    }
    if (cellsEqual(next, cells)) {
      return { cells, rates, iterations: iteration, fixed: true };
    }
    cells = next;
    rates = ratesAt(counts, size, cells, args.s, args.sens, cap);
  }
  return { cells, rates, iterations: maxIterations, fixed: false };
}
