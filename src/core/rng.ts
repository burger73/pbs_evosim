/**
 * Deterministischer Zufallsgenerator (mulberry32).
 * Gleicher Seed → exakt gleicher Simulationsverlauf. Wichtig für Tests und
 * für reproduzierbare Experimente („starte mit Seed 42 und schau, was passiert“).
 */
import { cos as dcos, log as dlog, sin as dsin } from './dmath.ts';
export class Rng {
  private state: number;
  private spareGauss: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Gleichverteilt in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Normalverteilt (Mittelwert 0, Standardabweichung 1), Box-Muller. */
  gauss(): number {
    if (this.spareGauss !== null) {
      const s = this.spareGauss;
      this.spareGauss = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const mag = Math.sqrt(-2 * dlog(u));
    this.spareGauss = mag * dsin(2 * Math.PI * v);
    return mag * dcos(2 * Math.PI * v);
  }
}
