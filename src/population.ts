import { priorBeta0 } from "./beliefs.js";
import type { Beliefs } from "./pga.js";
import type { Spec } from "./decide.js";
import type { Rng } from "./rng.js";

export const SPECS = ["SELF", "GA", "PGA", "MC-a", "MC-b"] as const;

export type Census = Record<Spec, number>;

export function emptyCensus(): Census {
  return { SELF: 0, GA: 0, PGA: 0, "MC-a": 0, "MC-b": 0 };
}

export function census(population: readonly Spec[]): Census {
  const counts = emptyCensus();
  for (const spec of population) counts[spec] += 1;
  return counts;
}

/** El tipo que ocupa toda la población, o null si todavía conviven varios. */
export function fixatedSpec(population: readonly Spec[]): Spec | null {
  const first = population[0];
  if (first === undefined) return null;
  return population.every((spec) => spec === first) ? first : null;
}

/** Población en partes iguales, con el resto repartido en orden. */
export function uniformPopulation(size: number, specs: readonly Spec[] = SPECS): Spec[] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError(`size debe ser un entero > 0; recibido ${String(size)}`);
  }
  if (specs.length === 0) throw new RangeError("specs no puede estar vacío");
  return Array.from({ length: size }, (_, i) => {
    const spec = specs[i % specs.length];
    if (spec === undefined) throw new Error("specs con hueco");
    return spec;
  });
}

/** Población al azar, con la semilla del bucle. */
export function randomPopulation(
  size: number,
  rng: Rng,
  specs: readonly Spec[] = SPECS,
): Spec[] {
  if (specs.length === 0) throw new RangeError("specs no puede estar vacío");
  return Array.from({ length: size }, () => {
    const spec = specs[rng.int(specs.length)];
    if (spec === undefined) throw new Error("specs con hueco");
    return spec;
  });
}

/**
 * Lo que la generación dejó medido. Solo cuentan los encuentros donde el
 * decisor llegó a actuar: si el primer mover se sale, no hay conducta que
 * observar, y meterla en la estadística inventaría un Don't que nadie eligió.
 */
export type Realized = {
  /** Encuentros en los que el decisor actuó. */
  acted: number;
  /** De esos, cuántos venían con promesa. */
  promisers: number;
  /** De los que prometieron, cuántos tiraron. */
  promiserRolls: number;
  /** De los que NO prometieron, cuántos tiraron. */
  silentRolls: number;
};

/**
 * β₁ sale de la conducta realizada del paso anterior: cuánto cumplen LOS QUE
 * PROMETEN (17 §3.2). β₀ no se mide, se deriva — es la elección de modelado
 * declarada en N3: β₀ = φ·β₁ + (1−φ)·r, con r = 0 por default.
 *
 * Sin promisores en la generación, β₁ se queda en el valor anterior en lugar
 * de colapsar a 0: "nadie prometió este paso" no es evidencia de que quien
 * promete no cumpla. `fallback` es ese valor anterior.
 */
export function beliefsFrom(
  realized: Realized,
  phi: number,
  fallback: number,
  r = 0,
): Beliefs {
  const beta1 = realized.promisers > 0 ? realized.promiserRolls / realized.promisers : fallback;
  return { beta0: priorBeta0(phi, beta1, r), beta1 };
}
