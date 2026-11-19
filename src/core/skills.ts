/**
 * Fähigkeiten = Fähigkeiten, die Umwelt zu beeinflussen (Nischenkonstruktion).
 *
 * Genetische Fähigkeiten kann jede Art durch Mutation erwerben (der Krebs gräbt,
 * die Spinne baut Netze). Sie kosten laufend Energie – sie müssen sich lohnen.
 * Kulturelle Fähigkeiten (Feuer, Landwirtschaft …) entstehen nur durch Kultur:
 * entdecken, lernen, weitergeben. Gelernte Fähigkeiten kosten nichts – das ist
 * der Vorteil der Kultur.
 */
export interface SkillDef {
  key: string;
  label: string;
  icon: string;
  /** Bitmaske der Voraussetzungen. */
  requires: number;
  /** Kann durch Mutation entstehen (sonst nur durch Kultur). */
  genetic: boolean;
  /** Energiekosten pro Tick, wenn genetisch vorhanden. */
  upkeep: number;
  effect: string;
}

const bit = (i: number) => 1 << i;

export const SKILL = {
  graben: 0,
  bau: 1,
  vorrat: 2,
  netz: 3,
  gruppe: 4,
  werkzeug: 5,
  feuer: 6,
  kleidung: 7,
  waffen: 8,
  huette: 9,
  landwirtschaft: 10,
  medizin: 11,
  schrift: 12,
} as const;

const S = SKILL;

export const SKILLS: SkillDef[] = [
  { key: 'graben', label: 'Graben', icon: '🦀', requires: 0, genetic: true, upkeep: 0.004, effect: 'kommt an vergrabenes Futter (übersteht Dürren)' },
  { key: 'bau', label: 'Bau/Höhle', icon: '🕳️', requires: 0, genetic: true, upkeep: 0.006, effect: 'entkommt Räubern oft, halbe Kälte' },
  { key: 'vorrat', label: 'Vorrat', icon: '🐿️', requires: 0, genetic: true, upkeep: 0.004, effect: 'in Krisen 40 % weniger Grundumsatz' },
  { key: 'netz', label: 'Netz/Falle', icon: '🕸️', requires: 0, genetic: true, upkeep: 0.004, effect: 'fängt Futter aus doppelter Entfernung' },
  { key: 'gruppe', label: 'Gruppe', icon: '🐺', requires: 0, genetic: true, upkeep: 0.003, effect: 'Rudeljagd auf gleich große Beute bzw. Schutz in der Herde' },
  { key: 'werkzeug', label: 'Werkzeug', icon: '🪨', requires: 0, genetic: true, upkeep: 0.006, effect: '+40 % Ertrag aus Pflanzen' },
  { key: 'feuer', label: 'Feuer', icon: '🔥', requires: bit(S.werkzeug), genetic: false, upkeep: 0, effect: '−30 % Grundumsatz, kaum noch Kälte' },
  { key: 'kleidung', label: 'Kleidung', icon: '🧥', requires: bit(S.feuer), genetic: false, upkeep: 0, effect: 'halbe Kälte, +20 % Lebensdauer' },
  { key: 'waffen', label: 'Waffen', icon: '⚔️', requires: bit(S.werkzeug), genetic: false, upkeep: 0, effect: 'wird nicht gefressen, jagt alles bis doppelte Größe' },
  { key: 'huette', label: 'Hütte', icon: '🛖', requires: bit(S.werkzeug) | bit(S.bau), genetic: false, upkeep: 0, effect: 'sicher vor Räubern, kaum Kälte' },
  { key: 'landwirtschaft', label: 'Landwirtschaft', icon: '🌾', requires: bit(S.werkzeug) | bit(S.vorrat), genetic: false, upkeep: 0, effect: 'baut selbst Futter an – auch in Krisen' },
  { key: 'medizin', label: 'Medizin', icon: '⚕️', requires: bit(S.feuer), genetic: false, upkeep: 0, effect: '+50 % Lebensdauer' },
  { key: 'schrift', label: 'Schrift', icon: '📜', requires: bit(S.werkzeug), genetic: false, upkeep: 0, effect: 'Wissen geht beim Vererben nicht verloren' },
];

export const GENETIC_MASK = SKILLS.reduce((m, d, i) => (d.genetic ? m | bit(i) : m), 0);

export function has(mask: number, skill: number): boolean {
  return (mask & bit(skill)) !== 0;
}

export function popcount(mask: number): number {
  let n = 0;
  while (mask) {
    n += mask & 1;
    mask >>>= 1;
  }
  return n;
}

/** Fähigkeiten, die als Nächstes möglich sind (Voraussetzungen erfüllt, noch nicht vorhanden). */
export function available(mask: number, geneticOnly: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < SKILLS.length; i++) {
    const d = SKILLS[i];
    if (geneticOnly && !d.genetic) continue;
    if (!has(mask, i) && (mask & d.requires) === d.requires) out.push(i);
  }
  return out;
}

export function upkeep(geneticMask: number): number {
  let c = 0;
  for (let i = 0; i < SKILLS.length; i++) if (has(geneticMask, i)) c += SKILLS[i].upkeep;
  return c;
}

/** Erlerntes Wissen eines Lebewesens: Fähigkeiten (Bitmaske) + weitere Erfindungen (Zähler). */
export interface Learned {
  mask: number;
  extra: number;
}

export const nothingLearned = (): Learned => ({ mask: 0, extra: 0 });

/** Ertragsbonus durch weitere Erfindungen: wächst mit, aber sättigend. */
export function extraBonus(extra: number): number {
  return 1 + 1.5 * (1 - Math.exp(-extra / 40));
}
