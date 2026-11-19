/**
 * Szenario-Tests: prüfen das GESAMTVERHALTEN über mehrere Seeds – nicht einzelne Regeln.
 * Lehre aus früheren Abstimmungen: Parameter kippten leicht zwischen „alle sterben“ und
 * „keiner stirbt“, „Kultur nie“ und „Kultur sofort“. Diese Tests halten die Balance fest.
 *
 * Laufen nicht bei `npm test` (dauern ~2 Minuten), sondern mit:  npm run test:szenarien
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { LaufErgebnis } from './lauf.ts';
import { laeufe } from './parallel.ts';

const SEEDS = [11, 5, 8, 21, 33];
const TICKS = 16000;

let natur: LaufErgebnis[] = [];
let eiszeit: LaufErgebnis[] = [];

beforeAll(async () => {
  [natur, eiszeit] = await Promise.all([
    laeufe(SEEDS.map((seed) => ({ seed, ticks: TICKS }))),
    laeufe([3, 7, 42].map((seed) => ({ seed, ticks: 6000, crises: { 4000: 'eiszeit' as const } }))),
  ]);
  for (const r of [...natur, ...eiszeit]) {
    console.log(`Seed ${r.seed}: Kipppunkt ${r.tipping ?? '–'}, min. Population ${r.minPopulationAb1000}, ` +
      `max. Arten vor Kultur ${r.maxSpeciesVorKultur}, Ende ${r.verlauf.at(-1)?.population} (${(r.ms / 1000).toFixed(0)} s)`);
  }
}, 600_000);

describe('Gesamtverhalten (Natur, Anschwung 50)', () => {
  it('das Leben stirbt nie ganz aus', () => {
    for (const r of natur) expect(r.events.filter((e) => e.label.startsWith('Ausgestorben')), `Seed ${r.seed}`).toEqual([]);
  });

  it('vor der Kultur entsteht Vielfalt (≥ 8 Arten gleichzeitig)', () => {
    for (const r of natur) expect(r.maxSpeciesVorKultur, `Seed ${r.seed}`).toBeGreaterThanOrEqual(8);
  });

  it('Kultur kippt in mindestens 3 von 5 Läufen – aber nie sofort (nicht vor Schritt 2000)', () => {
    const tipped = natur.filter((r) => r.tipping !== null);
    expect(tipped.length).toBeGreaterThanOrEqual(3);
    for (const r of tipped) expect(r.tipping!, `Seed ${r.seed}`).toBeGreaterThanOrEqual(2000);
  });

  it('nach dem Kipppunkt bricht die Welt nicht zusammen (Endpopulation ≥ 100)', () => {
    for (const r of natur.filter((x) => x.tipping !== null)) expect(r.verlauf.at(-1)!.population, `Seed ${r.seed}`).toBeGreaterThanOrEqual(100);
  });
});

describe('Krise: Eiszeit', () => {
  it('Fähigkeiten helfen: Lebewesen mit 1–2 Fähigkeiten überleben anteilig besser als ohne (in ≥ 2 von 3 Läufen)', () => {
    const ok = eiszeit.filter((r) => {
      const b = r.crisisReports[0]?.buckets;
      if (!b) return false;
      const rate = (label: string) => { const x = b.find((y) => y.label === label)!; return x.before ? x.after / x.before : NaN; };
      return rate('1–2') > rate('0');
    });
    expect(ok.length).toBeGreaterThanOrEqual(2);
  });
});
