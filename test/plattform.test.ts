/**
 * Wächter für „gleicher Seed, gleicher Verlauf – in jedem Browser“.
 * Math.sin/cos/exp/log/pow/tanh/hypot … dürfen je Engine im letzten Bit abweichen (Node und Chromium tun es
 * nachweislich). Im Simulationskern deshalb nur die Funktionen aus src/core/dmath.ts verwenden.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt)\b|\*\*/g;

describe('Plattformunabhängigkeit des Kerns', () => {
  const dir = new URL('../src/core/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'dmath.ts')) {
    it(`${file} nutzt keine engine-abhängige Mathematik`, () => {
      const code = readFileSync(new URL(file, dir), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '') // Kommentare ignorieren
        .replace(/\/\/.*$/gm, '');
      const hits = code.match(FORBIDDEN) ?? [];
      expect(hits, `In src/core/${file} stattdessen dmath.ts verwenden (sin, cos, exp, log, log2, tanh, pow)`).toEqual([]);
    });
  }
});
