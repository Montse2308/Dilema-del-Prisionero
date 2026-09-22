import { choose, type MatchState, type Sensitivities, type Spec } from "./decide.js";
import { CAP_OFF, type Beliefs, type GuiltCap } from "./pga.js";
import type { Action } from "./payoffs.js";
import type { Game } from "./game.js";
import { makeRng, type Rng } from "./rng.js";
import {
  SPECS,
  beliefsFrom,
  census,
  uniformPopulation,
  type Census,
  type Realized,
} from "./population.js";

/**
 * Proceso de Moran con imitación (17 §3.4, §6.3, K12).
 *
 * Un paso = una generación = N eventos de imitación, después de que los N
 * agentes jugaron su encuentro. El fitness es el PAGO MATERIAL, nunca la
 * utilidad: la culpa cambia lo que el agente elige, no lo que la selección ve.
 * Esa distinción es el núcleo del hallazgo de §6.8.
 */
export type MoranParams = {
  game: Game;
  /** Tamaño de la población. */
  size: number;
  /** φ — fracción que promete. EXÓGENO y barrido (K11). */
  phi: number;
  /** s — reemparejamiento: probabilidad de que la promesa no ate a esta pareja. */
  s: number;
  /** p — probabilidad de que el primer mover observe el tipo del decisor (§3.7). */
  p: number;
  /** w — intensidad de selección de la regla de Fermi. w = 0 es deriva pura. */
  w: number;
  /** r — cumplimiento residual de quien no promete. 0 por default (N3). */
  r?: number;
  /** θ y c comunes. Fijos: la selección copia el tipo, no estos números (K4). */
  sens: Sensitivities;
  /** Override por tipo, si algún barrido lo necesita. */
  sensByType?: Partial<Record<Spec, Sensitivities>>;
  cap?: GuiltCap;
  /** Encuentros por agente y generación. Más encuentros = menos ruido de muestreo. */
  encounters?: number;
  /** β₁ inicial. 0.76 es la creencia de segundo orden que midió Vanberg. */
  beta1Init?: number;
};

export type GenerationStats = {
  generation: number;
  beliefs: Beliefs;
  counts: Census;
  /** Pago material medio del decisor. */
  meanDeciderPayoff: number;
  /** Pago material medio del primer mover. */
  meanFirstMoverPayoff: number;
  /** Suma de los dos: el "pago agregado" del test de moral overdrive. */
  meanSocialPayoff: number;
  /** Fracción de encuentros en los que el primer mover entró. */
  entryRate: number;
  /** Tasa de Roll entre los encuentros donde el decisor actuó. */
  rollRate: number;
};

export type MoranState = {
  population: Spec[];
  beliefs: Beliefs;
  generation: number;
};

function sensFor(params: MoranParams, spec: Spec): Sensitivities {
  return params.sensByType?.[spec] ?? params.sens;
}

function assertParams(params: MoranParams): void {
  for (const [name, value] of [["phi", params.phi], ["s", params.s], ["p", params.p]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} debe estar en [0, 1]; recibido ${String(value)}`);
    }
  }
  if (!Number.isFinite(params.w) || params.w < 0) {
    throw new RangeError(`w debe ser ≥ 0; recibido ${String(params.w)}`);
  }
  if (!Number.isInteger(params.size) || params.size < 2) {
    throw new RangeError(`size debe ser un entero ≥ 2; recibido ${String(params.size)}`);
  }
}

/**
 * Un encuentro. El agente juega de decisor; el primer mover es material y no
 * evoluciona: entra si le conviene, con la información que tenga.
 *
 * Con probabilidad p observa el tipo del decisor y puede anticipar su acción
 * exactamente. Si no lo observa, solo tiene la creencia poblacional que
 * corresponde: β₁ si hubo promesa, β₀ si no. Empate → Out, el mismo criterio
 * conservador que K6 usa para el decisor.
 */
function encounter(
  spec: Spec,
  params: MoranParams,
  beliefs: Beliefs,
  rng: Rng,
): { deciderPayoff: number; firstMoverPayoff: number; entered: boolean; promised: boolean; action: Action } {
  const { game } = params;
  const cap = params.cap ?? CAP_OFF;

  const promised = rng.bool(params.phi);
  const switched = rng.bool(params.s);
  const bindsThisPartner = promised && !switched;
  const partnerExpectation = promised ? beliefs.beta1 : beliefs.beta0;

  const match: MatchState = { promised, bindsThisPartner, partnerExpectation, beliefs };
  const action = choose(spec, sensFor(params, spec), match, cap);

  const observes = rng.bool(params.p);
  if (!game.hasEntry || game.outside === null) {
    return {
      deciderPayoff: game.deciderPayoff(action),
      firstMoverPayoff: game.firstMoverPayoff(action),
      entered: true,
      promised,
      action,
    };
  }

  const expected = observes
    ? game.firstMoverPayoff(action)
    : game.firstMoverPayoff("roll") * partnerExpectation;
  const entered = expected > game.outside.firstMover;

  return {
    deciderPayoff: entered ? game.deciderPayoff(action) : game.outside.decider,
    firstMoverPayoff: entered ? game.firstMoverPayoff(action) : game.outside.firstMover,
    entered,
    promised,
    action,
  };
}

/**
 * Regla de Fermi (K12):  P(i copia a j) = 1 / (1 + exp(−w · (π_j − π_i)))
 *
 * w = 0 da exactamente 1/2 y la dinámica es deriva neutral, que es el test de
 * sanidad más barato del motor. w grande tiende a la mejor respuesta.
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
  const fitness = new Array<number>(size).fill(0);

  let firstMoverTotal = 0;
  let entries = 0;
  const realized: Realized = { acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 };

  for (let i = 0; i < size; i += 1) {
    const spec = state.population[i];
    if (spec === undefined) throw new Error("población con hueco");
    let total = 0;
    for (let e = 0; e < encounters; e += 1) {
      const result = encounter(spec, params, state.beliefs, rng);
      total += result.deciderPayoff;
      firstMoverTotal += result.firstMoverPayoff;
      if (result.entered) {
        entries += 1;
        realized.acted += 1;
        if (result.promised) {
          realized.promisers += 1;
          if (result.action === "roll") realized.promiserRolls += 1;
        } else if (result.action === "roll") {
          realized.silentRolls += 1;
        }
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
      throw new Error("índice fuera de rango en el paso de imitación");
    }
    if (draw < fermi(payoffSelf, payoffOther, params.w)) nextPopulation[i] = model;
  }

  const plays = size * encounters;
  const deciderTotal = fitness.reduce((acc, value) => acc + value, 0);
  const meanDeciderPayoff = deciderTotal / size;
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
  };

  return {
    state: {
      population: nextPopulation,
      beliefs: beliefsFrom(realized, params.phi, state.beliefs.beta1, params.r ?? 0),
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
    throw new RangeError(`generations debe ser un entero ≥ 0; recibido ${String(generations)}`);
  }
  const rng = makeRng(seed);
  const beta1 = params.beta1Init ?? 0.76;
  let state: MoranState = {
    population: initial ? initial.slice() : uniformPopulation(params.size, SPECS),
    beliefs: beliefsFrom(
      { acted: 0, promisers: 0, promiserRolls: 0, silentRolls: 0 },
      params.phi,
      beta1,
      params.r ?? 0,
    ),
    generation: 0,
  };

  const history: GenerationStats[] = [];
  for (let g = 0; g < generations; g += 1) {
    const result = step(state, params, rng);
    history.push(result.stats);
    state = result.state;
  }

  const counts = census(state.population);
  const first = state.population[0];
  const fixated =
    first !== undefined && state.population.every((spec) => spec === first) ? first : null;

  return { final: state, history, counts, fixated };
}
