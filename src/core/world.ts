/**
 * Die Welt: hält den Zustand und führt die Zeitschritte aus.
 *
 * Die eigentliche Logik steckt in eigenen Modulen:
 *   traits.ts    abgeleitete Eigenschaften (Größe, Sicht, wer wen fressen kann)
 *   behavior.ts  wahrnehmen, entscheiden, bewegen, Energie, Seuche, fressen
 *   culture.ts   Kick, Lernen, Vergessen, Landwirtschaft, Epochen, Kipppunkt
 *   selection.ts Tod, Fortpflanzung, Schiedsrichter
 *   census.ts    Artenzählung, Spitzenreiter, Ausgestorbene
 *   crisis.ts    Krisen und ihre Bilanz
 *   food.ts      Futter
 * Die Reihenfolge der Aufrufe in step() ist Teil des Verhaltens (Zufallszahlen!) –
 * der Golden-Master-Test (test/golden.test.ts) wacht darüber.
 */
import { countGroups, stepOrganisms } from './behavior.ts';
import { CensusSystem } from './census.ts';
import { CRISES, type CrisisKind, type SimConfig } from './config.ts';
import { CrisisSystem } from './crisis.ts';
import { CultureSystem } from './culture.ts';
import { FoodField } from './food.ts';
import { primordialGenome, type Genome } from './genome.ts';
import { Grid } from './grid.ts';
import { Rng } from './rng.ts';
import { naturalSelection, judge } from './selection.ts';
import { nothingLearned } from './skills.ts';
import * as T from './traits.ts';
import { CENSUS_EVERY, MAX_SAMPLES, SAMPLE_EVERY, type Organism, type Sample, type SimEvent } from './types.ts';

export * from './types.ts';
export { fitness } from './traits.ts';

export class World {
  readonly cfg: SimConfig;
  readonly rng: Rng;
  organisms: Organism[] = [];
  tick = 0;
  generation = 0;
  samples: Sample[] = [];
  events: SimEvent[] = [];

  // --- Teilsysteme (intern; die Oberfläche nutzt die Zugriffe weiter unten) ---
  readonly food: FoodField;
  readonly orgGrid: Grid;
  readonly cultureSystem = new CultureSystem();
  readonly censusSystem = new CensusSystem();
  readonly crisisSystem = new CrisisSystem();
  private nextId = 1;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.orgGrid = new Grid(cfg.width, cfg.height, 40);
    this.food = new FoodField(cfg, this.rng);
    const n = cfg.mode === 'schiedsrichter' ? cfg.judgePopulation : cfg.initialPopulation;
    for (let i = 0; i < n; i++) this.spawn(primordialGenome(this.rng));
    for (let i = 0; i < cfg.maxFood * 0.6; i++) this.food.add();
    this.censusSystem.take(this);
    this.record();
  }

  // --- Zugriffe für Oberfläche und Tests ------------------------------------

  get foodX(): readonly number[] { return this.food.x; }
  get foodY(): readonly number[] { return this.food.y; }
  get foodBuried(): readonly boolean[] { return this.food.buried; }
  get crisis() { return this.crisisSystem.current; }
  get crisisReports() { return this.crisisSystem.reports; }
  get census() { return this.censusSystem.census; }
  get speciesCount() { return this.censusSystem.speciesCount; }
  get leader() { return this.censusSystem.leader; }
  get extinct() { return this.censusSystem.extinct; }
  get firstEyes() { return this.censusSystem.firstEyes; }
  get fertility() { return this.cultureSystem.fertility; }
  get epoch() { return this.cultureSystem.epoch; }
  get firstSpark() { return this.cultureSystem.firstSpark; }
  get tippingTick() { return this.cultureSystem.tippingTick; }

  radius(o: Organism): number { return T.radius(this.cfg, o); }
  senseRadius(o: Organism): number { return T.senseRadius(this.cfg, o); }
  skillsOf(o: Organism): number { return T.skillsOf(o); }
  skillCount(o: Organism): number { return T.skillCount(o); }
  isPredator(o: Organism): boolean { return T.isPredator(o); }
  isHunter(o: Organism): boolean { return T.isHunter(o); }
  canEat(a: Organism, b: Organism): boolean { return T.canEat(this.cfg, a, b); }
  maxEnergy(o: Organism): number { return T.maxEnergy(this.cfg, o); }
  maxAge(o: Organism): number { return T.maxAge(this.cfg, o); }
  kickReady(o: Organism): boolean { return T.kickReady(this.cfg, o); }

  /** Typisches Erbgut einer lebenden Art (für das Hervorheben in der Welt). */
  speciesRep(id: number): Genome | null {
    return this.censusSystem.speciesRep(id);
  }

  addEvent(label: string): void {
    this.events.push({ tick: this.tick, label });
  }

  nextOrganismId(): number {
    return this.nextId++;
  }

  spawn(genome: Genome, x?: number, y?: number, energy?: number, lineage = 0): Organism {
    const o: Organism = {
      id: this.nextId++,
      x: x ?? this.rng.range(0, this.cfg.width),
      y: y ?? this.rng.range(0, this.cfg.height),
      heading: this.rng.range(0, Math.PI * 2),
      energy: energy ?? this.cfg.startEnergy,
      age: 0,
      genome,
      lineage,
      alive: true,
      eaten: 0,
      travelled: 0,
      learned: nothingLearned(),
      group: 0,
      infection: 0,
    };
    this.organisms.push(o);
    return o;
  }

  startCrisis(kind: CrisisKind): void {
    this.crisisSystem.start(this, kind);
  }

  // --- Ein Zeitschritt -----------------------------------------------------

  step(): void {
    const cfg = this.cfg;
    const crisisDef = this.crisis ? CRISES[this.crisis.kind] : null;
    this.rebuildGrids();
    countGroups(this);
    if (crisisDef && crisisDef.decay > 0) this.food.decay(crisisDef.decay);
    stepOrganisms(this);
    if (cfg.mode === 'natur') {
      this.cultureSystem.step(this);
      naturalSelection(this);
    }
    this.food.compact();
    this.food.grow(this.crisis ? CRISES[this.crisis.kind].food : 1, this.fertility);
    this.tick++;
    this.crisisSystem.afterStep(this);
    if (cfg.mode === 'schiedsrichter' && this.tick % cfg.generationTicks === 0) judge(this);
    if (this.tick % CENSUS_EVERY === 0) this.censusSystem.take(this);
    if (this.tick % SAMPLE_EVERY === 0) this.record();
  }

  private rebuildGrids(): void {
    this.orgGrid.clear();
    for (let i = 0; i < this.organisms.length; i++) {
      const o = this.organisms[i];
      this.orgGrid.insert(i, o.x, o.y);
    }
    this.food.rebuildGrid();
  }

  // --- Statistik ---------------------------------------------------------------

  private record(): void {
    const os = this.organisms;
    const n = os.length || 1;
    let pred = 0, s = 0, v = 0, e = 0, d = 0, sk = 0, cult = 0, cultSk = 0, maxSk = 0, ready = 0, sick = 0;
    for (const o of os) {
      if (o.infection === 1) sick++;
      const k = T.skillCount(o);
      sk += k;
      if (k > maxSk) maxSk = k;
      if (o.genome.culture) { cult++; cultSk += k; }
      else if (T.isPredator(o)) pred++;
      if (T.kickReady(this.cfg, o)) ready++;
      s += o.genome.size;
      v += o.genome.speed;
      e += o.genome.sense;
      d += o.genome.diet;
    }
    const sample: Sample = {
      tick: this.tick,
      population: os.length,
      predators: pred,
      species: this.speciesCount,
      food: this.food.count,
      avgSize: s / n,
      avgSpeed: v / n,
      avgSense: e / n,
      avgDiet: d / n,
      avgSkills: sk / n,
      cultureShare: cult / n,
      cultureSkills: cult ? cultSk / cult : 0,
      maxSkills: maxSk,
      kickReady: ready,
      crisis: this.crisis?.kind ?? null,
      fertility: this.fertility,
      infected: sick / n,
      epoch: this.cultureSystem.updateEpoch(this),
    };
    this.samples.push(sample);
    this.cultureSystem.detectTipping(this, sample);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }
}
