/**
 * Deterministic PRNG with an explicit seed. No runtime dependencies.
 *
 * mulberry32: 32 bits of state. Enough for populations of hundreds of agents
 * and thousands of generations. It is not cryptographic.
 *
 * Stream rule: every function consumes exactly one number per call, even when
 * the result is deterministic (p = 0 or p = 1). Two runs that differ by one
 * parameter stay aligned, so the comparison does not mix the effect with a
 * shift in the generator.
 */
export type Rng = {
  /** Uniform on [0, 1). */
  next(): number;
  /** Uniform integer on [0, n). */
  int(n: number): number;
  /** true with probability p. Always consumes one number. */
  bool(p: number): boolean;
};

/** 32-bit FNV-1a. Accepts text so seeds can be readable. */
export function hashSeed(seed: string | number): number {
  const text = typeof seed === "number" ? String(seed) : seed;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function makeRng(seed: string | number): Rng {
  let state = hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(n: number): number {
      if (!Number.isInteger(n) || n <= 0) {
        throw new RangeError(`int(n) requires an integer > 0; received ${String(n)}`);
      }
      return Math.floor(next() * n);
    },
    bool(p: number): boolean {
      return next() < p;
    },
  };
}
