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
  /** Epoche (0 = genetisch, 1–4 = kulturelle Epochen). */
  epoch: number;
  effect: string;
}

/**
 * Kulturelle Epochen: Jede braucht eine Mindestzahl an Kulturträgern („kollektives Gehirn“, Henrich).
 * Fällt die Zahl darunter, gehen die Fähigkeiten dieser Epoche nach und nach verloren (Tasmanien-Effekt).
 */
export const EPOCHS = [
  { name: 'Steinzeit', icon: '🪨', min: 0 },
  { name: 'Sesshaftigkeit', icon: '🌾', min: 50 },
  { name: 'Hochkultur', icon: '📜', min: 150 },
  { name: 'Neuzeit', icon: '⚙️', min: 300 },
];
/** Endlose weitere Erfindungen erst ab dieser Zahl an Kulturträgern (und nach der Neuzeit). */
export const EXTRA_MIN = 300;

const bit = (i: number) => 1 << i;

export const SKILL = {
  graben: 0,
  bau: 1,
  vorrat: 2,
  netz: 3,
  gruppe: 4,
  werkzeug: 5,
  augen: 6,
  feuer: 7,
  kleidung: 8,
  waffen: 9,
  huette: 10,
  landwirtschaft: 11,
  boot: 12,
  medizin: 13,
  schrift: 14,
  metall: 15,
  wissenschaft: 16,
  maschinen: 17,
} as const;

const S = SKILL;

export const SKILLS: SkillDef[] = [
  { key: 'graben', label: 'Graben', icon: '🦀', requires: 0, genetic: true, upkeep: 0.004, epoch: 0, effect: 'kommt an vergrabenes Futter (übersteht Dürren)' },
  { key: 'bau', label: 'Bau/Höhle', icon: '🕳️', requires: 0, genetic: true, upkeep: 0.006, epoch: 0, effect: 'entkommt Räubern oft, halbe Kälte' },
  { key: 'vorrat', label: 'Vorrat', icon: '🐿️', requires: 0, genetic: true, upkeep: 0.004, epoch: 0, effect: 'in Krisen 40 % weniger Grundumsatz' },
  { key: 'netz', label: 'Netz/Falle', icon: '🕸️', requires: 0, genetic: true, upkeep: 0.004, epoch: 0, effect: 'fängt Futter aus doppelter Entfernung' },
  { key: 'gruppe', label: 'Gruppe', icon: '🐺', requires: 0, genetic: true, upkeep: 0.003, epoch: 0, effect: 'Rudeljagd auf gleich große Beute bzw. Schutz in der Herde' },
  { key: 'werkzeug', label: 'Werkzeug', icon: '🪨', requires: 0, genetic: true, upkeep: 0.006, epoch: 0, effect: '+40 % Ertrag aus Pflanzen' },
  { key: 'augen', label: 'Augen', icon: '👁️', requires: 0, genetic: true, upkeep: 0.004, epoch: 0, effect: 'sieht weit statt nur zu tasten – das Sicht-Gen wirkt voll' },
  { key: 'feuer', label: 'Feuer', icon: '🔥', requires: bit(S.werkzeug), genetic: false, upkeep: 0, epoch: 1, effect: '−30 % Grundumsatz, kaum noch Kälte' },
  { key: 'kleidung', label: 'Kleidung', icon: '🧥', requires: bit(S.feuer), genetic: false, upkeep: 0, epoch: 1, effect: 'halbe Kälte, +20 % Lebensdauer' },
  { key: 'waffen', label: 'Waffen', icon: '⚔️', requires: bit(S.werkzeug), genetic: false, upkeep: 0, epoch: 1, effect: 'wird nicht gefressen, jagt alles bis doppelte Größe' },
  { key: 'huette', label: 'Hütte', icon: '🛖', requires: bit(S.werkzeug) | bit(S.bau), genetic: false, upkeep: 0, epoch: 2, effect: 'sicher vor Räubern, kaum Kälte' },
  { key: 'landwirtschaft', label: 'Landwirtschaft', icon: '🌾', requires: bit(S.werkzeug) | bit(S.vorrat), genetic: false, upkeep: 0, epoch: 2, effect: 'baut selbst Futter an – laugt aber den Boden aus' },
  { key: 'boot', label: 'Boot', icon: '🛶', requires: bit(S.schrift), genetic: false, upkeep: 0, epoch: 3, effect: 'kann Wasser überqueren – andere Kontinente erreichen' },
  { key: 'medizin', label: 'Medizin', icon: '⚕️', requires: bit(S.feuer), genetic: false, upkeep: 0, epoch: 3, effect: '+50 % Lebensdauer, halbe Seuchen-Sterblichkeit' },
  { key: 'schrift', label: 'Schrift', icon: '📜', requires: bit(S.werkzeug), genetic: false, upkeep: 0, epoch: 3, effect: 'Wissen geht beim Vererben nicht verloren' },
  { key: 'metall', label: 'Metall', icon: '⛏️', requires: bit(S.werkzeug) | bit(S.feuer), genetic: false, upkeep: 0, epoch: 3, effect: '+30 % Ertrag, Waffen jagen bis dreifache Größe' },
  { key: 'wissenschaft', label: 'Wissenschaft', icon: '🔬', requires: bit(S.schrift), genetic: false, upkeep: 0, epoch: 4, effect: 'entdeckt doppelt so schnell' },
  { key: 'maschinen', label: 'Maschinen', icon: '⚙️', requires: bit(S.metall) | bit(S.wissenschaft), genetic: false, upkeep: 0, epoch: 4, effect: 'halbe Bewegungskosten, doppelte Ernte – doppelter Raubbau' },
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
export function available(mask: number, geneticOnly: boolean, maxEpoch = EPOCHS.length): number[] {
  const out: number[] = [];
  for (let i = 0; i < SKILLS.length; i++) {
    const d = SKILLS[i];
    if (geneticOnly && !d.genetic) continue;
    if (d.epoch > maxEpoch) continue;
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

/** Höchste Epoche, die mit so vielen Kulturträgern möglich ist (1–4). */
export function epochFor(carriers: number): number {
  let e = 1;
  for (let i = 0; i < EPOCHS.length; i++) if (carriers >= EPOCHS[i].min) e = i + 1;
  return e;
}
