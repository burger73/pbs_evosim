/**
 * Gemeinsame Datentypen und Konstanten der Simulation.
 * Bewusst ohne Logik – alle Module (und die Oberfläche) teilen sich diese Begriffe.
 */
import type { CrisisKind } from './config.ts';
import type { Genome } from './genome.ts';
import type { Learned } from './skills.ts';

export interface Organism {
  id: number;
  x: number;
  y: number;
  heading: number;
  energy: number;
  age: number;
  genome: Genome;
  /** Abstammungstiefe: wie viele Vorfahren bis zur Urform. */
  lineage: number;
  alive: boolean;
  /** Für den Schiedsrichter: gefressene Futterstücke und zurückgelegte Strecke. */
  eaten: number;
  travelled: number;
  /** Erlerntes Wissen (nur Kulturträger). */
  learned: Learned;
  /** Artgenossen in der Nähe (für die Fähigkeit „Gruppe“). */
  group: number;
  /** Seuche: 0 gesund, 1 krank, 2 immun. */
  infection: number;
}

export interface Sample {
  tick: number;
  population: number;
  /** „Wilde“ Räuber (keine Kulturträger). */
  predators: number;
  species: number;
  food: number;
  avgSize: number;
  avgSpeed: number;
  avgSense: number;
  avgDiet: number;
  /** Ø Fähigkeiten (genetisch + erlernt) aller Lebewesen. */
  avgSkills: number;
  /** Anteil der Kulturträger (0..1) und ihre Ø Fähigkeiten. */
  cultureShare: number;
  cultureSkills: number;
  maxSkills: number;
  /** Lebewesen, die Bedingung b) für den Kick erfüllen. */
  kickReady: number;
  crisis: CrisisKind | null;
  /** Bodenfruchtbarkeit 0..1 (sinkt durch Landwirtschaft). */
  fertility: number;
  /** Kontinent mit dem schlechtesten Boden. */
  fertilityRegion: number;
  /** Anteil Kranker (0..1). */
  infected: number;
  /** Erreichte Epoche der Kultur (0 = keine, 1–4). */
  epoch: number;
}

export interface SpeciesStat {
  id: number;
  hue: number;
  /** Geschätzte Individuenzahl. */
  members: number;
  /** Ø Fähigkeiten. */
  skills: number;
  /** Anteil Kulturträger (0..1). */
  culture: number;
  predator: boolean;
  /** Fähigkeiten, die mehr als die Hälfte der Art hat. */
  common: number;
  /** Schritt, in dem die Art zuerst gezählt wurde. */
  born: number;
  /** Nur im Schiedsrichter-Modus: Ø Wert des gewählten Kriteriums. */
  score: number;
  /** Kulturlinie der Mehrheit der Kulturträger dieser Art (0 = keine Kultur). */
  line: number;
  /** Kontinent, auf dem die meisten Mitglieder leben (−1 = unbekannt). */
  home: number;
}

/** Eine bemerkenswerte ausgestorbene Art (Höchststand ≥ NOTABLE_MEMBERS oder einmal Spitzenreiter). */
export interface ExtinctSpecies {
  id: number;
  hue: number;
  born: number;
  died: number;
  peakMembers: number;
  peakSkills: number;
  /** Mehrheits-Fähigkeiten zum Zeitpunkt der besten Ø Fähigkeiten. */
  common: number;
  wasLeader: boolean;
  /** Kontinent, auf dem die Art zuletzt hauptsächlich lebte (−1 = unbekannt). */
  home: number;
  /** Krise, während der die Art verschwand. */
  crisis: CrisisKind | null;
}

/** Die Art mit den meisten Fähigkeiten (Ø) – der Spitzenreiter. */
export interface Leader {
  id: number;
  hue: number;
  skills: number;
  members: number;
  culture: number;
  common: number;
  since: number;
}

/** Spitzenreiter zählen erst ab dieser Größe; Wechsel braucht 15 % Vorsprung, 3 Zählungen in Folge. */
export const LEADER_MIN_MEMBERS = 10;

export interface Census {
  tick: number;
  species: SpeciesStat[];
}

export interface CrisisReport {
  kind: CrisisKind;
  start: number;
  end: number;
  /** Anzahl Lebewesen je Fähigkeiten-Gruppe vor und nach der Krise. */
  buckets: { label: string; before: number; after: number }[];
  extinct: { count: number; avgSkills: number };
  survived: { count: number; avgSkills: number };
}

export interface SimEvent {
  tick: number;
  label: string;
}

export const SAMPLE_EVERY = 10;
export const CENSUS_EVERY = 50;
/** Ab diesem Ernährungswert kann ein Organismus andere fressen. */
export const PREDATOR_DIET = 0.3;
export const TIPPING_SHARE = 0.1;
export const TIPPING_SKILLS = 5;
export const MAX_SAMPLES = 2000;
export const MAX_CENSUS = 400;
/** Ausgestorbene Arten merken, wenn sie einmal so groß waren (oder Spitzenreiter). */
export const NOTABLE_MEMBERS = 30;
export const MAX_EXTINCT = 50;
/** Fähigkeiten-Gruppen für die Krisenbilanz: [Beschriftung, von, bis]. */
export const BUCKETS: [string, number, number][] = [['0', 0, 0], ['1–2', 1, 2], ['3–4', 3, 4], ['5+', 5, Infinity]];
