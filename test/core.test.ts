import { describe, expect, it } from 'vitest';
import { defaultConfig, type SimConfig } from '../src/core/config.ts';
import { LIMITS, hueDistance, mutate, primordialGenome } from '../src/core/genome.ts';
import { Grid } from '../src/core/grid.ts';
import { Rng } from '../src/core/rng.ts';
import { clusterSpecies } from '../src/core/species.ts';
import { SKILL, available, has, skillCount } from '../src/core/skills.ts';
import { World } from '../src/core/world.ts';

const cfg = (o: Partial<SimConfig> = {}): SimConfig => ({ ...defaultConfig(), ...o });

describe('Rng', () => {
  it('ist mit gleichem Seed reproduzierbar', () => {
    const a = new Rng(7), b = new Rng(7);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('liefert Werte in [0, 1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 10000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('Genom', () => {
  it('bleibt nach vielen Mutationen in den Grenzen', () => {
    const rng = new Rng(3);
    let g = primordialGenome(rng);
    for (let i = 0; i < 2000; i++) g = mutate(g, rng, 3);
    for (const k of ['size', 'speed', 'sense', 'diet'] as const) {
      expect(g[k]).toBeGreaterThanOrEqual(LIMITS[k][0]);
      expect(g[k]).toBeLessThanOrEqual(LIMITS[k][1]);
    }
    expect(g.hue).toBeGreaterThanOrEqual(0);
    expect(g.hue).toBeLessThan(360);
  });
  it('Mutationsrate 0 ergibt eine exakte Kopie', () => {
    const rng = new Rng(4);
    const g = primordialGenome(rng);
    const c = mutate(g, rng, 0);
    expect(c.size).toBe(g.size);
    expect(Array.from(c.brain)).toEqual(Array.from(g.brain));
    expect(c.brain).not.toBe(g.brain);
  });
  it('misst Farbabstände auf dem Kreis', () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
  });
});

describe('Grid', () => {
  it('findet Nachbarn über den Weltrand hinweg (Torus)', () => {
    const g = new Grid(100, 100, 10);
    g.insert(1, 99, 50);
    const found: number[] = [];
    g.forEachNear(1, 50, 5, (id) => found.push(id));
    expect(found).toContain(1);
  });
});

describe('Arten', () => {
  it('erkennt zwei deutlich verschiedene Gruppen', () => {
    const rng = new Rng(5);
    const base = { speed: 1, sense: 0.3, intellect: 0.1 };
    const a = Array.from({ length: 20 }, () => ({ ...primordialGenome(rng), ...base, hue: 0, diet: 0, size: 1 }));
    const b = Array.from({ length: 20 }, () => ({ ...primordialGenome(rng), ...base, hue: 180, diet: 1, size: 2.5 }));
    expect(clusterSpecies([...a, ...b])).toHaveLength(2);
  });
});

describe('World – Natur', () => {
  it('ist mit gleichem Seed deterministisch', () => {
    const a = new World(cfg()), b = new World(cfg());
    for (let i = 0; i < 300; i++) { a.step(); b.step(); }
    expect(a.samples).toEqual(b.samples);
  });
  it('Organismus mit viel Energie teilt sich', () => {
    const w = new World(cfg({ initialPopulation: 0, minPopulation: 0, maxFood: 0 }));
    const o = w.spawn(primordialGenome(w.rng), 100, 100, 1000);
    w.step();
    expect(w.organisms.length).toBe(2);
    expect(o.energy).toBeLessThan(500);
  });
  it('großer Räuber frisst kleine Beute bei Berührung', () => {
    const w = new World(cfg({ initialPopulation: 0, minPopulation: 0, maxFood: 0 }));
    const pred = w.spawn({ ...primordialGenome(w.rng), size: 2.5, diet: 1, speed: 0.1 }, 100, 100, 50);
    w.spawn({ ...primordialGenome(w.rng), size: 0.6, diet: 0, speed: 0.1 }, 103, 100, 50);
    const before = pred.energy;
    w.step();
    expect(w.organisms.length).toBe(1);
    expect(pred.energy).toBeGreaterThan(before);
  });
  it('verhungerte Organismen sterben', () => {
    const w = new World(cfg({ initialPopulation: 0, minPopulation: 0, maxFood: 0 }));
    w.spawn(primordialGenome(w.rng), 100, 100, 0.001);
    w.step();
    expect(w.organisms.length).toBe(0);
  });
});

describe('World – Schiedsrichter', () => {
  it('„Wer am rötesten ist“ macht die Population rot – ohne Nutzen fürs Überleben', () => {
    const w = new World(cfg({ mode: 'schiedsrichter', fitness: 'rot', generationTicks: 20, judgePopulation: 60 }));
    const redness = () => w.organisms.reduce((s, o) => s + hueDistance(o.genome.hue, 0), 0) / w.organisms.length;
    const start = redness();
    for (let i = 0; i < 20 * 40; i++) w.step();
    expect(w.generation).toBe(40);
    expect(redness()).toBeLessThan(start - 40);
  });
});

describe('Kultur', () => {
  const quiet = { initialPopulation: 0, minPopulation: 0, maxFood: 0 };
  it('ohne freigeschaltete Kultur entsteht keine Fähigkeit', () => {
    const w = new World(cfg({ ...quiet, discoveryRate: 1 }));
    const o = w.spawn({ ...primordialGenome(w.rng), intellect: 1 }, 100, 100, 1e6);
    for (let i = 0; i < 50; i++) w.step();
    expect(skillCount(o.skills)).toBe(0);
  });
  it('Entdeckungen respektieren den Technologie-Baum', () => {
    expect(available({ mask: 0, extra: 0 })).toEqual([SKILL.werkzeug, SKILL.sprache]);
    const w = new World(cfg({ ...quiet, cultureUnlocked: true, discoveryRate: 1, maxPopulation: 1 }));
    const o = w.spawn({ ...primordialGenome(w.rng), intellect: 1 }, 100, 100, 1e6);
    for (let i = 0; i < 200; i++) w.step();
    expect(skillCount(o.skills)).toBeGreaterThan(9); // alle benannten + weitere Erfindungen
    expect(has(o.skills, SKILL.schrift)).toBe(true);
  });
  it('Kinder dummer Eltern erben nichts, Kinder kluger Eltern schon', () => {
    for (const [intellect, expectSkills] of [[0.1, false], [0.9, true]] as const) {
      const w = new World(cfg({ ...quiet, cultureUnlocked: true, discoveryRate: 0, transmission: 1 }));
      w.spawn({ ...primordialGenome(w.rng), intellect }, 100, 100, 1000).skills = { mask: 0b11, extra: 0 };
      w.step();
      const child = w.organisms.find((o) => o.age === 0)!;
      expect(skillCount(child.skills) > 0).toBe(expectSkills);
    }
  });
  it('lernt von klügeren Nachbarn', () => {
    const w = new World(cfg({ ...quiet, cultureUnlocked: true, discoveryRate: 0, learnRate: 1, maxPopulation: 2 }));
    const g = { ...primordialGenome(w.rng), intellect: 1, speed: 0.1 };
    const teacher = w.spawn(g, 100, 100, 50);
    teacher.skills = { mask: 1 << SKILL.werkzeug, extra: 0 };
    const pupil = w.spawn(g, 110, 100, 50);
    for (let i = 0; i < 5; i++) w.step();
    expect(has(pupil.skills, SKILL.werkzeug)).toBe(true);
  });
  it('erkennt den Kipppunkt und markiert ihn genau einmal', () => {
    const w = new World(cfg({ ...quiet, cultureUnlocked: true, discoveryRate: 0, maxPopulation: 20, baseCost: 0, moveCost: 0, senseCost: 0, intellectCost: 0, reproFactor: 1e9 }));
    for (let i = 0; i < 20; i++) w.spawn({ ...primordialGenome(w.rng), intellect: 0.9 }, 30 * i, 100, 100).skills = { mask: 0b111, extra: 0 };
    for (let i = 0; i < 100; i++) w.step();
    expect(w.tippingTick).not.toBeNull();
    expect(w.events.filter((e) => e.label === 'Kipppunkt')).toHaveLength(1);
  });
  it('Waffen schützen vor Räubern', () => {
    const w = new World(cfg(quiet));
    const pred = w.spawn({ ...primordialGenome(w.rng), size: 2.5, diet: 1 }, 100, 100, 50);
    const armed = w.spawn({ ...primordialGenome(w.rng), size: 0.6, diet: 0 }, 103, 100, 50);
    armed.skills = { mask: 1 << SKILL.waffen, extra: 0 };
    expect(w.canEat(pred, armed)).toBe(false);
  });
});
