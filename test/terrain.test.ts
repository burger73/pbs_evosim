import { describe, expect, it } from 'vitest';
import { defaultConfig, type SimConfig } from '../src/core/config.ts';
import { primordialGenome } from '../src/core/genome.ts';
import { wrapDelta } from '../src/core/grid.ts';
import { LAND, MOUNTAIN, Terrain, WATER } from '../src/core/terrain.ts';
import { World } from '../src/core/world.ts';

const cfg = (o: Partial<SimConfig> = {}): SimConfig => ({ ...defaultConfig(), ...o });

/** Zusammenhängende Gebiete ohne Wasser (4er-Nachbarschaft, über den Rand gewickelt). */
function components(t: Terrain): Int32Array {
  const comp = new Int32Array(t.types.length).fill(-1);
  let n = 0;
  for (let s = 0; s < t.types.length; s++) {
    if (t.types[s] === WATER || comp[s] !== -1) continue;
    const stack = [s];
    comp[s] = n;
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % t.cols, r = Math.floor(i / t.cols);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = ((r + dr + t.rows) % t.rows) * t.cols + ((c + dc + t.cols) % t.cols);
        if (t.types[j] !== WATER && comp[j] === -1) { comp[j] = n; stack.push(j); }
      }
    }
    n++;
  }
  return comp;
}

describe('Gelände', () => {
  it('ist pro Seed reproduzierbar, verschiedene Seeds ergeben verschiedene Karten', () => {
    const a = Terrain.generate(cfg({ seed: 4 })), b = Terrain.generate(cfg({ seed: 4 })), c = Terrain.generate(cfg({ seed: 5 }));
    expect(a.types).toEqual(b.types);
    expect(a.types).not.toEqual(c.types);
  });

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`Seed ${seed}: 3–4 Kontinente, durch Wasser getrennt, mit Gebirge`, () => {
      const t = Terrain.generate(cfg({ seed }));
      expect(t.continents).toBeGreaterThanOrEqual(3);
      expect(t.continents).toBeLessThanOrEqual(4);
      const sh = t.shares();
      expect(sh.water).toBeGreaterThan(0.08);
      expect(sh.water).toBeLessThan(0.4);
      expect(sh.mountain / (sh.land + sh.mountain)).toBeCloseTo(0.12, 1);
      // Getrennt: Kein zusammenhängendes Landgebiet enthält zwei Kontinente
      const comp = components(t);
      const regionsOf = new Map<number, Set<number>>();
      for (let i = 0; i < comp.length; i++) if (comp[i] >= 0) (regionsOf.get(comp[i]) ?? regionsOf.set(comp[i], new Set()).get(comp[i])!).add(t.region[i]);
      for (const regions of regionsOf.values()) expect(regions.size).toBe(1);
      // Jeder Kontinent ist ordentlich groß (≥ 10 % des Landes)
      const size = new Array(t.continents).fill(0);
      for (const r of t.region) if (r >= 0) size[r]++;
      const land = size.reduce((a, b) => a + b, 0);
      for (const s of size) expect(s / land).toBeGreaterThan(0.1);
    });
  }

  it('Futter wächst nur auf fruchtbarem Land, Lebewesen bleiben an Land', () => {
    const w = new World(cfg({ seed: 3 }));
    for (let i = 0; i < 400; i++) w.step();
    for (let i = 0; i < w.foodX.length; i++) expect(w.terrain.typeAt(w.foodX[i], w.foodY[i])).toBe(LAND);
    for (const o of w.organisms) expect(w.terrain.typeAt(o.x, o.y)).not.toBe(WATER);
  });

  it('am Ufer prallt man ab – mit Treibgut landet man am anderen Ufer', () => {
    for (const driftChance of [0, 1]) {
      const w = new World(cfg({ seed: 3, initialPopulation: 0, minPopulation: 0, maxFood: 0, driftChance }));
      const t = w.terrain;
      // Ein Landpunkt, östlich davon Wasser und dahinter wieder Land
      let start: [number, number] | null = null;
      for (let i = 0; i < t.types.length && !start; i++) {
        const c = i % t.cols, r = Math.floor(i / t.cols);
        const at = (dc: number) => t.types[r * t.cols + ((c + dc) % t.cols)];
        if (at(0) === LAND && at(1) === WATER && [2, 3, 4, 5].some((d) => at(d) !== WATER)) start = [(c + 0.98) * t.cell, (r + 0.5) * t.cell];
      }
      expect(start).not.toBeNull();
      const o = w.spawn({ ...primordialGenome(w.rng), speed: 2 }, start![0], start![1], 1e6);
      o.genome.brain.fill(0); // geradeaus mit halbem Schub
      o.heading = 0;
      w.step();
      const type = t.typeAt(o.x, o.y);
      expect(type).not.toBe(WATER);
      if (driftChance === 0) expect(o.x).toBeCloseTo(start![0], 0); // abgeprallt, nicht übers Wasser
      else expect(wrapDelta(o.x - start![0], w.cfg.width)).toBeGreaterThan(t.cell); // übers Wasser getrieben (ggf. über den Weltrand)
    }
  });

  it('im Gebirge: kein Futter, langsamer laut mountainSlow, in Kältekrisen kälter', () => {
    const w = new World(cfg({ seed: 3, initialPopulation: 0, minPopulation: 0, maxFood: 0, mountainSlow: 0.5, mountainCold: 1 }));
    const t = w.terrain;
    const mi = t.types.findIndex((x) => x === MOUNTAIN), li = t.types.findIndex((x) => x === LAND);
    const pos = (i: number): [number, number] => [((i % t.cols) + 0.5) * t.cell, (Math.floor(i / t.cols) + 0.5) * t.cell];
    const g = { ...primordialGenome(w.rng), speed: 1 };
    g.brain.fill(0);
    const m = w.spawn({ ...g, brain: new Float32Array(g.brain) }, ...pos(mi), 100);
    const l = w.spawn({ ...g, brain: new Float32Array(g.brain) }, ...pos(li), 100);
    m.heading = l.heading = 0;
    w.step();
    expect(m.travelled).toBeCloseTo(l.travelled * 0.5, 6);
    expect(m.energy).toBeCloseTo(l.energy, 9); // ohne Krise keine Kälte
    w.startCrisis('eiszeit');
    const em = m.energy, el = l.energy;
    w.step();
    expect(em - m.energy).toBeGreaterThan(el - l.energy); // in der Eiszeit kostet das Gebirge mehr
  });
});
