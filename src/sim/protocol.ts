/**
 * Nachrichten zwischen Oberfläche (Hauptthread) und Simulation (Web Worker).
 *
 * Ablauf: Die Oberfläche schickt pro Bild höchstens eine `run`-Anfrage; der Worker rechnet bis zu
 * `steps` Schritte (aber höchstens ein Zeitbudget lang) und antwortet mit einer Momentaufnahme.
 * Alles andere (Krise auslösen, Regler, Auswahl) sind kurze Befehle dazwischen.
 */
import type { CrisisKind, SimConfig } from '../core/config.ts';
import type { Census, CrisisReport, ExtinctSpecies, Leader, Sample, SimEvent } from '../core/types.ts';

/** Geplante Ereignisse aus der URL (?augen=T, ?eiszeit=T …). */
export type PlannedAction = { tick: number; action: 'augen' | CrisisKind };

export type ToWorker =
  | { type: 'init'; cfg: SimConfig; planned: PlannedAction[]; prerun: number }
  | { type: 'run'; steps: number }
  | { type: 'set'; patch: Partial<SimConfig>; event?: string }
  | { type: 'crisis'; kind: CrisisKind }
  | { type: 'select'; x: number; y: number; /** Treffer-Radius in Weltkoordinaten */ r: number }
  | { type: 'deselect' }
  | { type: 'pick'; id: number | null };

/** Lebewesen zum Zeichnen: je ORG_STRIDE Zahlen. */
export const ORG_STRIDE = 6;
export const O_X = 0, O_Y = 1, O_R = 2, O_HUE = 3, O_FLAGS = 4, O_GSKILLS = 5;
export const F_PRED = 1, F_CULTURE = 2, F_SICK = 4, F_PICKED = 8;

/** Das ausgewählte (angeklickte) Lebewesen. */
export interface SelectedInfo {
  id: number;
  alive: boolean;
  x: number;
  y: number;
  r: number;
  senseR: number;
  hue: number;
  role: 'kultur' | 'raeuber' | 'pflanze';
  size: number;
  speed: number;
  sense: number;
  diet: number;
  /** vererbte Fähigkeiten (Bitmaske) */
  skills: number;
  /** nur gelernte (Bitmaske) */
  learnedOnly: number;
  extra: number;
  energy: number;
  age: number;
  lineage: number;
}

export interface Snapshot {
  tick: number;
  generation: number;
  population: number;
  speciesCount: number;
  /** Lebewesen (ORG_STRIDE Zahlen je Lebewesen) */
  orgs: Float32Array;
  /** Futter: x, y, vergraben (0/1) */
  food: Float32Array;
  /** Nur was seit der letzten Momentaufnahme neu ist. */
  newSamples: Sample[];
  newCensus: Census[];
  newEvents: SimEvent[];
  /** Nur bei Änderung gesetzt (sonst null). */
  extinct: ExtinctSpecies[] | null;
  crisisReports: CrisisReport[] | null;
  leader: Leader | null;
  crisis: { kind: CrisisKind; until: number; start: number } | null;
  tippingTick: number | null;
  firstSpark: number | null;
  selected: SelectedInfo | null;
  /** Gerechnete Schritte in dieser Antwort und Zeit dafür (für die Tempo-Anzeige). */
  steps: number;
  ms: number;
  /** true = Antwort auf init (Oberfläche setzt ihre Listen zurück). */
  reset: boolean;
  /** Nur bei reset: das Gelände (LAND/WATER/MOUNTAIN je Zelle, Kontinent je Zelle). */
  terrain: { cols: number; rows: number; cell: number; types: Uint8Array; region: Int8Array } | null;
  /** Kulturlinien mit mindestens 10 Trägern. */
  lines: LineInfo[];
  /** Bodenfruchtbarkeit je Kontinent. */
  soil: number[];
}

export interface LineInfo {
  id: number;
  carriers: number;
  skills: number;
  epoch: number;
  tippingTick: number | null;
  founded: number;
  /** Kontinente, auf denen die Linie lebt (Heimat zuerst), jeweils mit Anteil der Träger. */
  continents: { region: number; share: number }[];
  /** Typische Farbe der Träger (Mittelwert auf dem Farbkreis). */
  hue: number;
}
