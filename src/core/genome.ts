import { BRAIN_SIZE } from './brain.ts';
import type { Rng } from './rng.ts';

/**
 * Das Erbgut eines Organismus.
 * Körpermerkmale haben Kosten und Nutzen – die Umwelt entscheidet, was sich lohnt.
 * Die Farbe (hue) ist bewusst „neutral“: Sie kostet nichts und nützt nichts,
 * driftet also zufällig. Dadurch werden getrennte Abstammungslinien sichtbar.
 */
export interface Genome {
  /** Körpergröße (Radius-Faktor). Groß = kann fressen, kostet aber viel Energie. */
  size: number;
  /** Maximale Geschwindigkeit. Schnell kostet Energie im Quadrat. */
  speed: number;
  /** Sehweite (0..1 der maximalen Sehweite). Wirkt erst, wenn „Augen“ freigeschaltet sind. */
  sense: number;
  /** Ernährung: 0 = Pflanzenfresser, 1 = Räuber. */
  diet: number;
  /** Gehirngröße / Intelligenz (0..1). Teuer – lohnt sich erst, wenn Kultur möglich ist. */
  intellect: number;
  /** Farbe als Farbwinkel 0..360 – neutrales Merkmal. */
  hue: number;
  /** Gewichte des Gehirns. */
  brain: Float32Array;
}

export const LIMITS = {
  size: [0.5, 3],
  speed: [0.1, 2],
  sense: [0, 1],
  diet: [0, 1],
  intellect: [0, 1],
} as const;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

/** Urform: kleine, grüne Pflanzenfresser mit zufälligem Gehirn. */
export function primordialGenome(rng: Rng): Genome {
  const brain = new Float32Array(BRAIN_SIZE);
  for (let i = 0; i < BRAIN_SIZE; i++) brain[i] = rng.gauss() * 0.6;
  return {
    size: clamp(1 + rng.gauss() * 0.1, ...LIMITS.size),
    speed: clamp(0.8 + rng.gauss() * 0.15, ...LIMITS.speed),
    sense: clamp(0.25 + rng.gauss() * 0.1, ...LIMITS.sense),
    diet: clamp(0.05 + Math.abs(rng.gauss()) * 0.05, ...LIMITS.diet),
    intellect: clamp(0.1 + rng.gauss() * 0.04, ...LIMITS.intellect),
    hue: wrapHue(120 + rng.gauss() * 6),
    brain,
  };
}

/** Kopie mit Mutationen. rate = 0 → exakte Kopie. */
export function mutate(g: Genome, rng: Rng, rate: number): Genome {
  const m = (v: number, sigma: number, [lo, hi]: readonly [number, number]) =>
    clamp(v + rng.gauss() * sigma * rate, lo, hi);
  const brain = new Float32Array(g.brain);
  if (rate > 0) {
    for (let i = 0; i < brain.length; i++) {
      if (rng.chance(0.15)) brain[i] += rng.gauss() * 0.35 * rate;
    }
  }
  return {
    size: m(g.size, 0.08, LIMITS.size),
    speed: m(g.speed, 0.06, LIMITS.speed),
    sense: m(g.sense, 0.04, LIMITS.sense),
    diet: m(g.diet, 0.05, LIMITS.diet),
    intellect: m(g.intellect, 0.04, LIMITS.intellect),
    hue: wrapHue(g.hue + rng.gauss() * 8 * rate),
    brain,
  };
}

/** Kreisabstand zweier Farbwinkel in Grad (0..180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Abstand zweier Genome im Merkmalsraum (ohne Gehirn), grob 0..~2. */
export function genomeDistance(a: Genome, b: Genome): number {
  const ds = (a.size - b.size) / 2.5;
  const dv = (a.speed - b.speed) / 1.9;
  const de = a.sense - b.sense;
  const dd = (a.diet - b.diet) * 2;
  const di = (a.intellect - b.intellect) * 1.5;
  const dh = (hueDistance(a.hue, b.hue) / 180) * 0.8;
  return Math.sqrt(ds * ds + dv * dv + de * de + dd * dd + di * di + dh * dh);
}
