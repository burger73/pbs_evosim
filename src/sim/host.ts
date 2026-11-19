/**
 * Die Simulation hinter dem Worker: verwaltet die Welt, führt Befehle aus, baut Momentaufnahmen.
 * Bewusst ohne Worker- und DOM-Abhängigkeit – so lässt sie sich direkt in Node testen.
 */
import { FITNESS_LABELS } from '../core/config.ts';
import { genomeDistance } from '../core/genome.ts';
import { GENETIC_MASK, popcount } from '../core/skills.ts';
import type { Census, Sample } from '../core/types.ts';
import { World } from '../core/world.ts';
import {
  F_CULTURE, F_PICKED, F_PRED, F_SICK, ORG_STRIDE, O_FLAGS, O_GSKILLS, O_HUE, O_R, O_X, O_Y,
  type PlannedAction, type SelectedInfo, type Snapshot, type ToWorker,
} from './protocol.ts';

/** Höchstens so lange rechnet ein run-Auftrag, damit die Oberfläche regelmäßig Bilder bekommt. */
export const RUN_BUDGET_MS = 40;

export class SimHost {
  world: World | null = null;
  private planned: PlannedAction[] = [];
  private selectedId: number | null = null;
  private picked: number | null = null;
  // Was schon an die Oberfläche geschickt wurde (Kern kürzt seine Listen vorne – daher per Objekt merken)
  private lastSample: Sample | null = null;
  private lastCensus: Census | null = null;
  private sentEvents = 0;
  private sentExtinct = -1;
  private sentReports = -1;
  private lastExtinctRef: unknown = null;
  private reset = false;

  /** Befehl ausführen; liefert eine Momentaufnahme, wenn der Befehl eine verlangt (init, run). */
  handle(msg: ToWorker, now: () => number = () => performance.now()): Snapshot | null {
    switch (msg.type) {
      case 'init': {
        this.world = new World(msg.cfg);
        if (msg.cfg.mode === 'schiedsrichter') this.world.addEvent(`Schiedsrichter: ${FITNESS_LABELS[msg.cfg.fitness]}`);
        this.planned = msg.planned;
        this.selectedId = null;
        this.picked = null;
        this.lastSample = null;
        this.lastCensus = null;
        this.sentEvents = 0;
        this.sentExtinct = -1;
        this.sentReports = -1;
        this.lastExtinctRef = null;
        this.reset = true;
        const t0 = now();
        for (let i = 0; i < msg.prerun; i++) this.step();
        return this.snapshot(msg.prerun, now() - t0);
      }
      case 'run': {
        const t0 = now();
        let n = 0;
        while (n < msg.steps && (n === 0 || now() - t0 < RUN_BUDGET_MS)) { this.step(); n++; }
        return this.snapshot(n, now() - t0);
      }
      case 'set': {
        const w = this.world;
        if (!w) return null;
        Object.assign(w.cfg, msg.patch);
        if (msg.event) w.addEvent(msg.event);
        return null;
      }
      case 'crisis':
        this.world?.startCrisis(msg.kind);
        return null;
      case 'select': {
        const w = this.world;
        if (!w) return null;
        let best: number | null = null;
        let bestD = 30 * 30;
        for (const o of w.organisms) {
          const d = (o.x - msg.x) ** 2 + (o.y - msg.y) ** 2;
          if (d < bestD) { bestD = d; best = o.id; }
        }
        this.selectedId = best;
        return null;
      }
      case 'deselect':
        this.selectedId = null;
        return null;
      case 'pick':
        this.picked = msg.id;
        return null;
    }
  }

  private step(): void {
    const w = this.world!;
    for (const p of this.planned) {
      if (p.tick !== w.tick) continue;
      if (p.action === 'augen') {
        if (!w.cfg.eyesUnlocked) { w.cfg.eyesUnlocked = true; w.addEvent('👁️ Augen für alle'); }
      } else w.startCrisis(p.action);
    }
    w.step();
  }

  private selectedInfo(): SelectedInfo | null {
    const w = this.world!;
    if (this.selectedId === null) return null;
    const o = w.organisms.find((x) => x.id === this.selectedId);
    if (!o) return null; // gestorben und entfernt
    const g = o.genome;
    return {
      id: o.id, alive: o.alive, x: o.x, y: o.y, r: w.radius(o), senseR: w.senseRadius(o), hue: g.hue,
      role: g.culture ? 'kultur' : w.isPredator(o) ? 'raeuber' : 'pflanze',
      size: g.size, speed: g.speed, sense: g.sense, diet: g.diet,
      skills: g.skills, learnedOnly: o.learned.mask & ~g.skills, extra: o.learned.extra,
      energy: o.energy, age: o.age, lineage: o.lineage,
    };
  }

  snapshot(steps: number, ms: number): Snapshot {
    const w = this.world!;
    const os = w.organisms;
    const rep = this.picked !== null ? w.speciesRep(this.picked) : null;
    const orgs = new Float32Array(os.length * ORG_STRIDE);
    for (let i = 0; i < os.length; i++) {
      const o = os[i], k = i * ORG_STRIDE;
      orgs[k + O_X] = o.x;
      orgs[k + O_Y] = o.y;
      orgs[k + O_R] = w.radius(o);
      orgs[k + O_HUE] = o.genome.hue;
      let f = 0;
      if (w.isPredator(o) && !o.genome.culture) f |= F_PRED;
      if (o.genome.culture) f |= F_CULTURE;
      if (o.infection === 1) f |= F_SICK;
      if (rep && genomeDistance(o.genome, rep) < 0.3) f |= F_PICKED;
      orgs[k + O_FLAGS] = f;
      orgs[k + O_GSKILLS] = popcount(o.genome.skills & GENETIC_MASK);
    }
    const fx = w.foodX, fy = w.foodY, fb = w.foodBuried;
    const food = new Float32Array(fx.length * 3);
    for (let i = 0; i < fx.length; i++) { food[i * 3] = fx[i]; food[i * 3 + 1] = fy[i]; food[i * 3 + 2] = fb[i] ? 1 : 0; }

    const after = <T>(list: T[], last: T | null) => (last === null ? list.slice() : list.slice(list.lastIndexOf(last) + 1));
    const newSamples = after(w.samples, this.lastSample);
    const newCensus = after(w.census, this.lastCensus);
    this.lastSample = w.samples.at(-1) ?? null;
    this.lastCensus = w.census.at(-1) ?? null;
    const newEvents = w.events.slice(this.sentEvents);
    this.sentEvents = w.events.length;
    // Ausgestorbene: Liste wird vorne gekürzt – Änderung an Länge oder letztem Eintrag erkennen
    const lastExt = w.extinct.at(-1) ?? null;
    const extChanged = w.extinct.length !== this.sentExtinct || lastExt !== this.lastExtinctRef;
    this.sentExtinct = w.extinct.length;
    this.lastExtinctRef = lastExt;
    const repChanged = w.crisisReports.length !== this.sentReports;
    this.sentReports = w.crisisReports.length;
    const reset = this.reset;
    this.reset = false;
    return {
      tick: w.tick,
      generation: w.generation,
      population: os.length,
      speciesCount: w.speciesCount,
      orgs,
      food,
      newSamples,
      newCensus,
      newEvents,
      extinct: extChanged ? w.extinct.slice() : null,
      crisisReports: repChanged ? w.crisisReports.slice() : null,
      leader: w.leader,
      crisis: w.crisis,
      tippingTick: w.tippingTick,
      firstSpark: w.firstSpark,
      selected: this.selectedInfo(),
      steps,
      ms,
      reset,
    };
  }
}
