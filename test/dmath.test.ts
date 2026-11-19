import { describe, expect, it } from 'vitest';
import { cos, exp, log, log2, pow, sin, tanh } from '../src/core/dmath.ts';

/** Relativer Fehler (bzw. absoluter nahe 0). */
const err = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

describe('Plattformunabhängige Mathematik', () => {
  const xs = Array.from({ length: 20001 }, (_, i) => -50 + i * 0.005);
  it('sin und cos stimmen mit Math überein (Fehler < 1e-13)', () => {
    for (const x of xs) { expect(err(sin(x), Math.sin(x))).toBeLessThan(1e-13); expect(err(cos(x), Math.cos(x))).toBeLessThan(1e-13); }
  });
  it('exp, tanh (Fehler < 1e-13)', () => {
    for (const x of xs) { expect(err(exp(x / 2), Math.exp(x / 2))).toBeLessThan(1e-13); expect(err(tanh(x / 5), Math.tanh(x / 5))).toBeLessThan(1e-13); }
    expect(exp(800)).toBe(Infinity);
    expect(exp(-800)).toBe(0);
  });
  it('log, log2, pow (Fehler < 1e-13)', () => {
    for (let i = 1; i <= 20000; i++) {
      const x = i * 0.013 + 1e-6;
      expect(err(log(x), Math.log(x))).toBeLessThan(1e-13);
      expect(err(log2(x), Math.log2(x))).toBeLessThan(1e-13);
      expect(err(pow(x, 1.5), Math.pow(x, 1.5))).toBeLessThan(1e-12);
    }
    expect(err(pow(10, 2.6), Math.pow(10, 2.6))).toBeLessThan(1e-13);
    expect(log(0)).toBe(-Infinity);
  });
});
