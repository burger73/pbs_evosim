import { describe, expect, it } from 'vitest';
import { LEGACY_WORLD, defaultConfig, type SimConfig } from '../src/core/config.ts';
import { mutate, primordialGenome } from '../src/core/genome.ts';
import { Rng } from '../src/core/rng.ts';
import { SKILL, has } from '../src/core/skills.ts';
import { LAND, WATER } from '../src/core/terrain.ts';
import { World } from '../src/core/world.ts';

const cfg = (o: Partial<SimConfig> = {}): SimConfig => ({ ...defaultConfig(), ...LEGACY_WORLD, ...o });
const quiet = { initialPopulation: 0, minPopulation: 0, maxFood: 0, baseCost: 0, moveCost: 0, senseCost: 0, cultureCost: 0, reproFactor: 1e9 };
const G = (i: number) => 1 << i;
const ready = G(SKILL.graben) | G(SKILL.netz) | G(SKILL.gruppe);

describe('Kulturlinien', () => {
  it('jeder Kick gründet eine eigene Linie, Kinder erben sie', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 150, maxPopulation: 10 }));
    const a = w.spawn({ ...primordialGenome(w.rng), skills: ready }, 100, 100, 1e6);
    const b = w.spawn({ ...primordialGenome(w.rng), skills: ready }, 900, 600, 1e6);
    for (let i = 0; i < 50 && !(a.genome.culture && b.genome.culture); i++) w.step();
    expect(a.genome.line).toBeGreaterThan(0);
    expect(b.genome.line).toBeGreaterThan(0);
    expect(a.genome.line).not.toBe(b.genome.line);
    const child = mutate(a.genome, new Rng(1), 0);
    expect(child.line).toBe(a.genome.line);
  });

  it('verliert ein Kind die Kulturfähigkeit, verliert es auch Linie und Wissen', () => {
    const rng = new Rng(3);
    const parent = { ...primordialGenome(rng), culture: true, line: 7 };
    let lost = null;
    for (let i = 0; i < 2000 && !lost; i++) { const c = mutate(parent, rng, 1); if (!c.culture) lost = c; }
    expect(lost!.line).toBe(0);
    // Wissen: in der Welt bekommt ein solches Kind nichts mit
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, transmission: 1, reproFactor: 1, mutationRate: 0 }));
    const p = w.spawn({ ...primordialGenome(w.rng), culture: false }, 100, 100, 1000);
    p.learned = { mask: G(SKILL.werkzeug), extra: 3 };
    w.step();
    const kid = w.organisms.find((o) => o.age === 0)!;
    expect(kid.learned).toEqual({ mask: 0, extra: 0 });
  });

  it('gelernt wird nur in der eigenen Linie', () => {
    for (const [pupilLine, expectLearned] of [[1, true], [2, false]] as const) {
      const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, learnRate: 1, maxPopulation: 2 }));
      const g = { ...primordialGenome(w.rng), culture: true, speed: 0.1 };
      const teacher = w.spawn({ ...g, line: 1 }, 100, 100, 50);
      teacher.learned = { mask: G(SKILL.werkzeug), extra: 0 };
      const pupil = w.spawn({ ...g, line: pupilLine }, 110, 100, 50);
      for (let i = 0; i < 5; i++) w.step();
      expect(has(pupil.learned.mask, SKILL.werkzeug)).toBe(expectLearned);
    }
  });

  it('Epochen-Grenzen gelten je Linie: die kleine Linie vergisst, die große behält', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, learnRate: 0, forgetRate: 0.05, maxPopulation: 100 }));
    const mask = G(SKILL.werkzeug) | G(SKILL.landwirtschaft) | G(SKILL.feuer);
    const big = Array.from({ length: 60 }, (_, i) => w.spawn({ ...primordialGenome(w.rng), culture: true, line: 1, speed: 0.1 }, 20 + (i % 10) * 15, 20 + Math.floor(i / 10) * 15, 1e6));
    const small = Array.from({ length: 5 }, (_, i) => w.spawn({ ...primordialGenome(w.rng), culture: true, line: 2, speed: 0.1 }, 800 + i * 15, 600, 1e6));
    for (const o of [...big, ...small]) o.learned = { mask, extra: 0 };
    for (let i = 0; i < 200; i++) w.step();
    expect(big.every((o) => has(o.learned.mask, SKILL.landwirtschaft))).toBe(true); // 60 ≥ 50: Sesshaftigkeit hält
    expect(small.some((o) => has(o.learned.mask, SKILL.landwirtschaft))).toBe(false); // 5 < 50: vergessen
    expect(small.every((o) => has(o.learned.mask, SKILL.feuer))).toBe(true); // Steinzeit geht auch klein
    const lines = new Map(w.cultureLines.map((l) => [l.id, l]));
    expect(lines.get(1)!.epoch).toBe(2);
    expect(lines.get(2)!.epoch).toBe(1);
  });

  it('„Kultur erloschen“ wird genau einmal gemeldet – erst wenn kein Träger mehr lebt', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, learnRate: 0, forgetRate: 0, maxPopulation: 100 }));
    const mask = G(SKILL.werkzeug) | G(SKILL.landwirtschaft);
    const members = Array.from({ length: 4 }, (_, i) => w.spawn({ ...primordialGenome(w.rng), culture: true, line: 5, speed: 0.1 }, 100 + i * 15, 100, 1e6));
    for (const o of members) o.learned = { mask, extra: 0 };
    for (let i = 0; i < 60; i++) w.step(); // Epoche 2 erreicht
    members[0].alive = false; members[1].alive = false; // unter 3 Träger: Epoche fällt, aber nicht „erloschen“
    for (let i = 0; i < 60; i++) w.step();
    expect(w.events.filter((e) => e.label.startsWith('📉 Kultur erloschen'))).toHaveLength(0);
    members[2].alive = false; members[3].alive = false;
    for (let i = 0; i < 60; i++) w.step();
    expect(w.events.filter((e) => e.label.startsWith('📉 Kultur erloschen'))).toHaveLength(1);
  });

  it('mit 🛶 Boot geht es übers Wasser', () => {
    const w = new World({ ...defaultConfig(), seed: 3, ...quiet, driftChance: 0 });
    const t = w.terrain;
    let start: [number, number] | null = null;
    for (let i = 0; i < t.types.length && !start; i++) {
      const c = i % t.cols, r = Math.floor(i / t.cols);
      if (c + 1 < t.cols && t.types[i] === LAND && t.types[i + 1] === WATER) start = [(c + 0.98) * t.cell, (r + 0.5) * t.cell];
    }
    const g = { ...primordialGenome(w.rng), speed: 2, culture: true, line: 1 };
    g.brain.fill(0);
    const sailor = w.spawn({ ...g, brain: new Float32Array(g.brain) }, ...start!, 1e6);
    sailor.learned = { mask: G(SKILL.werkzeug) | G(SKILL.boot), extra: 0 };
    sailor.heading = 0;
    w.step();
    expect(t.typeAt(sailor.x, sailor.y)).toBe(WATER);
  });

  it('Kulturträger fressen keine Kulturträger – auch nicht als Fleischfresser', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, huntSizeBonus: 0.6 }));
    const big = w.spawn({ ...primordialGenome(w.rng), culture: true, line: 1, size: 2, diet: 1 }, 100, 100, 10);
    const small = w.spawn({ ...primordialGenome(w.rng), culture: true, line: 1, size: 0.6, diet: 0 }, 100, 100, 50);
    big.learned = { mask: G(SKILL.werkzeug) | G(SKILL.waffen), extra: 0 };
    expect(w.canEat(big, small)).toBe(false);
    small.genome = { ...small.genome, culture: false, line: 0 };
    expect(w.canEat(big, small)).toBe(true); // Wilde dürfen gejagt werden
  });

  it('Kulturträger jagen nur bei Hunger', () => {
    for (const [energy, expectEaten] of [[1e4, false], [5, true]] as const) {
      const w = new World(cfg({ ...quiet, cultureBoost: 0, reproFactor: 70 })); // normale Schwelle: Hunger = Energie < 0,5 · 70 · Fläche
      const hunter = w.spawn({ ...primordialGenome(w.rng), culture: true, line: 1, size: 1.5, diet: 0, speed: 0.1 }, 100, 100, energy);
      hunter.learned = { mask: G(SKILL.werkzeug) | G(SKILL.waffen), extra: 0 };
      const prey = w.spawn({ ...primordialGenome(w.rng), size: 0.6, diet: 0, speed: 0.1 }, 103, 100, 20);
      w.step();
      expect(prey.alive).toBe(!expectEaten);
    }
  });
});
