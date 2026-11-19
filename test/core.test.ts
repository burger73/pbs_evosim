import { describe, expect, it } from 'vitest';
import { defaultConfig, type SimConfig } from '../src/core/config.ts';
import { LIMITS, hueDistance, mutate, primordialGenome } from '../src/core/genome.ts';
import { Grid } from '../src/core/grid.ts';
import { Rng } from '../src/core/rng.ts';
import { clusterSpecies } from '../src/core/species.ts';
import { GENETIC_MASK, SKILL, SKILLS, available, has, popcount } from '../src/core/skills.ts';
import { mutateSkills } from '../src/core/genome.ts';
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
    const base = { speed: 1, sense: 0.3, skills: 0, culture: false };
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


const quiet = { initialPopulation: 0, minPopulation: 0, maxFood: 0 };
const G = (i: number) => 1 << i;

describe('Genetische Fähigkeiten', () => {
  it('Mutation erzeugt nur genetische Fähigkeiten und beachtet Voraussetzungen', () => {
    const rng = new Rng(11);
    let mask = 0;
    for (let i = 0; i < 20000; i++) mask = mutateSkills(mask, rng, 3);
    expect(mask & ~GENETIC_MASK).toBe(0);
    expect(SKILLS.filter((d) => !d.genetic).every((d) => d.requires !== 0)).toBe(true);
  });
  it('nur Gräber kommen an vergrabenes Futter', () => {
    for (const [skills, expectEaten] of [[0, false], [G(SKILL.graben), true]] as const) {
      const w = new World(cfg({ ...quiet, maxFood: 1, buriedShare: 1, foodRate: 0 }));
      (w as unknown as { addFood: (x: number, y: number, l: number, b: boolean) => void }).addFood(102, 100, 10, true);
      const o = w.spawn({ ...primordialGenome(w.rng), skills, speed: 0.1 }, 100, 100, 30);
      w.step();
      expect(o.eaten > 0).toBe(expectEaten);
    }
  });
  it('Bau schützt vor gleich großen Räubern, Hütte vor allen', () => {
    const w = new World(cfg(quiet));
    const pred = w.spawn({ ...primordialGenome(w.rng), size: 1.4, diet: 1 }, 100, 100, 50);
    const prey = w.spawn({ ...primordialGenome(w.rng), size: 1, diet: 0 }, 103, 100, 50);
    expect(w.canEat(pred, prey)).toBe(true);
    prey.genome = { ...prey.genome, skills: G(SKILL.bau) };
    expect(w.canEat(pred, prey)).toBe(false);
    prey.genome = { ...prey.genome, skills: 0 };
    prey.learned = { mask: G(SKILL.huette), extra: 0 };
    pred.genome = { ...pred.genome, size: 3 };
    expect(w.canEat(pred, prey)).toBe(false);
  });
});

describe('Kultur', () => {
  const ready = G(SKILL.graben) | G(SKILL.netz) | G(SKILL.gruppe);
  it('Anschwung 0 → nie ein Kick', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, maxPopulation: 1 }));
    const o = w.spawn({ ...primordialGenome(w.rng), skills: ready }, 100, 100, 1e6);
    for (let i = 0; i < 300; i++) w.step();
    expect(o.genome.culture).toBe(false);
  });
  it('Kick nur mit genug vererbten Fähigkeiten (Bedingung b)', () => {
    for (const [skills, expectCulture] of [[G(SKILL.graben), false], [ready, true]] as const) {
      const w = new World(cfg({ ...quiet, cultureBoost: 150, maxPopulation: 1 }));
      const o = w.spawn({ ...primordialGenome(w.rng), skills }, 100, 100, 1e6);
      for (let i = 0; i < 50; i++) w.step();
      expect(o.genome.culture).toBe(expectCulture);
    }
  });
  it('Kulturträger entdecken auch kulturelle Fähigkeiten, Nicht-Kulturträger nicht', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 1, maxPopulation: 2 }));
    const c = w.spawn({ ...primordialGenome(w.rng), culture: true }, 100, 100, 1e6);
    const n = w.spawn({ ...primordialGenome(w.rng) }, 600, 400, 1e6);
    for (let i = 0; i < 200; i++) w.step();
    expect(has(c.learned.mask, SKILL.feuer)).toBe(true); // Steinzeit: geht allein
    expect(has(c.learned.mask, SKILL.schrift)).toBe(false); // Hochkultur: braucht 150 Kulturträger
    expect(popcount(n.learned.mask)).toBe(0);
  });
  it('vergisst Fähigkeiten, wenn die Kultur zu klein für ihre Epoche ist (Tasmanien-Effekt)', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, learnRate: 0, forgetRate: 0.05, maxPopulation: 1 }));
    const o = w.spawn({ ...primordialGenome(w.rng), culture: true }, 100, 100, 1e6);
    o.learned = { mask: G(SKILL.feuer) | G(SKILL.schrift) | G(SKILL.landwirtschaft), extra: 0 };
    for (let i = 0; i < 300; i++) w.step();
    expect(has(o.learned.mask, SKILL.feuer)).toBe(true);
    expect(has(o.learned.mask, SKILL.schrift)).toBe(false);
    expect(has(o.learned.mask, SKILL.landwirtschaft)).toBe(false);
  });
  it('Erlerntes erben nur Kinder von Kulturträgern', () => {
    for (const culture of [false, true]) {
      const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, transmission: 1 }));
      w.spawn({ ...primordialGenome(w.rng), culture }, 100, 100, 1000).learned = { mask: G(SKILL.werkzeug), extra: 0 };
      w.step();
      const child = w.organisms.find((o) => o.age === 0)!;
      expect(has(child.learned.mask, SKILL.werkzeug)).toBe(culture);
    }
  });
  it('lernt von Artgenossen mit mehr Wissen', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, learnRate: 1, maxPopulation: 2 }));
    const g = { ...primordialGenome(w.rng), culture: true, speed: 0.1 };
    const teacher = w.spawn(g, 100, 100, 50);
    teacher.learned = { mask: G(SKILL.werkzeug), extra: 0 };
    const pupil = w.spawn({ ...g }, 110, 100, 50);
    for (let i = 0; i < 5; i++) w.step();
    expect(has(pupil.learned.mask, SKILL.werkzeug)).toBe(true);
  });
  it('erkennt den Kipppunkt genau einmal', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, discoveryRate: 0, maxPopulation: 20, baseCost: 0, moveCost: 0, senseCost: 0, cultureCost: 0, reproFactor: 1e9 }));
    for (let i = 0; i < 20; i++) w.spawn({ ...primordialGenome(w.rng), culture: true }, 30 * i, 100, 100).learned = { mask: 0b111111111, extra: 0 };
    for (let i = 0; i < 100; i++) w.step();
    expect(w.tippingTick).not.toBeNull();
    expect(w.events.filter((e) => e.label === '⚡ Kultur kippt')).toHaveLength(1);
  });
  it('available() kennt den Baum', () => {
    expect(available(0, false)).toEqual(SKILLS.map((d, i) => (d.requires === 0 ? i : -1)).filter((i) => i >= 0));
  });
});

describe('Spitzenreiter', () => {
  it('ist die Art mit den meisten Fähigkeiten (Durchschnitt), nicht die größte', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, reproFactor: 1e9, baseCost: 0, moveCost: 0, senseCost: 0 }));
    const base = { speed: 0.1, sense: 0.3, diet: 0, size: 1 };
    for (let i = 0; i < 40; i++) w.spawn({ ...primordialGenome(w.rng), ...base, hue: 180, skills: 0 }, 20 * i, 300, 100);
    for (let i = 0; i < 15; i++) w.spawn({ ...primordialGenome(w.rng), ...base, hue: 0, skills: G(SKILL.graben) | G(SKILL.netz) }, 20 * i, 600, 100);
    for (let i = 0; i < 50; i++) w.step();
    expect(w.leader).not.toBeNull();
    expect(hueDistance(w.leader!.hue, 0)).toBeLessThan(30);
    expect(has(w.leader!.common, SKILL.graben)).toBe(true);
  });
});

describe('Krisen', () => {
  it('Eiszeit kostet Energie, Feuer/Kleidung/Hütte mildern sie, Bilanz am Ende', () => {
    const w = new World(cfg({ ...quiet, cultureBoost: 0, reproFactor: 1e9 }));
    const plain = w.spawn({ ...primordialGenome(w.rng), speed: 0.1 }, 100, 100, 500);
    const warm = w.spawn({ ...primordialGenome(w.rng), speed: 0.1, size: plain.genome.size, sense: plain.genome.sense }, 500, 400, 500);
    warm.learned = { mask: G(SKILL.feuer) | G(SKILL.kleidung) | G(SKILL.huette), extra: 0 };
    w.startCrisis('eiszeit');
    for (let i = 0; i < 100; i++) w.step();
    expect(warm.energy).toBeGreaterThan(plain.energy);
    for (let i = 0; i < 1500; i++) w.step();
    expect(w.crisis).toBeNull();
    expect(w.crisisReports).toHaveLength(1);
  });
  it('Vulkanwinter tötet sofort einen Teil der Population', () => {
    const w = new World(cfg({ initialPopulation: 200 }));
    w.startCrisis('vulkan');
    expect(w.organisms.filter((o) => o.alive).length).toBeLessThan(170);
  });
});
