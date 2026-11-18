/**
 * natur:          Niemand bewertet. Wer genug Energie sammelt, vermehrt sich. Wer nicht, stirbt.
 * schiedsrichter: Ein von außen festgelegtes Kriterium entscheidet nach jeder Generation,
 *                 wer sich fortpflanzen darf – egal, ob das fürs Überleben sinnvoll ist.
 */
export type Mode = 'natur' | 'schiedsrichter';

/** Kriterien des Schiedsrichters. */
export type Fitness = 'futter' | 'rot' | 'groesse' | 'strecke';

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

  /** Kultur: Fähigkeiten können entdeckt, gelernt und weitergegeben werden. */
  cultureUnlocked: boolean;
  /** Energiekosten des Gehirns pro Tick bei Intelligenz 1. */
  intellectCost: number;
  /** Grundwahrscheinlichkeit pro Tick, eine Fähigkeit zu entdecken (× Intelligenz²). */
  discoveryRate: number;
  /** Ab dieser Intelligenz kann von anderen gelernt und an Kinder weitergegeben werden. */
  learnThreshold: number;
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
    foodRate: 3,
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

    cultureUnlocked: false,
    intellectCost: 0.06,
    discoveryRate: 0.01,
    learnThreshold: 0.3,
    learnRate: 0.05,
    transmission: 0.85,
    farmRate: 0.05,

    generationTicks: 400,
    judgePopulation: 150,
    eliteFraction: 0.2,
  };
}
