/**
 * Fähigkeiten – erlernt, nicht vererbt (im genetischen Sinn).
 *
 * Kumulative Kultur („Ratchet-Effekt“): Fähigkeiten werden entdeckt, von
 * Artgenossen gelernt und an Kinder weitergegeben – aber nur, wenn das
 * Gehirn dafür reicht. Weil jede Fähigkeit neue ermöglicht, wächst das
 * Wissen nicht linear, sondern explodiert.
 */
export interface SkillDef {
  key: string;
  label: string;
  icon: string;
  /** Bitmaske der Voraussetzungen. */
  requires: number;
  effect: string;
}

const bit = (i: number) => 1 << i;

export const SKILL = {
  werkzeug: 0,
  feuer: 1,
  jagd: 2,
  sprache: 3,
  kleidung: 4,
  landwirtschaft: 5,
  waffen: 6,
  medizin: 7,
  schrift: 8,
} as const;

const S = SKILL;

export const SKILLS: SkillDef[] = [
  { key: 'werkzeug', label: 'Werkzeug', icon: '🪨', requires: 0, effect: '+40 % Ertrag aus Pflanzen' },
  { key: 'feuer', label: 'Feuer', icon: '🔥', requires: bit(S.werkzeug), effect: '−30 % Grundumsatz' },
  { key: 'jagd', label: 'Jagd', icon: '🏹', requires: bit(S.werkzeug), effect: 'kann auch größere Tiere erlegen' },
  { key: 'sprache', label: 'Sprache', icon: '💬', requires: 0, effect: 'lernt dreimal so schnell von anderen' },
  { key: 'kleidung', label: 'Kleidung', icon: '🧥', requires: bit(S.feuer), effect: '+20 % Lebensdauer' },
  { key: 'landwirtschaft', label: 'Landwirtschaft', icon: '🌾', requires: bit(S.werkzeug) | bit(S.sprache), effect: 'baut selbst Futter an' },
  { key: 'waffen', label: 'Waffen', icon: '⚔️', requires: bit(S.jagd) | bit(S.feuer), effect: 'kann nicht mehr gefressen werden, jagt Räuber' },
  { key: 'medizin', label: 'Medizin', icon: '⚕️', requires: bit(S.sprache) | bit(S.feuer), effect: '+50 % Lebensdauer' },
  { key: 'schrift', label: 'Schrift', icon: '📜', requires: bit(S.sprache), effect: 'Wissen geht nicht mehr verloren, lernt aus größerer Entfernung' },
];

export const ALL_NAMED = (1 << SKILLS.length) - 1;

/** Fähigkeiten eines Lebewesens: benannte (Bitmaske) + weitere Erfindungen (Zähler). */
export interface Skills {
  mask: number;
  extra: number;
}

export const noSkills = (): Skills => ({ mask: 0, extra: 0 });

export function has(s: Skills, skill: number): boolean {
  return (s.mask & bit(skill)) !== 0;
}

export function skillCount(s: Skills): number {
  let n = s.extra;
  let m = s.mask;
  while (m) {
    n += m & 1;
    m >>>= 1;
  }
  return n;
}

/** Benannte Fähigkeiten, die als Nächstes möglich sind (Voraussetzungen erfüllt, noch nicht vorhanden). */
export function available(s: Skills): number[] {
  const out: number[] = [];
  for (let i = 0; i < SKILLS.length; i++) {
    if (!has(s, i) && (s.mask & SKILLS[i].requires) === SKILLS[i].requires) out.push(i);
  }
  return out;
}

/** Ertragsbonus durch weitere Erfindungen: wächst mit, aber begrenzt (sättigend). */
export function extraBonus(s: Skills): number {
  return 1 + 1.5 * (1 - Math.exp(-s.extra / 40));
}
