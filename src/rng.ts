/**
 * PRNG determinista con semilla explícita (17 §6.3: "RNG con seed explícito
 * desde el primer commit"). Sin dependencias de runtime (D2).
 *
 * mulberry32: 32 bits de estado. Alcanza de sobra para poblaciones de cientos
 * de agentes y miles de generaciones. No es criptográfico y no lo pretende.
 *
 * Regla del stream: TODAS las funciones consumen exactamente un número por
 * llamada, incluso cuando el resultado es determinista (p = 0 o p = 1). Así
 * dos corridas que solo cambian un parámetro siguen alineadas y la comparación
 * entre ellas no mezcla efecto con desfase del generador.
 */
export type Rng = {
  /** Uniforme en [0, 1). */
  next(): number;
  /** Entero uniforme en [0, n). */
  int(n: number): number;
  /** true con probabilidad p. Consume un número siempre. */
  bool(p: number): boolean;
};

/** FNV-1a de 32 bits. Acepta texto para que las semillas sean legibles. */
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
        throw new RangeError(`int(n) requiere un entero > 0; recibido ${String(n)}`);
      }
      return Math.floor(next() * n);
    },
    bool(p: number): boolean {
      return next() < p;
    },
  };
}
