import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';
import { SimHost } from '../src/sim/host.ts';
import { ORG_STRIDE, O_X, O_Y, type Snapshot } from '../src/sim/protocol.ts';

const noClock = () => 0; // Zeitbudget aus: jeder run rechnet alle verlangten Schritte

// Großzügige Zeitgrenze: die große Welt braucht unter Last (CI, parallele Tests) mehr als die 5-s-Vorgabe
describe('SimHost (Simulation hinter dem Worker)', { timeout: 60_000 }, () => {
  it('rechnet exakt wie die Welt direkt (gleicher Seed, gleiche Schritte)', () => {
    const cfg = { ...defaultConfig(), seed: 7 };
    const host = new SimHost();
    host.handle({ type: 'init', cfg: { ...cfg }, planned: [], prerun: 0 }, noClock);
    let snap: Snapshot | null = null;
    for (let i = 0; i < 6; i++) snap = host.handle({ type: 'run', steps: 50 }, noClock);
    const w = new World({ ...cfg });
    for (let i = 0; i < 300; i++) w.step();
    expect(snap!.tick).toBe(300);
    expect(snap!.population).toBe(w.organisms.length);
    for (let i = 0; i < w.organisms.length; i++) {
      expect(snap!.orgs[i * ORG_STRIDE + O_X]).toBe(Math.fround(w.organisms[i].x));
      expect(snap!.orgs[i * ORG_STRIDE + O_Y]).toBe(Math.fround(w.organisms[i].y));
    }
  });

  it('liefert Statistik lückenlos und ohne Doppelte nach', () => {
    const host = new SimHost();
    const first = host.handle({ type: 'init', cfg: { ...defaultConfig(), seed: 3 }, planned: [], prerun: 120 }, noClock)!;
    expect(first.reset).toBe(true);
    const samples = [...first.newSamples], census = [...first.newCensus], events = [...first.newEvents];
    for (let i = 0; i < 20; i++) {
      const s = host.handle({ type: 'run', steps: 37 }, noClock)!;
      expect(s.reset).toBe(false);
      samples.push(...s.newSamples); census.push(...s.newCensus); events.push(...s.newEvents);
    }
    const ticks = samples.map((s) => s.tick);
    expect(ticks).toEqual(Array.from({ length: ticks.length }, (_, i) => i * 10)); // 0, 10, 20 … ohne Lücke
    expect(new Set(census).size).toBe(census.length);
    expect(census.at(-1)!.tick).toBe(Math.floor((120 + 20 * 37) / 50) * 50);
    expect(new Set(events).size).toBe(events.length);
  });

  it('führt geplante Ereignisse und Befehle aus', () => {
    const host = new SimHost();
    host.handle({ type: 'init', cfg: { ...defaultConfig(), seed: 1 }, planned: [{ tick: 5, action: 'eiszeit' }, { tick: 8, action: 'augen' }], prerun: 0 }, noClock);
    const s = host.handle({ type: 'run', steps: 10 }, noClock)!;
    expect(s.crisis?.kind).toBe('eiszeit');
    expect(host.world!.cfg.eyesUnlocked).toBe(true);
    host.handle({ type: 'set', patch: { mutationRate: 2 }, event: 'Mutation 2.0×' });
    expect(host.world!.cfg.mutationRate).toBe(2);
    expect(host.world!.events.at(-1)!.label).toBe('Mutation 2.0×');
    const o = host.world!.organisms[0];
    host.handle({ type: 'select', x: o.x, y: o.y });
    expect(host.handle({ type: 'run', steps: 0 }, noClock)!.selected?.id).toBe(o.id);
  });

  it('respektiert das Zeitbudget (mindestens ein Schritt)', () => {
    const host = new SimHost();
    host.handle({ type: 'init', cfg: { ...defaultConfig(), seed: 2 }, planned: [], prerun: 0 }, noClock);
    let t = 0;
    const slowClock = () => (t += 100); // jeder Aufruf „dauert“ 100 ms
    expect(host.handle({ type: 'run', steps: 30 }, slowClock)!.steps).toBe(1);
  });
});
