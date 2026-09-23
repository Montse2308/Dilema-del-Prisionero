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

/** The type that fills the population, or null if several still coexist. */
export function fixatedSpec(population: readonly Spec[]): Spec | null {
  const first = population[0];
  if (first === undefined) return null;
  return population.every((spec) => spec === first) ? first : null;
}

/** Equal shares, with the remainder handed out in order. */
export function uniformPopulation(size: number, specs: readonly Spec[] = SPECS): Spec[] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError(`size must be an integer > 0; received ${String(size)}`);
  }
  if (specs.length === 0) throw new RangeError("specs must not be empty");
  return Array.from({ length: size }, (_, i) => {
    const spec = specs[i % specs.length];
    if (spec === undefined) throw new Error("specs has a hole");
    return spec;
  });
}

/** Random population, using the loop's seed. */
export function randomPopulation(
  size: number,
  rng: Rng,
  specs: readonly Spec[] = SPECS,
): Spec[] {
  if (specs.length === 0) throw new RangeError("specs must not be empty");
  return Array.from({ length: size }, () => {
    const spec = specs[rng.int(specs.length)];
    if (spec === undefined) throw new Error("specs has a hole");
    return spec;
  });
}

/**
 * What the generation measured.
 *
 * Which encounters count is `beta1Kind`:
 *
 *   "entered"    — only encounters in which the decider got to act.
 *                  What a real receiver could observe. This is the default,
 *                  and the one the manuscript uses.
 *   "structural" — everyone, including people the first mover did not let in.
 *                  A diagnostic. The two are not interchangeable: with high `s`,
 *                  "entered" sends β₁ to 1, and that is what keeps general guilt alive there.
 */
export type Realized = {
  /** Encounters in which the decider acted. */
  acted: number;
  /** Of those, how many arrived with a promise. */
  promisers: number;
  /** Of those who promised, how many rolled. */
  promiserRolls: number;
  /** Of those who did NOT promise, how many rolled. */
  silentRolls: number;
};

/**
 * β₁ is the realized keeping rate, from the previous step, among those who promised.
 * β₀ is not measured. It is derived: β₀ = φ·β₁ + (1−φ)·r, with r = 0 by default.
 *
 * If `realized.promisers` is 0 — no promiser was counted, which under
 * `beta1Kind: "entered"` means "none for whom the door opened", not "none who
 * promised" — β₁ stays at the previous value instead of collapsing to 0.
 * `fallback` is that value.
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
