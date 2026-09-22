import { choose, type MatchState, type Sensitivities, type Spec } from "./decide.js";
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

/**
 * Proceso de Moran con imitación (17 §3.4, §6.3, K12).
 *
 * Un paso = una generación = los N agentes juegan su encuentro y después hay N
 * eventos de imitación. La imitación es SÍNCRONA: el modelo se lee de la
 * población vieja, así que un agente reemplazado en este paso todavía puede ser
 * copiado. Con `w = 0` la probabilidad de copiar es 1/2, o sea del orden de N/2
 * reemplazos por generación, no N. Cambia los tiempos de absorción, no quién
 * sobrevive.
 *
 * El fitness es el PAGO MATERIAL, nunca la utilidad: la culpa cambia lo que el
 * agente elige, no lo que la selección ve. Es el núcleo de 17 §6.8.
 */

/**
 * Q10 — qué información usa el primer mover cuando observa el tipo (K13, `26`).
 *
 *   "rational" — ve el tipo, NO ve el sorteo de switch de este encuentro, y SÍ
 *                conoce la tasa `s`. Especificación principal: `s` es la
 *                institución, del mismo tipo de conocimiento que `φ` y `β₁`.
 *   "weak"     — ve el tipo y asume que la promesa ata. Hipótesis alternativa:
 *                es un mejor respondedor con el prior equivocado `s = 0`, y
 *                arriba de `s = 1/2` le da vuelta el signo al resultado.
 *   "strong"   — ve el tipo Y el sorteo privado. Lo que el motor hacía antes
 *                del 22-sep-2026. Se conserva solo para reproducir esa tabla.
 *
 * Las tres coinciden agente por agente cuando `s = 0`.
 */
export type ObservationMode = "rational" | "weak" | "strong";

/** Q11, abierta: qué encuentros entran en `β₁`. Ver `population.ts`. */
export type Beta1Kind = "entered" | "structural";

export type MoranParams = {
  game: Game;
  /** Tamaño de la población. */
  size: number;
  /** φ — fracción que promete. EXÓGENO y barrido (K11). */
  phi: number;
  /** s — probabilidad de que la promesa no ate a esta pareja. */
  s: number;
  /** p — probabilidad de que el primer mover observe el TIPO del decisor (§3.7). */
  p: number;
  /** w — intensidad de selección de Fermi. w = 0 es deriva pura. */
  w: number;
  /** r — cumplimiento residual de quien no promete. 0 por default (N3). */
  r?: number;
  /** θ y c comunes. Fijos: la selección copia el tipo, no estos números (K4). */
  sens: Sensitivities;
  /** Override por tipo, si algún barrido lo necesita. */
  sensByType?: Partial<Record<Spec, Sensitivities>>;
  /** Tope de PGA. Si se omite, sale del juego: apagado en Vanberg, prendido en el trust game. */
  cap?: GuiltCap;
  /** Encuentros por agente y generación. Más encuentros = menos ruido de muestreo. */
  encounters?: number;
  /** β₁ inicial. 0.76 es la creencia de segundo orden que midió Vanberg. */
  beta1Init?: number;
  /** Q10. Default "rational" (K13). */
  observation?: ObservationMode;
  /** Q11. Default "entered", que es lo que el motor midió hasta el 22-sep. */
  beta1Kind?: Beta1Kind;
};

export type GenerationStats = {
  generation: number;
  beliefs: Beliefs;
  counts: Census;
  meanDeciderPayoff: number;
  meanFirstMoverPayoff: number;
  /** Suma de los dos. El "pago agregado" del test de overdrive. */
  meanSocialPayoff: number;
  entryRate: number;
  /** Tasa de Roll entre los encuentros contabilizados (ver `beta1Kind`). */
  rollRate: number;
  /** Pago social por encuentro EN EL QUE SE ENTRÓ. NaN si no entró nadie. */
  socialPayoffGivenEntry: number;
};

export type MoranState = {
  population: Spec[];
  beliefs: Beliefs;
  generation: number;
};

function sensFor(params: MoranParams, spec: Spec): Sensitivities {
  return params.sensByType?.[spec] ?? params.sens;
}

function capFor(params: MoranParams): GuiltCap {
  return params.cap ?? capForGame(params.game);
}

/**
 * Lo que el primer mover espera cobrar. **Q10 vive acá y en ningún otro lado.**
 *
 * Si no observa el tipo, solo tiene la creencia poblacional que corresponda:
 * β₁ si hubo promesa, β₀ si no.
 *
 * Si lo observa, la mezcla es sobre las DOS ACCIONES CONTRAFACTUALES del tipo
 * —`choose` con la promesa atando y `choose` sin atar— y solo si prometió.
 * Multiplicar `(1 − s) · β₁` contaría `s` dos veces, porque β₁ ya trae el
 * reemparejamiento adentro.
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

/** Empate → Out, el mismo criterio conservador que K6 usa para el decisor. */
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
      throw new RangeError(`${name} debe estar en [0, 1]; recibido ${String(value)}`);
    }
  }
  if (!Number.isFinite(params.w) || params.w < 0) {
    throw new RangeError(`w debe ser ≥ 0; recibido ${String(params.w)}`);
  }
  if (!Number.isInteger(params.size) || params.size < 2) {
    throw new RangeError(`size debe ser un entero ≥ 2; recibido ${String(params.size)}`);
  }
  const encounters = params.encounters ?? 1;
  if (!Number.isInteger(encounters) || encounters <= 0) {
    throw new RangeError(`encounters debe ser un entero > 0; recibido ${String(encounters)}`);
  }
}

export type EncounterResult = {
  deciderPayoff: number;
  firstMoverPayoff: number;
  entered: boolean;
  promised: boolean;
  action: Action;
};

export function encounter(
  spec: Spec,
  params: MoranParams,
  beliefs: Beliefs,
  rng: Rng,
): EncounterResult {
  const { game } = params;
  const cap = capFor(params);
  const sens = sensFor(params, spec);

  const promised = rng.bool(params.phi);
  const switched = rng.bool(params.s);
  const bindsThisPartner = promised && !switched;
  const partnerExpectation = promised ? beliefs.beta1 : beliefs.beta0;

  const match: MatchState = { promised, bindsThisPartner, partnerExpectation, beliefs };
  const action = choose(spec, sens, match, cap);

  // Se consume siempre, entre o no entre el juego, para que dos corridas que
  // solo cambian un parámetro sigan alineadas en el stream.
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
    action,
  };
}

/**
 * Regla de Fermi (K12):  P(i copia a j) = 1 / (1 + exp(−w · (π_j − π_i)))
 *
 * w = 0 da exactamente 1/2 y la dinámica es deriva neutral.
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
  const fitness = new Array<number>(size).fill(0);

  let firstMoverTotal = 0;
  let entries = 0;
  let socialGivenEntry = 0;
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
  if (initial !== undefined && initial.length !== params.size) {
    throw new RangeError(
      `initial.length (${String(initial.length)}) debe ser igual a size (${String(params.size)})`,
    );
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

  return {
    final: state,
    history,
    counts: census(state.population),
    fixated: fixatedSpec(state.population),
  };
}
