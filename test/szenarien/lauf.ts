/**
 * Ein Simulationslauf als Worker-Thread (damit mehrere Seeds parallel laufen).
 * Erhält { seed, ticks, config, crises } und meldet eine Zusammenfassung zurück.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { defaultConfig, type CrisisKind, type SimConfig } from '../../src/core/config.ts';
import { World } from '../../src/core/world.ts';

export interface LaufAuftrag {
  seed: number;
  ticks: number;
  config?: Partial<SimConfig>;
  /** Krisen: Schritt → Art */
  crises?: Record<number, CrisisKind>;
}

export interface LaufErgebnis {
  seed: number;
  tipping: number | null;
  events: { tick: number; label: string }[];
  /** alle 500 Schritte */
  verlauf: { tick: number; population: number; species: number; cultureShare: number; epoch: number }[];
  minPopulationAb1000: number;
  maxSpeciesVorKultur: number;
  crisisReports: World['crisisReports'];
  ms: number;
}

const job = workerData as LaufAuftrag;
const t0 = performance.now();
const w = new World({ ...defaultConfig(), seed: job.seed, ...job.config });
let minPop = Infinity, maxSpecies = 0;
const verlauf: LaufErgebnis['verlauf'] = [];
for (let t = 0; t < job.ticks; t++) {
  const c = job.crises?.[w.tick];
  if (c) w.startCrisis(c);
  w.step();
  if (w.tick >= 1000) minPop = Math.min(minPop, w.organisms.length);
  if (w.tippingTick === null) maxSpecies = Math.max(maxSpecies, w.speciesCount);
  if (w.tick % 500 === 0) {
    const s = w.samples[w.samples.length - 1];
    verlauf.push({ tick: w.tick, population: s.population, species: s.species, cultureShare: s.cultureShare, epoch: s.epoch });
  }
}
const result: LaufErgebnis = {
  seed: job.seed,
  tipping: w.tippingTick,
  events: w.events,
  verlauf,
  minPopulationAb1000: minPop,
  maxSpeciesVorKultur: maxSpecies,
  crisisReports: w.crisisReports,
  ms: performance.now() - t0,
};
parentPort!.postMessage(result);
