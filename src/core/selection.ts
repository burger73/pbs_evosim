/**
 * Selektion: In der Natur entscheiden Hunger, Alter und Fortpflanzung – im Schiedsrichter-Modus
 * wählt am Generationsende das Kriterium die Eltern aus.
 */
import { mutate, primordialGenome } from './genome.ts';
import { WATER } from './terrain.ts';
import { fitness, maxAge } from './traits.ts';
import type { Organism } from './types.ts';
import type { World } from './world.ts';

/** Natur: Tod durch Hunger/Alter, Teilung bei genug Energie. Kein Schiedsrichter. */
export function naturalSelection(w: World): void {
  const cfg = w.cfg;
  const rng = w.rng;
  const survivors: Organism[] = [];
  for (const o of w.organisms) {
    if (!o.alive || o.energy <= 0 || o.age > maxAge(cfg, o)) { o.alive = false; continue; }
    survivors.push(o);
  }
  w.organisms = survivors;
  const babies: Organism[] = [];
  for (const o of survivors) {
    const area = o.genome.size * o.genome.size;
    if (o.energy > cfg.reproFactor * area && survivors.length + babies.length < cfg.maxPopulation) {
      const childEnergy = o.energy * 0.45; // 10 % gehen bei der Teilung verloren
      o.energy *= 0.45;
      babies.push({
        id: w.nextOrganismId(),
        x: (o.x + rng.gauss() * 6 + cfg.width) % cfg.width,
        y: (o.y + rng.gauss() * 6 + cfg.height) % cfg.height,
        heading: rng.range(0, Math.PI * 2),
        energy: childEnergy,
        age: 0,
        genome: mutate(o.genome, rng, cfg.mutationRate),
        lineage: o.lineage + 1,
        alive: true,
        eaten: 0,
        travelled: 0,
        learned: w.cultureSystem.inherit(w, o),
        group: 0,
        infection: 0,
      });
      // Ein Kind, das neben dem Ufer im Wasser landen würde, bleibt beim Elternteil
      const b = babies[babies.length - 1];
      if (cfg.terrain && w.terrain.typeAt(b.x, b.y) === WATER) { b.x = o.x; b.y = o.y; }
    }
  }
  for (const b of babies) w.organisms.push(b);
  if (w.organisms.length < cfg.minPopulation) {
    const refugium = w.censusSystem.refugium;
    if (w.organisms.length === 0) w.addEvent(refugium.length ? 'Ausgestorben – Überlebende aus Refugien' : 'Ausgestorben – Urformen wandern ein');
    while (w.organisms.length < cfg.minPopulation) {
      // Neubesiedlung aus Refugien (ohne Kultur); nur am Anfang Urformen
      const g = refugium.length
        ? { ...mutate(refugium[rng.int(refugium.length)], rng, cfg.mutationRate), culture: false }
        : primordialGenome(rng);
      w.spawn(g);
    }
  }
}

/** Schiedsrichter: Am Generationsende pflanzen sich nur die „Besten“ fort. */
export function judge(w: World): void {
  const cfg = w.cfg;
  const ranked = [...w.organisms].sort((a, b) => fitness(b, cfg.fitness) - fitness(a, cfg.fitness));
  const nElite = Math.max(1, Math.round(ranked.length * cfg.eliteFraction));
  const elite = ranked.slice(0, nElite);
  for (const o of w.organisms) o.alive = false;
  w.organisms = [];
  for (let i = 0; i < cfg.judgePopulation; i++) {
    const parent = elite[w.rng.int(elite.length)];
    w.spawn(mutate(parent.genome, w.rng, cfg.mutationRate), undefined, undefined, cfg.startEnergy, parent.lineage + 1);
  }
  w.generation++;
}
