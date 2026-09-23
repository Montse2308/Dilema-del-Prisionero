import { choose, type MatchState, type Sensitivities, type Spec } from "./decide.js";
import { priorBeta0 } from "./beliefs.js";
import { CAP_OFF, type Beliefs, type GuiltCap } from "./pga.js";
import type { Action } from "./payoffs.js";
import { capForGame, type Game } from "./game.js";
import { makeRng, type Rng } from "./rng.js";
import {
  SPECS,
  beliefsFrom,
  census,
  fixatedSpec,
  uniformPopulation,
  type Census,
  type Realized,
} from "./population.js";
import {
  assertMix,
  drawMessage,
  emptyMessageCounts,
  emptyTally,
  initialCells,
  matchFor,
  openingCells,
  unilateralMix,
  updateCells,
  type CellBeliefs,
  type CellTally,
  type MessageMix,
  type MessageState,
  type Protocol,
} from "./messages.js";

/**
 * Moran process with imitation.
 *
 * One step is one generation: the N agents play, then there are N imitation
 * events. Imitation is synchronous: the model is read from the old population,
 * so an agent replaced in this step can still be copied. With `w = 0` the
 * copy probability is 1/2, on the order of N/2 replacements per generation,
 * not N. That changes absorption times, not who survives.
 *
 * Fitness is the material payoff, never utility. Guilt changes what the agent
 * chooses. It does not change what selection sees.
 */

/**
 * What the first mover uses when the type is observed.
 *
 *   "rational" — sees the type, does not see this encounter's switch draw,
 *                and does know the rate `s`. Principal specification: `s` is
 *                the institution, known the way `φ` and `β₁` are known.
 *   "weak"     — sees the type and assumes the promise binds. Alternative:
 *                a best response under the wrong prior `s = 0`. Above `s = 1/2`
 *                it flips the sign of the result.
 *   "strong"   — sees the type and the private draw. Kept so that case can
 *                be reproduced. It is not the principal specification.
 *
 * The three agree, agent by agent, when `s = 0`.
 */
export type ObservationMode = "rational" | "weak" | "strong";

/** Which encounters enter `β₁`. See `population.ts`. */
export type Beta1Kind = "entered" | "structural";

export type MoranParams = {
  game: Game;
  /** Population size. */
  size: number;
  /**
   * φ — share that promises, under the unilateral protocol. Exogenous.
   * With `protocol: "reciprocal"` the encounter does not read it: the mix is `messages`.
   */
  phi: number;
  /**
   * Communication protocol. Default "unilateral": agreement and partnerOnly have frequency 0.
   */
  protocol?: Protocol;
  /**
   * Exogenous mix over the four states. Required if the protocol is reciprocal.
   * Ignored under unilateral.
   */
  messages?: MessageMix;
  /** s — probability that the promise does not bind this partner. */
  s: number;
  /** p — probability that the first mover observes the decider's type. */
  p: number;
  /** w — Fermi selection intensity. w = 0 is pure drift. */
  w: number;
  /** r — residual keeping rate of someone who does not promise. Default 0. */
  r?: number;
  /** Shared θ and c. Fixed: selection copies the type, not these numbers. */
  sens: Sensitivities;
  /** Per-type override, if a sweep needs it. */
  sensByType?: Partial<Record<Spec, Sensitivities>>;
  /** Personal-guilt cap. If omitted, it comes from the game: off in Vanberg, on in the trust game. */
  cap?: GuiltCap;
  /** Encounters per agent per generation. More encounters, less sampling noise. */
  encounters?: number;
  /** Initial β₁. 0.76 is the second-order belief Vanberg measured. */
  beta1Init?: number;
  /** Default "rational". */
  observation?: ObservationMode;
  /** Default "entered". */
  beta1Kind?: Beta1Kind;
};

export type GenerationStats = {
  generation: number;
  beliefs: Beliefs;
  counts: Census;
  meanDeciderPayoff: number;
  meanFirstMoverPayoff: number;
  /** Sum of the two. */
  meanSocialPayoff: number;
  entryRate: number;
  /** Roll rate among counted encounters (see `beta1Kind`). */
  rollRate: number;
  /** Social payoff per encounter in which someone entered. NaN if nobody entered. */
  socialPayoffGivenEntry: number;
  /** Per-cell beliefs that produced this generation. Unilateral does not read them. */
  cells: CellBeliefs;
  /** Encounters that fell in each state. Under unilateral, agreement and the receiver's promise are 0. */
  messageCounts: Record<MessageState, number>;
};

export type MoranState = {
  population: Spec[];
  beliefs: Beliefs;
  /** Per-cell beliefs. The unilateral protocol does not consult them. */
  cells: CellBeliefs;
  generation: number;
};

function sensFor(params: MoranParams, spec: Spec): Sensitivities {
  return params.sensByType?.[spec] ?? params.sens;
}

function capFor(params: MoranParams): GuiltCap {
  return params.cap ?? capForGame(params.game);
}

/**
 * What the first mover expects to receive. This is the only place that rule lives.
 *
 * If the type is not observed, the first mover has only the matching population
 * belief: β₁ if there was a promise, β₀ if not.
 *
 * If it is observed, the mix is over the type's two counterfactual actions —
 * `choose` with the promise binding and `choose` without — and only if this
 * agent promised. Multiplying `(1 − s) · β₁` would count `s` twice, because
 * β₁ already contains the partner switch.
 */
export function entryExpectation(args: {
  spec: Spec;
  sens: Sensitivities;
  match: MatchState;
  game: Game;
  action: Action;
  observes: boolean;
  s: number;
  mode: ObservationMode;
  cap: GuiltCap;
}): number {
  const { spec, sens, match, game, action, observes, s, mode, cap } = args;

  if (!observes) {
    return game.firstMoverPayoff("roll") * match.partnerExpectation;
  }
  if (mode === "strong") {
    return game.firstMoverPayoff(action);
  }

  const ifBinds = choose(spec, sens, { ...match, bindsThisPartner: match.promised }, cap);
  if (mode === "weak" || !match.promised) {
    return game.firstMoverPayoff(match.promised ? ifBinds : action);
  }
  const ifNot = choose(spec, sens, { ...match, bindsThisPartner: false }, cap);
  return (1 - s) * game.firstMoverPayoff(ifBinds) + s * game.firstMoverPayoff(ifNot);
}

/** A tie stays out, the same conservative criterion the decider uses at a tie. */
export function firstMoverEnters(
  expectation: number,
  game: Game,
): boolean {
  if (!game.hasEntry || game.outside === null) return true;
  return expectation > game.outside.firstMover;
}

function assertParams(params: MoranParams): void {
  for (const [name, value] of [["phi", params.phi], ["s", params.s], ["p", params.p]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be in [0, 1]; received ${String(value)}`);
    }
  }
  if (!Number.isFinite(params.w) || params.w < 0) {
    throw new RangeError(`w must be ≥ 0; received ${String(params.w)}`);
  }
  if (!Number.isInteger(params.size) || params.size < 2) {
    throw new RangeError(`size must be an integer ≥ 2; received ${String(params.size)}`);
  }
  const encounters = params.encounters ?? 1;
  if (!Number.isInteger(encounters) || encounters <= 0) {
    throw new RangeError(`encounters must be an integer > 0; received ${String(encounters)}`);
  }
  if ((params.protocol ?? "unilateral") === "reciprocal") {
    if (params.messages === undefined) {
      throw new RangeError("reciprocal protocol requires messages");
    }
    assertMix(params.messages);
  }
}

function activeMix(params: MoranParams): MessageMix {
  if ((params.protocol ?? "unilateral") === "unilateral") return unilateralMix(params.phi);
  if (params.messages === undefined) {
    throw new RangeError("reciprocal protocol requires messages");
  }
  return params.messages;
}

export type EncounterResult = {
  deciderPayoff: number;
  firstMoverPayoff: number;
  entered: boolean;
  promised: boolean;
  message: MessageState;
  action: Action;
};

export function encounter(
  spec: Spec,
  params: MoranParams,
  beliefs: Beliefs,
  rng: Rng,
  cells?: CellBeliefs,
): EncounterResult {
  const { game } = params;
  const cap = capFor(params);
  const sens = sensFor(params, spec);
  const protocol = params.protocol ?? "unilateral";
  if (protocol === "reciprocal" && cells === undefined) {
    throw new RangeError("a reciprocal encounter requires per-cell beliefs");
  }

  // One draw for the message, one for the switch, one for observation.
  // Under unilateral the first falls on the same cut as the old `bool(φ)`.
  const cell = drawMessage(activeMix(params), rng);
  const switched = rng.bool(params.s);
  const match = matchFor({
    protocol,
    cell,
    switched,
    cells: cells ?? initialCells(beliefs.beta1),
    beliefs,
  });
  const action = choose(spec, sens, match, cap);
  const promised = match.promised;

  // Always consumed, whether or not the game has entry, so two runs that
  // differ by one parameter stay aligned on the stream.
  const observes = rng.bool(params.p);

  if (!game.hasEntry || game.outside === null) {
    return {
      deciderPayoff: game.deciderPayoff(action),
      firstMoverPayoff: game.firstMoverPayoff(action),
      entered: true,
      promised,
      message: cell,
      action,
    };
  }

  const expectation = entryExpectation({
    spec,
    sens,
    match,
    game,
    action,
    observes,
    s: params.s,
    mode: params.observation ?? "rational",
    cap,
  });
  const entered = firstMoverEnters(expectation, game);

  return {
    deciderPayoff: entered ? game.deciderPayoff(action) : game.outside.decider,
    firstMoverPayoff: entered ? game.firstMoverPayoff(action) : game.outside.firstMover,
    entered,
    promised,
    message: cell,
    action,
  };
}

/**
 * Summary written into `state.beliefs` when the protocol is reciprocal.
 * Agents do not read it: they read `cells`. β₁ is the rate in the cells
 * where the decider promised. β₀ remains the derived prior, with φ equal
 * to the mass of those cells.
 */
function pooledPromisedBeliefs(tally: CellTally, fallbackBeta1: number, mix: MessageMix, r: number): Beliefs {
  const observed = tally.agreement.observed + tally.deciderOnly.observed;
  const rolls = tally.agreement.rolls + tally.deciderOnly.rolls;
  const beta1 = observed > 0 ? rolls / observed : fallbackBeta1;
  const phi = mix.agreement + mix.deciderOnly;
  return { beta0: priorBeta0(phi, beta1, r), beta1 };
}

/**
 * Fermi rule:  P(i copies j) = 1 / (1 + exp(−w · (π_j − π_i)))
 *
 * w = 0 is exactly 1/2, and the dynamic is neutral drift.
 */
export function fermi(payoffSelf: number, payoffOther: number, w: number): number {
  return 1 / (1 + Math.exp(-w * (payoffOther - payoffSelf)));
}

export function step(state: MoranState, params: MoranParams, rng: Rng): {
  state: MoranState;
  stats: GenerationStats;
} {
  assertParams(params);
  const size = params.size;
  const encounters = params.encounters ?? 1;
  const structural = (params.beta1Kind ?? "entered") === "structural";
  const protocol = params.protocol ?? "unilateral";
  const fitness = new Array<number>(size).fill(0);

  let firstMoverTotal = 0;
  let entries = 0;
  let socialGivenEntry = 0;
  const realized: Realized = { acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 };
  const tally = emptyTally();
  const messageCounts = emptyMessageCounts();

  for (let i = 0; i < size; i += 1) {
    const spec = state.population[i];
    if (spec === undefined) throw new Error("population has a hole");
    let total = 0;
    for (let e = 0; e < encounters; e += 1) {
      const result = encounter(spec, params, state.beliefs, rng, state.cells);
      total += result.deciderPayoff;
      firstMoverTotal += result.firstMoverPayoff;
      messageCounts[result.message] += 1;
      if (result.entered) {
        entries += 1;
        socialGivenEntry += result.deciderPayoff + result.firstMoverPayoff;
      }
      if (result.entered || structural) {
        realized.acted += 1;
        if (result.promised) {
          realized.promisers += 1;
          if (result.action === "roll") realized.promiserRolls += 1;
        } else if (result.action === "roll") {
          realized.silentRolls += 1;
        }
        const row = tally[result.message];
        row.observed += 1;
        if (result.action === "roll") row.rolls += 1;
      }
    }
    fitness[i] = total / encounters;
  }

  const nextPopulation = state.population.slice();
  for (let k = 0; k < size; k += 1) {
    const i = rng.int(size);
    const j = rng.int(size);
    const draw = rng.next();
    if (i === j) continue;
    const payoffSelf = fitness[i];
    const payoffOther = fitness[j];
    const model = state.population[j];
    if (payoffSelf === undefined || payoffOther === undefined || model === undefined) {
      throw new Error("index out of range in the imitation step");
    }
    if (draw < fermi(payoffSelf, payoffOther, params.w)) nextPopulation[i] = model;
  }

  const plays = size * encounters;
  const meanDeciderPayoff = fitness.reduce((acc, value) => acc + value, 0) / size;
  const meanFirstMoverPayoff = firstMoverTotal / plays;

  const stats: GenerationStats = {
    generation: state.generation,
    beliefs: state.beliefs,
    counts: census(state.population),
    meanDeciderPayoff,
    meanFirstMoverPayoff,
    meanSocialPayoff: meanDeciderPayoff + meanFirstMoverPayoff,
    entryRate: entries / plays,
    rollRate: realized.acted > 0 ? (realized.promiserRolls + realized.silentRolls) / realized.acted : 0,
    socialPayoffGivenEntry: entries > 0 ? socialGivenEntry / entries : Number.NaN,
    cells: state.cells,
    messageCounts,
  };

  const nextCells = updateCells(tally, state.cells);
  // Unilateral still goes through beliefsFrom. It is the same number as before;
  // the cells are recorded beside it and do not re-enter the encounter.
  const nextBeliefs =
    protocol === "unilateral"
      ? beliefsFrom(realized, params.phi, state.beliefs.beta1, params.r ?? 0)
      : pooledPromisedBeliefs(tally, state.beliefs.beta1, activeMix(params), params.r ?? 0);

  return {
    state: {
      population: nextPopulation,
      beliefs: nextBeliefs,
      cells: nextCells,
      generation: state.generation + 1,
    },
    stats,
  };
}

export type RunResult = {
  final: MoranState;
  history: GenerationStats[];
  counts: Census;
  fixated: Spec | null;
};

export function run(
  params: MoranParams,
  generations: number,
  seed: string | number,
  initial?: readonly Spec[],
): RunResult {
  assertParams(params);
  if (!Number.isInteger(generations) || generations < 0) {
    throw new RangeError(`generations must be an integer ≥ 0; received ${String(generations)}`);
  }
  if (initial !== undefined && initial.length !== params.size) {
    throw new RangeError(
      `initial.length (${String(initial.length)}) must equal size (${String(params.size)})`,
    );
  }

  const rng = makeRng(seed);
  const beta1 = params.beta1Init ?? 0.76;
  const protocol = params.protocol ?? "unilateral";
  // Under unilateral, φ is the parameter. Under reciprocal, the mass of
  // decider promises comes from the mix; φ does not enter the encounter.
  const phiForPrior =
    protocol === "unilateral"
      ? params.phi
      : (params.messages?.agreement ?? 0) + (params.messages?.deciderOnly ?? 0);
  let state: MoranState = {
    population: initial ? initial.slice() : uniformPopulation(params.size, SPECS),
    beliefs: beliefsFrom(
      { acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 },
      phiForPrior,
      beta1,
      params.r ?? 0,
    ),
    cells: openingCells(beta1, priorBeta0(phiForPrior, beta1, params.r ?? 0)),
    generation: 0,
  };

  const history: GenerationStats[] = [];
  for (let g = 0; g < generations; g += 1) {
    const result = step(state, params, rng);
    history.push(result.stats);
    state = result.state;
  }

  return {
    final: state,
    history,
    counts: census(state.population),
    fixated: fixatedSpec(state.population),
  };
}
