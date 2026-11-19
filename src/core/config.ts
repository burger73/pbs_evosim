/**
 * natur:          Niemand bewertet. Wer genug Energie sammelt, vermehrt sich. Wer nicht, stirbt.
 * schiedsrichter: Ein von außen festgelegtes Kriterium entscheidet nach jeder Generation,
 *                 wer sich fortpflanzen darf – egal, ob das fürs Überleben sinnvoll ist.
 */
export type Mode = 'natur' | 'schiedsrichter';

/** Kriterien des Schiedsrichters. */
export type Fitness = 'futter' | 'rot' | 'groesse' | 'strecke';

/** Krisen, die per Button (oder zufällig) ausgelöst werden. */
export type CrisisKind = 'eiszeit' | 'duerre' | 'vulkan';

export interface CrisisDef {
  label: string;
  icon: string;
  duration: number;
  /** Multiplikator fürs Futterwachstum. */
  food: number;
  /** Kältestärke (Energiekosten, gemildert durch Bau, Feuer, Kleidung, Hütte). */
  cold: number;
  /** Anteil, der sofort stirbt. */
  shock: number;
  /** Anteil des Oberflächenfutters, der pro Tick verdirbt (vergrabenes bleibt). */
  decay: number;
  tint: string;
}

export const CRISES: Record<CrisisKind, CrisisDef> = {
  eiszeit: { label: 'Eiszeit', icon: '❄️', duration: 1500, food: 0.4, cold: 1, shock: 0, decay: 0, tint: 'rgba(120,170,255,0.16)' },
  duerre: { label: 'Dürre', icon: '☀️', duration: 1000, food: 0.15, cold: 0, shock: 0, decay: 0.01, tint: 'rgba(240,190,60,0.16)' },
  vulkan: { label: 'Vulkanwinter', icon: '🌋', duration: 800, food: 0.1, cold: 1.5, shock: 0.3, decay: 0.005, tint: 'rgba(90,90,90,0.22)' },
};

export const FITNESS_LABELS: Record<Fitness, string> = {
  futter: 'Wer am meisten frisst',
  rot: 'Wer am rötesten ist',
  groesse: 'Wer am größten ist',
  strecke: 'Wer am weitesten läuft',
};

export interface SimConfig {
  width: number;
  height: number;
  seed: number;
  mode: Mode;
  fitness: Fitness;

  initialPopulation: number;
  /** Fällt die Population darunter, wandern Urformen ein (nur Natur-Modus). */
  minPopulation: number;
  maxPopulation: number;

  maxFood: number;
  /** Neue Futterstücke pro Tick (vor dem Sauerstoff-Faktor). */
  foodRate: number;
  /** „Sauerstoff“: Multiplikator für das Futterwachstum. */
  oxygen: number;
  foodEnergy: number;
  foodRadius: number;

  baseRadius: number;
  maxSense: number;
  /** Reichweite des Tastsinns, solange keine Augen freigeschaltet sind. */
  touchRange: number;
  eyesUnlocked: boolean;

  speedScale: number;
  maxTurn: number;

  baseCost: number;
  moveCost: number;
  senseCost: number;

  /** Energie pro Flächeneinheit, ab der Teilung möglich ist. */
  reproFactor: number;
  startEnergy: number;
  maxAge: number;

  predationEfficiency: number;
  /** Räuber muss mindestens so viel größer sein als die Beute. */
  predatorSizeRatio: number;
  bodyEnergy: number;

  mutationRate: number;

  /** Anteil des Futters, der vergraben liegt (nur für Gräber erreichbar). */
  buriedShare: number;
  /** Energiekosten der Kälte pro Tick und Flächeneinheit (in Kältekrisen). */
  coldCost: number;
  randomCrises: boolean;

  /**
   * Kultur-Anschwung 0..100: wie wahrscheinlich der glückliche „Kick“ ist (Harari).
   * 0 = Kultur unmöglich. Der Kick trifft nur Lebewesen mit genug genetischen Fähigkeiten;
   * ob er sich durchsetzt, hängt davon ab, ob genug Artgenossen da sind, von denen man lernt.
   */
  cultureBoost: number;
  /** Bedingung b): so viele genetische Fähigkeiten braucht ein Lebewesen für den Kick. */
  kickMinSkills: number;
  /** Energiekosten der Kulturfähigkeit (großes Gehirn) pro Tick. */
  cultureCost: number;
  /** Wahrscheinlichkeit pro Tick, als Kulturträger etwas zu entdecken (× (1 + 0,2 · Fähigkeiten)). */
  discoveryRate: number;
  learnRate: number;
  /** Wahrscheinlichkeit, dass eine Fähigkeit an ein Kind weitergegeben wird (ohne Schrift). */
  transmission: number;
  /** Landwirtschaft: Wahrscheinlichkeit pro Tick, nahebei Futter anzubauen. */
  farmRate: number;

  generationTicks: number;
  judgePopulation: number;
  eliteFraction: number;
}

export function defaultConfig(): SimConfig {
  return {
    width: 1200,
    height: 800,
    seed: 42,
    mode: 'natur',
    fitness: 'rot',

    initialPopulation: 120,
    minPopulation: 15,
    maxPopulation: 900,

    maxFood: 1400,
    foodRate: 3.5,
    oxygen: 1,
    foodEnergy: 14,
    foodRadius: 2,

    baseRadius: 5,
    maxSense: 140,
    touchRange: 14,
    eyesUnlocked: false,

    speedScale: 1.6,
    maxTurn: 0.35,

    baseCost: 0.05,
    moveCost: 0.035,
    senseCost: 0.03,

    reproFactor: 70,
    startEnergy: 40,
    maxAge: 2500,

    predationEfficiency: 0.7,
    predatorSizeRatio: 1.2,
    bodyEnergy: 20,

    mutationRate: 1,

    buriedShare: 0.35,
    coldCost: 0.05,
    randomCrises: false,

    cultureBoost: 50,
    kickMinSkills: 3,
    cultureCost: 0.015,
    discoveryRate: 0.004,
    learnRate: 0.05,
    transmission: 0.85,
    farmRate: 0.05,

    generationTicks: 400,
    judgePopulation: 150,
    eliteFraction: 0.2,
  };
}

/** Kick-Wahrscheinlichkeit pro Tick und berechtigtem Lebewesen (logarithmische Skala). */
export function kickRate(boost: number): number {
  return boost <= 0 ? 0 : 1e-6 * Math.pow(10, boost / 25);
}
