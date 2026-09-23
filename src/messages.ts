import { choose, type MatchState, type Sensitivities, type Spec } from "./decide.js";
import { CAP_OFF, type Beliefs, type GuiltCap } from "./pga.js";
import { SPECS, census, type Census } from "./population.js";
import type { Rng } from "./rng.js";
import { assertUnitInterval } from "./domain.js";

/**
 * Message stage. The protocol is a parameter. Each state's frequency is
 * exogenous, like φ.
 *
 *   "unilateral"  — only the decider can promise. Two states have mass:
 *                   deciderOnly and none. agreement and partnerOnly stay at 0,
 *                   and the encounter matches the two-state engine, bit for bit.
 *   "reciprocal"  — both can speak. Four states.
 *
 * The receiver's message does not enter utility. It enters as a belief:
 * general guilt reads the cell's expectation, personal guilt reads the
 * increment of its own promise, through the same guiltMass. Neither commitment
 * type reads either field.
 */
export const MESSAGE_STATES = ["agreement", "deciderOnly", "partnerOnly", "none"] as const;

export type MessageState = (typeof MESSAGE_STATES)[number];

export type Protocol = "unilateral" | "reciprocal";

/** Exogenous frequencies. They must sum to 1. */
export type MessageMix = Record<MessageState, number>;

/** One belief per message state. This is not β₀: β₀ remains the derived prior. */
export type CellBeliefs = Record<MessageState, number>;

export type CellCount = { observed: number; rolls: number };

export type CellTally = Record<MessageState, CellCount>;

export type SwitchRates = {
  /** The promise binds this partner. */
  stayed: number;
  /** s released the bond. The cell's expectation does not change. */
  switched: number;
};

export type CellRates = Record<MessageState, SwitchRates>;

export type DictatorProbe = {
  cells: CellBeliefs;
  /** Rates by cell and by switch. Computed even if the cell has frequency 0. */
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

/** The two-state mix the engine already had: φ promises, 1−φ stays silent. */
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
    throw new RangeError(`message frequencies must sum to 1; sum is ${String(sum)}`);
  }
}

export function initialCells(beta: number): CellBeliefs {
  assertUnitInterval("beta", beta);
  return { agreement: beta, deciderOnly: beta, partnerOnly: beta, none: beta };
}

/**
 * Opening consistent with the usual pair.
 *
 * Cells in which the decider promised open at β₁. The others open at the
 * prior β₀, not at β₁: if silence opened at 0.76, general guilt would roll
 * even though nobody promised, the first mover would always let it in, and
 * it would fixate. That would be the initial condition, not the protocol.
 *
 * Agreement and a one-sided promise open equal, and so do the receiver's
 * promise and silence. Under those equalities no type treats the receiver's
 * message differently, so any difference has to come from behavior.
 */
export function openingCells(beta1: number, beta0: number): CellBeliefs {
  assertUnitInterval("beta1", beta1);
  assertUnitInterval("beta0", beta0);
  return { agreement: beta1, deciderOnly: beta1, partnerOnly: beta0, none: beta0 };
}

/**
 * One draw from the stream, the same as `rng.bool`.
 *
 * With `unilateralMix(φ)` the cut falls in the same place as `bool(φ)`:
 * agreement and the receiver's promise have mass 0, so u < φ is deciderOnly
 * and the rest is none. The unilateral protocol does not shift the seed.
 */
export function drawMessage(mix: MessageMix, rng: Rng): MessageState {
  const u = rng.next();
  if (u < mix.agreement) return "agreement";
  if (u < mix.agreement + mix.deciderOnly) return "deciderOnly";
  if (u < mix.agreement + mix.deciderOnly + mix.partnerOnly) return "partnerOnly";
  return "none";
}

/**
 * The (β₀, β₁) pair personal guilt already knows how to read.
 * β₁ is the cell in which its promise was said. β₀ is that cell without
 * the promise. The increment is what its word moves.
 *
 *   agreement     β₁ = agreement,          β₀ = receiver's promise
 *   decider only  β₁ = decider only,       β₀ = silence
 *
 * In cells where this agent did not promise, the pair is unused: personal
 * guilt requires the bond, and there the bond does not hold.
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
 * Translates the cell into the MatchState the kernel already consumes.
 *
 * Unilateral does not read `cells`. It reads the derived pair — measured β₁,
 * β₀ = φ·β₁ + (1−φ)·r — which is what makes this cut reproduce the previous
 * engine, seed by seed. Feeding it the measured silent rate would change
 * personal guilt under the same parameters.
 *
 * Reciprocal does read `cells`. General guilt keeps the cell's expectation.
 * Personal guilt keeps the pair above. Commitment looks at neither field.
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
 * Same rule as `beliefsFrom`: the realized rate in the cell, or the previous
 * value if nobody was counted. The caller supplies the one-generation lag
 * by passing the previous vector.
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
 * Dictator probe. Composition arrives frozen: there is no Moran step here.
 *
 * Beliefs are solved in this game, cell by cell, with the same update rule.
 * The trust game's β is not imported: that β is censored by entry, and the
 * dictator has no entry.
 *
 * The cap stays off. Vanberg has no outside option; turning it on would
 * borrow the trust game's 5.
 *
 * A cell with frequency 0 is not observed, so its belief does not move.
 * The counterfactual rate is still reported: it is what this population would do there.
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
  if (size === 0) throw new RangeError("the probe needs a population");
  const counts = census(args.population);
  const cap = args.cap ?? CAP_OFF;
  const maxIterations = args.maxIterations ?? 32;
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    throw new RangeError(`maxIterations must be an integer > 0; received ${String(maxIterations)}`);
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
