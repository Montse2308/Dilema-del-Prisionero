export function assertUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} debe estar en [0, 1]; recibido ${String(value)}`);
  }
}

export function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} debe ser ≥ 0; recibido ${String(value)}`);
  }
}
