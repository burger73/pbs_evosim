/**
 * Abgeleitete Eigenschaften eines Lebewesens: Größe, Sicht, Fähigkeiten, wer wen fressen kann …
 * Reine Funktionen ohne Zustand und ohne Zufall – leicht zu testen und überall nutzbar.
 */
import type { Fitness, SimConfig } from './config.ts';
import { hueDistance } from './genome.ts';
import { GENETIC_MASK, SKILL, has, popcount } from './skills.ts';
import { PREDATOR_DIET, type Organism } from './types.ts';

export function radius(cfg: SimConfig, o: Organism): number {
  return cfg.baseRadius * o.genome.size;
}

/** Effektive Sehweite: ohne Augen (Fähigkeit oder „Augen für alle“) nur Tastsinn. */
export function senseRadius(cfg: SimConfig, o: Organism): number {
  const r = o.genome.sense * cfg.maxSense;
  const eyes = cfg.eyesUnlocked || has(skillsOf(o), SKILL.augen);
  const cap = eyes ? cfg.maxSense : cfg.touchRange;
  return Math.max(radius(cfg, o) + 2, Math.min(r, cap));
}

/** Alle Fähigkeiten: genetische + erlernte. */
export function skillsOf(o: Organism): number {
  return o.genome.skills | o.learned.mask;
}

export function skillCount(o: Organism): number {
  return popcount(skillsOf(o)) + o.learned.extra;
}

export function isPredator(o: Organism): boolean {
  return o.genome.diet > PREDATOR_DIET;
}

/** Kann jagen: Räuber von Natur aus – oder mit Waffen. */
export function isHunter(o: Organism): boolean {
  return isPredator(o) || has(o.learned.mask, SKILL.waffen);
}

export function canEat(cfg: SimConfig, a: Organism, b: Organism): boolean {
  if (cfg.mode !== 'natur') return false;
  const sa = skillsOf(a), sb = skillsOf(b);
  const aW = has(sa, SKILL.waffen), bW = has(sb, SKILL.waffen);
  if (bW && !aW) return false; // Waffen schützen
  if (has(sb, SKILL.huette) && !aW) return false; // Hütte schützt
  const ra = radius(cfg, a), rb = radius(cfg, b);
  // Kulturträger mit Waffen jagen alles bis doppelte Größe – außer andere Kulturträger
  if (aW && !b.genome.culture && ra * (has(sa, SKILL.metall) ? 3 : 2) > rb) return true;
  if (!isPredator(a)) return false;
  let ratio = cfg.predatorSizeRatio;
  if (has(sa, SKILL.gruppe) && a.group >= 2) ratio = 0.9; // Rudeljagd
  if (has(sb, SKILL.bau)) ratio *= 1.5; // aus dem Bau schwer herauszuholen
  if (has(sb, SKILL.gruppe) && b.group >= 2) ratio *= 1.4; // Schutz in der Herde
  return ra > ratio * rb;
}

/** Speichergrenze für Energie: doppelte Teilungsschwelle, mit Vorrat das Dreifache davon. */
export function maxEnergy(cfg: SimConfig, o: Organism): number {
  const area = o.genome.size * o.genome.size;
  return cfg.reproFactor * area * 2 * (has(skillsOf(o), SKILL.vorrat) ? 3 : 1);
}

export function maxAge(cfg: SimConfig, o: Organism): number {
  const s = skillsOf(o);
  let m = cfg.maxAge;
  if (has(s, SKILL.kleidung)) m *= 1.2;
  if (has(s, SKILL.medizin)) m *= 1.5;
  return m;
}

/** Bedingung b) für den Kick erfüllt? */
export function kickReady(cfg: SimConfig, o: Organism): boolean {
  return !o.genome.culture && popcount(o.genome.skills & GENETIC_MASK) >= cfg.kickMinSkills;
}

/** Schiedsrichter-Kriterium. */
export function fitness(o: Organism, f: Fitness): number {
  switch (f) {
    case 'futter': return o.eaten;
    case 'rot': return 1 - hueDistance(o.genome.hue, 0) / 180;
    case 'groesse': return o.genome.size;
    case 'strecke': return o.travelled;
  }
}
