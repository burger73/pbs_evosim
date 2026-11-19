/**
 * Krisen (Eiszeit, Dürre, Vulkanwinter, Seuche): Start, Ende und Bilanz –
 * wer hat mit wie vielen Fähigkeiten überlebt, welche Arten sind verschwunden.
 */
import { CRISES, type CrisisKind } from './config.ts';
import { genomeDistance, type Genome } from './genome.ts';
import { skillCount } from './traits.ts';
import { BUCKETS, type CrisisReport, type SpeciesStat } from './types.ts';
import type { World } from './world.ts';

export class CrisisSystem {
  current: { kind: CrisisKind; until: number; start: number } | null = null;
  reports: CrisisReport[] = [];
  private startState: { buckets: number[]; species: (SpeciesStat & { rep: Genome })[] } | null = null;

  start(w: World, kind: CrisisKind): void {
    if (this.current) return;
    const def = CRISES[kind];
    this.current = { kind, until: w.tick + def.duration, start: w.tick };
    w.addEvent(`${def.icon} ${def.label}`);
    if (def.shock > 0) {
      for (const o of w.organisms) if (w.rng.chance(def.shock)) o.alive = false;
    }
    if (kind === 'seuche') {
      for (const o of w.organisms) if (w.rng.chance(w.cfg.diseaseStart)) o.infection = 1;
    }
    w.censusSystem.take(w);
    const reps = w.censusSystem.reps();
    this.startState = {
      buckets: this.bucketCounts(w),
      species: w.census[w.census.length - 1].species
        .filter((s) => s.members >= 5 && reps.has(s.id))
        .map((s) => ({ ...s, rep: reps.get(s.id)! })),
    };
  }

  /** Am Ende jedes Schritts: abgelaufene Krise beenden, ggf. zufällig eine neue beginnen. */
  afterStep(w: World): void {
    if (this.current && w.tick >= this.current.until) this.end(w);
    if (w.cfg.randomCrises && !this.current && w.cfg.mode === 'natur' && w.rng.chance(1 / 6000)) {
      const kinds = Object.keys(CRISES) as CrisisKind[];
      this.start(w, kinds[w.rng.int(kinds.length)]);
    }
  }

  private end(w: World): void {
    if (!this.current || !this.startState) return;
    w.censusSystem.take(w);
    const after = this.bucketCounts(w);
    // Eine Art gilt als überlebt, wenn noch ein genetisch ähnliches Lebewesen existiert
    const living = w.organisms.filter((o) => o.alive);
    const step = Math.max(1, Math.floor(living.length / 600));
    const survives = (s: SpeciesStat & { rep: Genome }) => {
      for (let i = 0; i < living.length; i += step) if (genomeDistance(living[i].genome, s.rep) < 0.45) return true;
      return false;
    };
    const ext = this.startState.species.filter((s) => !survives(s));
    const sur = this.startState.species.filter((s) => survives(s));
    const avg = (xs: SpeciesStat[]) => (xs.length ? xs.reduce((a, s) => a + s.skills, 0) / xs.length : 0);
    const start = this.startState;
    this.reports.push({
      kind: this.current.kind,
      start: this.current.start,
      end: w.tick,
      buckets: BUCKETS.map(([label], i) => ({ label, before: start.buckets[i], after: after[i] })),
      extinct: { count: ext.length, avgSkills: avg(ext) },
      survived: { count: sur.length, avgSkills: avg(sur) },
    });
    w.addEvent(`Ende ${CRISES[this.current.kind].label}`);
    if (this.current.kind === 'seuche') for (const o of w.organisms) o.infection = 0;
    this.current = null;
    this.startState = null;
  }

  private bucketCounts(w: World): number[] {
    const c = BUCKETS.map(() => 0);
    for (const o of w.organisms) {
      if (!o.alive) continue;
      const k = skillCount(o);
      const i = BUCKETS.findIndex(([, lo, hi]) => k >= lo && k <= hi);
      c[i]++;
    }
    return c;
  }
}
