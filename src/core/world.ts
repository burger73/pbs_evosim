import { N_IN, think } from './brain.ts';
import { CRISES, kickRate, type CrisisKind, type Fitness, type SimConfig } from './config.ts';
import { genomeDistance, hueDistance, mutate, primordialGenome, type Genome } from './genome.ts';
import { Grid, wrapDelta } from './grid.ts';
import { Rng } from './rng.ts';
import { EPOCHS, EXTRA_MIN, GENETIC_MASK, SKILL, SKILLS, available, epochFor, extraBonus, has, nothingLearned, popcount, upkeep, type Learned } from './skills.ts';
import { clusterSpecies } from './species.ts';

export interface Organism {
  id: number;
  x: number;
  y: number;
  heading: number;
  energy: number;
  age: number;
  genome: Genome;
  /** Abstammungstiefe: wie viele Vorfahren bis zur Urform. */
  lineage: number;
  alive: boolean;
  /** Für den Schiedsrichter: gefressene Futterstücke und zurückgelegte Strecke. */
  eaten: number;
  travelled: number;
  /** Erlerntes Wissen (nur Kulturträger). */
  learned: Learned;
  /** Artgenossen in der Nähe (für die Fähigkeit „Gruppe“). */
  group: number;
  /** Seuche: 0 gesund, 1 krank, 2 immun. */
  infection: number;
}

export interface Sample {
  tick: number;
  population: number;
  /** „Wilde“ Räuber (keine Kulturträger). */
  predators: number;
  species: number;
  food: number;
  avgSize: number;
  avgSpeed: number;
  avgSense: number;
  avgDiet: number;
  /** Ø Fähigkeiten (genetisch + erlernt) aller Lebewesen. */
  avgSkills: number;
  /** Anteil der Kulturträger (0..1) und ihre Ø Fähigkeiten. */
  cultureShare: number;
  cultureSkills: number;
  maxSkills: number;
  /** Lebewesen, die Bedingung b) für den Kick erfüllen. */
  kickReady: number;
  crisis: CrisisKind | null;
  /** Bodenfruchtbarkeit 0..1 (sinkt durch Landwirtschaft). */
  fertility: number;
  /** Anteil Kranker (0..1). */
  infected: number;
  /** Erreichte Epoche der Kultur (0 = keine, 1–4). */
  epoch: number;
}

export interface SpeciesStat {
  id: number;
  hue: number;
  /** Geschätzte Individuenzahl. */
  members: number;
  /** Ø Fähigkeiten. */
  skills: number;
  /** Anteil Kulturträger (0..1). */
  culture: number;
  predator: boolean;
  /** Fähigkeiten, die mehr als die Hälfte der Art hat. */
  common: number;
  /** Schritt, in dem die Art zuerst gezählt wurde. */
  born: number;
  /** Nur im Schiedsrichter-Modus: Ø Wert des gewählten Kriteriums. */
  score: number;
}

/** Eine bemerkenswerte ausgestorbene Art (Höchststand ≥ NOTABLE_MEMBERS oder einmal Spitzenreiter). */
export interface ExtinctSpecies {
  id: number;
  hue: number;
  born: number;
  died: number;
  peakMembers: number;
  peakSkills: number;
  /** Mehrheits-Fähigkeiten zum Zeitpunkt der besten Ø Fähigkeiten. */
  common: number;
  wasLeader: boolean;
  /** Krise, während der die Art verschwand. */
  crisis: CrisisKind | null;
}

/** Die Art mit den meisten Fähigkeiten (Ø) – der Spitzenreiter. */
export interface Leader {
  id: number;
  hue: number;
  skills: number;
  members: number;
  culture: number;
  common: number;
  since: number;
}

/** Spitzenreiter zählen erst ab dieser Größe; Wechsel braucht 15 % Vorsprung, 3 Zählungen in Folge. */
export const LEADER_MIN_MEMBERS = 10;

export interface Census {
  tick: number;
  species: SpeciesStat[];
}

export interface CrisisReport {
  kind: CrisisKind;
  start: number;
  end: number;
  /** Anzahl Lebewesen je Fähigkeiten-Gruppe vor und nach der Krise. */
  buckets: { label: string; before: number; after: number }[];
  extinct: { count: number; avgSkills: number };
  survived: { count: number; avgSkills: number };
}

export interface SimEvent {
  tick: number;
  label: string;
}

export const SAMPLE_EVERY = 10;
export const CENSUS_EVERY = 50;
/** Ab diesem Ernährungswert kann ein Organismus andere fressen. */
export const PREDATOR_DIET = 0.3;
export const TIPPING_SHARE = 0.1;
export const TIPPING_SKILLS = 5;
const MAX_SAMPLES = 2000;
const MAX_CENSUS = 400;
/** Ausgestorbene Arten merken, wenn sie einmal so groß waren (oder Spitzenreiter). */
export const NOTABLE_MEMBERS = 30;
const MAX_EXTINCT = 50;
const BUCKETS: [string, number, number][] = [['0', 0, 0], ['1–2', 1, 2], ['3–4', 3, 4], ['5+', 5, Infinity]];

interface SpeciesRecord {
  id: number;
  hue: number;
  rep: Genome;
  born: number;
  peakMembers: number;
  peakSkills: number;
  peakCommon: number;
  wasLeader: boolean;
}

export class World {
  readonly cfg: SimConfig;
  readonly rng: Rng;
  organisms: Organism[] = [];
  foodX: number[] = [];
  foodY: number[] = [];
  foodBuried: boolean[] = [];
  tick = 0;
  generation = 0;
  samples: Sample[] = [];
  census: Census[] = [];
  events: SimEvent[] = [];
  speciesCount = 1;
  leader: Leader | null = null;
  /** Bemerkenswerte ausgestorbene Arten, neueste zuletzt. */
  extinct: ExtinctSpecies[] = [];
  private challenger: { id: number; streak: number } | null = null;

  crisis: { kind: CrisisKind; until: number; start: number } | null = null;
  crisisReports: CrisisReport[] = [];
  /** Bodenfruchtbarkeit (Übernutzung durch Landwirtschaft). */
  fertility = 1;
  /** Erreichte Epoche der Kultur (0 = keine). */
  epoch = 0;
  private carriers = 0;
  /** Ernte-Potenzial aller Bauern im letzten Tick (für die Begrenzung durch das Ackerland). */
  private farmPotential = 0;
  private epochPending: { e: number; n: number } | null = null;
  private maxEpochReached = 0;
  private overuseWarned = false;

  /** Erster Kick (Funke) und Kipppunkt der Kultur. */
  firstSpark: number | null = null;
  /** Erste Art, in der die Mehrheit Augen hat (das „Licht geht an“). */
  firstEyes: number | null = null;
  tippingTick: number | null = null;

  private tippingStreak = 0;
  private lastSparkEvent = -Infinity;
  private nextId = 1;
  private nextSpeciesId = 1;
  private speciesRegistry: SpeciesRecord[] = [];
  /** Erbgut-Stichprobe für die Neubesiedlung nach einem Massenaussterben. */
  private refugium: Genome[] = [];
  private crisisStart: { buckets: number[]; species: (SpeciesStat & { rep: Genome })[] } | null = null;
  private foodAcc = 0;
  private buriedCount = 0;
  private foodAlive: boolean[] = [];
  private readonly orgGrid: Grid;
  private readonly foodGrid: Grid;
  private readonly input = new Float64Array(N_IN);
  private readonly output = new Float64Array(2);

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.orgGrid = new Grid(cfg.width, cfg.height, 40);
    this.foodGrid = new Grid(cfg.width, cfg.height, 40);
    const n = cfg.mode === 'schiedsrichter' ? cfg.judgePopulation : cfg.initialPopulation;
    for (let i = 0; i < n; i++) this.spawn(primordialGenome(this.rng));
    for (let i = 0; i < cfg.maxFood * 0.6; i++) this.addFood();
    this.takeCensus();
    this.record();
  }

  // --- Eigenschaften ----------------------------------------------------

  radius(o: Organism): number {
    return this.cfg.baseRadius * o.genome.size;
  }

  /** Effektive Sehweite: ohne Augen (Fähigkeit oder „Augen für alle“) nur Tastsinn. */
  senseRadius(o: Organism): number {
    const r = o.genome.sense * this.cfg.maxSense;
    const eyes = this.cfg.eyesUnlocked || has(this.skillsOf(o), SKILL.augen);
    const cap = eyes ? this.cfg.maxSense : this.cfg.touchRange;
    return Math.max(this.radius(o) + 2, Math.min(r, cap));
  }

  /** Alle Fähigkeiten: genetische + erlernte. */
  skillsOf(o: Organism): number {
    return o.genome.skills | o.learned.mask;
  }

  skillCount(o: Organism): number {
    return popcount(this.skillsOf(o)) + o.learned.extra;
  }

  isPredator(o: Organism): boolean {
    return o.genome.diet > PREDATOR_DIET;
  }

  /** Kann jagen: Räuber von Natur aus – oder mit Waffen. */
  isHunter(o: Organism): boolean {
    return this.isPredator(o) || has(o.learned.mask, SKILL.waffen);
  }

  canEat(a: Organism, b: Organism): boolean {
    if (this.cfg.mode !== 'natur') return false;
    const sa = this.skillsOf(a), sb = this.skillsOf(b);
    const aW = has(sa, SKILL.waffen), bW = has(sb, SKILL.waffen);
    if (bW && !aW) return false; // Waffen schützen
    if (has(sb, SKILL.huette) && !aW) return false; // Hütte schützt
    const ra = this.radius(a), rb = this.radius(b);
    // Kulturträger mit Waffen jagen alles bis doppelte Größe – außer andere Kulturträger
    if (aW && !b.genome.culture && ra * (has(sa, SKILL.metall) ? 3 : 2) > rb) return true;
    if (!this.isPredator(a)) return false;
    let ratio = this.cfg.predatorSizeRatio;
    if (has(sa, SKILL.gruppe) && a.group >= 2) ratio = 0.9; // Rudeljagd
    if (has(sb, SKILL.bau)) ratio *= 1.5; // aus dem Bau schwer herauszuholen
    if (has(sb, SKILL.gruppe) && b.group >= 2) ratio *= 1.4; // Schutz in der Herde
    return ra > ratio * rb;
  }

  /** Speichergrenze für Energie: doppelte Teilungsschwelle, mit Vorrat das Dreifache davon. */
  maxEnergy(o: Organism): number {
    const area = o.genome.size * o.genome.size;
    return this.cfg.reproFactor * area * 2 * (has(this.skillsOf(o), SKILL.vorrat) ? 3 : 1);
  }

  maxAge(o: Organism): number {
    const s = this.skillsOf(o);
    let m = this.cfg.maxAge;
    if (has(s, SKILL.kleidung)) m *= 1.2;
    if (has(s, SKILL.medizin)) m *= 1.5;
    return m;
  }

  /** Bedingung b) für den Kick erfüllt? */
  kickReady(o: Organism): boolean {
    return !o.genome.culture && popcount(o.genome.skills & GENETIC_MASK) >= this.cfg.kickMinSkills;
  }

  /** Typisches Erbgut einer lebenden Art (für das Hervorheben in der Welt). */
  speciesRep(id: number): Genome | null {
    return this.speciesRegistry.find((r) => r.id === id)?.rep ?? null;
  }

  addEvent(label: string): void {
    this.events.push({ tick: this.tick, label });
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

  // --- Krisen ------------------------------------------------------------

  startCrisis(kind: CrisisKind): void {
    if (this.crisis) return;
    const def = CRISES[kind];
    this.crisis = { kind, until: this.tick + def.duration, start: this.tick };
    this.addEvent(`${def.icon} ${def.label}`);
    if (def.shock > 0) {
      for (const o of this.organisms) if (this.rng.chance(def.shock)) o.alive = false;
    }
    if (kind === 'seuche') {
      for (const o of this.organisms) if (this.rng.chance(this.cfg.diseaseStart)) o.infection = 1;
    }
    this.takeCensus();
    const reps = new Map(this.speciesRegistry.map((r) => [r.id, r.rep]));
    this.crisisStart = {
      buckets: this.bucketCounts(),
      species: this.census[this.census.length - 1].species
        .filter((s) => s.members >= 5 && reps.has(s.id))
        .map((s) => ({ ...s, rep: reps.get(s.id)! })),
    };
  }

  private endCrisis(): void {
    if (!this.crisis || !this.crisisStart) return;
    this.takeCensus();
    const after = this.bucketCounts();
    // Eine Art gilt als überlebt, wenn noch ein genetisch ähnliches Lebewesen existiert
    const living = this.organisms.filter((o) => o.alive);
    const step = Math.max(1, Math.floor(living.length / 600));
    const survives = (s: SpeciesStat & { rep: Genome }) => {
      for (let i = 0; i < living.length; i += step) if (genomeDistance(living[i].genome, s.rep) < 0.45) return true;
      return false;
    };
    const ext = this.crisisStart.species.filter((s) => !survives(s));
    const sur = this.crisisStart.species.filter((s) => survives(s));
    const avg = (xs: SpeciesStat[]) => (xs.length ? xs.reduce((a, s) => a + s.skills, 0) / xs.length : 0);
    const start = this.crisisStart;
    this.crisisReports.push({
      kind: this.crisis.kind,
      start: this.crisis.start,
      end: this.tick,
      buckets: BUCKETS.map(([label], i) => ({ label, before: start.buckets[i], after: after[i] })),
      extinct: { count: ext.length, avgSkills: avg(ext) },
      survived: { count: sur.length, avgSkills: avg(sur) },
    });
    this.addEvent(`Ende ${CRISES[this.crisis.kind].label}`);
    if (this.crisis.kind === 'seuche') for (const o of this.organisms) o.infection = 0;
    this.crisis = null;
    this.crisisStart = null;
  }

  private bucketCounts(): number[] {
    const c = BUCKETS.map(() => 0);
    for (const o of this.organisms) {
      if (!o.alive) continue;
      const k = this.skillCount(o);
      const i = BUCKETS.findIndex(([, lo, hi]) => k >= lo && k <= hi);
      c[i]++;
    }
    return c;
  }

  // --- Futter ------------------------------------------------------------

  /**
   * Futter hinzufügen. Vergrabenes und Oberflächenfutter haben getrennte Obergrenzen –
   * sonst verstopft ungefressenes vergrabenes Futter die Welt, solange niemand graben kann.
   */
  private addFood(x?: number, y?: number, limit = this.cfg.maxFood, buried?: boolean): void {
    const b = buried ?? this.rng.chance(this.cfg.buriedShare);
    const cap = b ? limit * this.cfg.buriedShare : limit * (1 - this.cfg.buriedShare);
    if ((b ? this.buriedCount : this.foodX.length - this.buriedCount) >= cap) return;
    this.foodX.push(x ?? this.rng.range(0, this.cfg.width));
    this.foodY.push(y ?? this.rng.range(0, this.cfg.height));
    this.foodBuried.push(b);
    this.foodAlive.push(true);
    if (b) this.buriedCount++;
  }

  private compactFood(): void {
    let j = 0;
    this.buriedCount = 0;
    for (let i = 0; i < this.foodX.length; i++) {
      if (!this.foodAlive[i]) continue;
      if (this.foodBuried[i]) this.buriedCount++;
      this.foodX[j] = this.foodX[i];
      this.foodY[j] = this.foodY[i];
      this.foodBuried[j] = this.foodBuried[i];
      j++;
    }
    this.foodX.length = j;
    this.foodY.length = j;
    this.foodBuried.length = j;
    this.foodAlive = new Array(j).fill(true);
  }

  private growFood(): void {
    const mul = this.crisis ? CRISES[this.crisis.kind].food : 1;
    this.foodAcc += this.cfg.foodRate * this.cfg.oxygen * mul * this.fertility;
    while (this.foodAcc >= 1) {
      this.addFood();
      this.foodAcc -= 1;
    }
  }

  private rebuildGrids(): void {
    this.orgGrid.clear();
    for (let i = 0; i < this.organisms.length; i++) {
      const o = this.organisms[i];
      this.orgGrid.insert(i, o.x, o.y);
    }
    this.foodGrid.clear();
    for (let i = 0; i < this.foodX.length; i++) this.foodGrid.insert(i, this.foodX[i], this.foodY[i]);
  }

  /** Für „Gruppe“: Artgenossen (ähnliche Farbe, gleiche Rolle) in der Nähe zählen. */
  private countGroups(): void {
    const W = this.cfg.width, H = this.cfg.height;
    for (const o of this.organisms) {
      o.group = 0;
      if (!has(o.genome.skills, SKILL.gruppe)) continue;
      const pred = this.isPredator(o);
      this.orgGrid.forEachNear(o.x, o.y, 30, (qi) => {
        const q = this.organisms[qi];
        if (q === o || !q.alive || this.isPredator(q) !== pred || hueDistance(q.genome.hue, o.genome.hue) > 30) return;
        const dx = wrapDelta(q.x - o.x, W), dy = wrapDelta(q.y - o.y, H);
        if (dx * dx + dy * dy < 900) o.group++;
      });
    }
  }

  // --- Ein Zeitschritt -----------------------------------------------------

  step(): void {
    const cfg = this.cfg;
    const W = cfg.width;
    const H = cfg.height;
    const crisisDef = this.crisis ? CRISES[this.crisis.kind] : null;
    this.rebuildGrids();
    this.countGroups();

    // Dürre/Vulkan: Oberflächenfutter verdirbt, vergrabenes bleibt
    if (crisisDef && crisisDef.decay > 0) {
      for (let i = 0; i < this.foodX.length; i++) if (!this.foodBuried[i] && this.rng.chance(crisisDef.decay)) this.foodAlive[i] = false;
    }

    for (let idx = 0; idx < this.organisms.length; idx++) {
      const o = this.organisms[idx];
      if (!o.alive) continue;
      const sk = this.skillsOf(o);
      const digger = has(sk, SKILL.graben);
      const r = this.radius(o);
      const R = this.senseRadius(o);
      const cos = Math.cos(o.heading);
      const sin = Math.sin(o.heading);

      // --- Wahrnehmung -------------------------------------------------
      const R2 = R * R;
      let foodD2 = R2, foodDx = 0, foodDy = 0;
      this.foodGrid.forEachNear(o.x, o.y, R, (fi) => {
        if (!this.foodAlive[fi] || (this.foodBuried[fi] && !digger)) return;
        const dx = wrapDelta(this.foodX[fi] - o.x, W);
        const dy = wrapDelta(this.foodY[fi] - o.y, H);
        const d2 = dx * dx + dy * dy;
        if (d2 < foodD2) { foodD2 = d2; foodDx = dx; foodDy = dy; }
      });
      let preyD2 = R2, preyDx = 0, preyDy = 0, threatD2 = R2, threatDx = 0, threatDy = 0;
      const hunter = this.isHunter(o);
      this.orgGrid.forEachNear(o.x, o.y, R, (qi) => {
        const q = this.organisms[qi];
        if (q === o || !q.alive) return;
        const dx = wrapDelta(q.x - o.x, W);
        const dy = wrapDelta(q.y - o.y, H);
        const d2 = dx * dx + dy * dy;
        if (d2 >= R2) return;
        if (hunter && d2 < preyD2 && this.canEat(o, q)) { preyD2 = d2; preyDx = dx; preyDy = dy; }
        if (d2 < threatD2 && this.canEat(q, o)) { threatD2 = d2; threatDx = dx; threatDy = dy; }
      });
      const sense = (d2: number, dx: number, dy: number, i: number) => {
        if (d2 >= R2) { this.input[i] = 0; this.input[i + 1] = 0; return; }
        const d = Math.sqrt(d2) || 1;
        this.input[i] = (cos * dy - sin * dx) / d;
        this.input[i + 1] = 1 - d / R;
      };
      const inp = this.input;
      inp[0] = 1;
      sense(foodD2, foodDx, foodDy, 1);
      sense(preyD2, preyDx, preyDy, 3);
      sense(threatD2, threatDx, threatDy, 5);
      inp[7] = Math.min(1, o.energy / (cfg.reproFactor * o.genome.size * o.genome.size));

      // --- Entscheidung & Bewegung --------------------------------------
      think(o.genome.brain, inp, this.output);
      o.heading += this.output[0] * cfg.maxTurn;
      const v = this.output[1] * o.genome.speed * cfg.speedScale;
      o.x = (o.x + Math.cos(o.heading) * v + W) % W;
      o.y = (o.y + Math.sin(o.heading) * v + H) % H;
      o.travelled += v;
      o.age++;

      // --- Energiekosten ------------------------------------------------
      const area = o.genome.size * o.genome.size;
      let base = cfg.baseCost * area;
      if (has(sk, SKILL.feuer)) base *= 0.7;
      if (crisisDef && has(sk, SKILL.vorrat)) base *= 0.6;
      let cold = 0;
      if (crisisDef && crisisDef.cold > 0) {
        cold = crisisDef.cold * cfg.coldCost * area;
        if (has(sk, SKILL.bau)) cold *= 0.5;
        if (has(sk, SKILL.feuer)) cold *= 0.4;
        if (has(sk, SKILL.kleidung)) cold *= 0.5;
        if (has(sk, SKILL.huette)) cold *= 0.3;
      }
      const move = cfg.moveCost * area * v * v * (has(sk, SKILL.maschinen) ? 0.5 : 1);
      // Komplexitätskosten: einfache Kultur (bis 4 erlernte Fähigkeiten) ist billig
      const complexity = cfg.complexityCost * (Math.max(0, popcount(o.learned.mask) - 4) + 2 * Math.log2(1 + o.learned.extra));
      o.energy -= base + move + cfg.senseCost * (R / cfg.maxSense) + cold
        + upkeep(o.genome.skills) + (o.genome.culture ? cfg.cultureCost : 0) + complexity;

      // --- Seuche ------------------------------------------------------
      if (o.infection === 1) {
        const med = has(sk, SKILL.medizin);
        if (this.rng.chance(cfg.diseaseMortality * (med ? 0.5 : 1))) o.alive = false;
        else if (this.rng.chance(cfg.recoverRate)) o.infection = 2;
        else {
          const rr = cfg.infectRadius * cfg.infectRadius;
          this.orgGrid.forEachNear(o.x, o.y, cfg.infectRadius, (qi) => {
            const q = this.organisms[qi];
            if (q === o || !q.alive || q.infection !== 0) return;
            const dx = wrapDelta(q.x - o.x, W), dy = wrapDelta(q.y - o.y, H);
            if (dx * dx + dy * dy > rr) return;
            const p = cfg.infectRate * (hueDistance(q.genome.hue, o.genome.hue) < 40 ? 1 : 0.1);
            if (this.rng.chance(p)) q.infection = 1;
          });
        }
      }

      // --- Fressen: Pflanzen -------------------------------------------
      if (o.genome.diet < 0.8) {
        const plantGain = cfg.foodEnergy * (1 - o.genome.diet) * (has(sk, SKILL.werkzeug) ? 1.4 : 1) * (has(sk, SKILL.metall) ? 1.3 : 1) * extraBonus(o.learned.extra);
        const reach = (r + cfg.foodRadius) * (has(sk, SKILL.netz) ? 2 : 1);
        this.foodGrid.forEachNear(o.x, o.y, reach, (fi) => {
          if (!this.foodAlive[fi] || (this.foodBuried[fi] && !digger)) return;
          const dx = wrapDelta(this.foodX[fi] - o.x, W);
          const dy = wrapDelta(this.foodY[fi] - o.y, H);
          if (dx * dx + dy * dy < reach * reach) {
            this.foodAlive[fi] = false;
            o.energy += plantGain;
            o.eaten++;
          }
        });
      }

      // --- Fressen: Beute ----------------------------------------------
      if (hunter && cfg.mode === 'natur') {
        this.orgGrid.forEachNear(o.x, o.y, r * 2, (qi) => {
          const q = this.organisms[qi];
          if (q === o || !q.alive || !this.canEat(o, q)) return;
          const dx = wrapDelta(q.x - o.x, W);
          const dy = wrapDelta(q.y - o.y, H);
          const reach = r + this.radius(q);
          if (dx * dx + dy * dy < reach * reach) {
            q.alive = false;
            const qArea = q.genome.size * q.genome.size;
            const eff = this.isPredator(o) ? o.genome.diet : 0.6; // Jäger mit Waffen verwerten Beute gut
            o.energy += (Math.max(0, q.energy) + cfg.bodyEnergy * qArea) * cfg.predationEfficiency * eff;
            o.eaten++;
          }
        });
      }
    }

    // Überschüssige Energie verfällt (sonst horten Lebewesen unbegrenzt, sobald die Population voll ist)
    for (const o of this.organisms) {
      const cap = this.maxEnergy(o);
      if (o.energy > cap) o.energy = cap;
    }

    if (cfg.mode === 'natur') {
      this.culture();
      this.naturalSelection();
    }
    this.compactFood();
    this.growFood();
    this.tick++;
    if (this.crisis && this.tick >= this.crisis.until) this.endCrisis();
    if (cfg.randomCrises && !this.crisis && cfg.mode === 'natur' && this.rng.chance(1 / 6000)) {
      const kinds = Object.keys(CRISES) as CrisisKind[];
      this.startCrisis(kinds[this.rng.int(kinds.length)]);
    }
    if (cfg.mode === 'schiedsrichter' && this.tick % cfg.generationTicks === 0) this.judge();
    if (this.tick % CENSUS_EVERY === 0) this.takeCensus();
    if (this.tick % SAMPLE_EVERY === 0) this.record();
  }

  // --- Kultur --------------------------------------------------------------

  /**
   * Der Kick (Harari): seltener Glücksfall, nur bei genug genetischen Fähigkeiten (Bedingung b).
   * Kulturträger entdecken, lernen von Artgenossen (Bedingung a wirkt von selbst: ohne
   * Nachbarn kein Lernen) und betreiben Landwirtschaft.
   */
  private culture(): void {
    const cfg = this.cfg;
    const kp = kickRate(cfg.cultureBoost);
    let carriers = 0;
    let farmers = 0;
    for (const o of this.organisms) if (o.alive && o.genome.culture) carriers++;
    this.carriers = carriers;
    const maxEpoch = epochFor(carriers);
    // Ackerland begrenzt die Gesamternte: mehr Bauern auf demselben Land bringen nicht mehr
    const landFactor = this.farmPotential > 0 ? Math.min(1, (cfg.landCapacity * this.fertility) / this.farmPotential) : 1;
    for (let idx = 0; idx < this.organisms.length; idx++) {
      const o = this.organisms[idx];
      if (!o.alive) continue;

      // Kick
      if (kp > 0 && this.kickReady(o) && this.rng.chance(kp)) {
        o.genome.culture = true;
        if (this.firstSpark === null) this.firstSpark = this.tick;
        if (carriers === 0 && this.tick - this.lastSparkEvent > 300) {
          this.addEvent('Funke');
          this.lastSparkEvent = this.tick;
        }
        carriers++;
      }
      if (!o.genome.culture) continue;
      const n = this.skillCount(o);

      // Entdecken: je mehr man kann, desto eher (Wissen kombiniert sich); Wissenschaft verdoppelt
      const sci = has(o.learned.mask, SKILL.wissenschaft) ? 2 : 1;
      if (this.rng.chance(cfg.discoveryRate * (1 + 0.2 * n) * sci)) this.learnSomething(o, null, maxEpoch);

      // Vergessen (Tasmanien-Effekt): Fähigkeiten von Epochen, für die die Kulturträger nicht mehr reichen
      for (let b = 0; b < SKILLS.length; b++) {
        if ((o.learned.mask >> b) & 1 && SKILLS[b].epoch > maxEpoch && this.rng.chance(cfg.forgetRate)) o.learned.mask &= ~(1 << b);
      }
      if (o.learned.extra > 0 && carriers < EXTRA_MIN && this.rng.chance(cfg.forgetRate * 3)) {
        o.learned.extra -= Math.ceil(o.learned.extra * 0.05);
      }

      // Von Artgenossen lernen
      if (this.rng.chance(cfg.learnRate)) {
        const range = has(o.learned.mask, SKILL.schrift) ? 180 : 60;
        let teacher = null as Organism | null;
        let seen = 0;
        this.orgGrid.forEachNear(o.x, o.y, range, (qi) => {
          const q = this.organisms[qi];
          if (q === o || !q.alive || !q.genome.culture || hueDistance(q.genome.hue, o.genome.hue) > 40) return;
          if (this.skillCount(q) <= n) return;
          seen++;
          if (this.rng.int(seen) === 0) teacher = q; // zufälliges Vorbild (Reservoir-Auswahl)
        });
        if (teacher) this.learnSomething(o, teacher, maxEpoch);
      }

      // Landwirtschaft
      const harvest = this.crisis ? CRISES[this.crisis.kind].food : 1; // Missernten in Krisen
      const machines = has(o.learned.mask, SKILL.maschinen) ? 2 : 1; // Maschinen: doppelte Ernte, doppelter Raubbau
      if (has(o.learned.mask, SKILL.landwirtschaft)) farmers += machines;
      if (has(o.learned.mask, SKILL.landwirtschaft) && this.rng.chance(cfg.farmRate * harvest * machines * landFactor)) {
        this.addFood(
          (o.x + this.rng.gauss() * 25 + cfg.width) % cfg.width,
          (o.y + this.rng.gauss() * 25 + cfg.height) % cfg.height,
          cfg.maxFood * 1.5,
          false,
        );
      }
    }

    this.farmPotential = farmers * cfg.farmRate;
    // Übernutzung: Rodung senkt die Bodenfruchtbarkeit, die sich nur langsam erholt
    this.fertility += cfg.regenRate * (1 - this.fertility) - cfg.clearRate * farmers;
    this.fertility = Math.max(0.15, Math.min(1, this.fertility));
    if (!this.overuseWarned && this.fertility < 0.5) {
      this.overuseWarned = true;
      this.addEvent('🪓 Raubbau');
    }
  }

  /**
   * Neue Fähigkeit – selbst entdeckt (teacher = null) oder vom Vorbild gelernt.
   * Entdecken wird mit jeder Epoche schwerer; weitere Erfindungen erst nach der Neuzeit mit genug Kulturträgern.
   */
  private learnSomething(o: Organism, teacher: Organism | null, maxEpoch: number): void {
    const mine = this.skillsOf(o);
    let options = available(mine, false, maxEpoch);
    if (teacher) {
      const theirs = this.skillsOf(teacher);
      options = options.filter((i) => has(theirs, i));
    }
    if (options.length) {
      const pick = options[this.rng.int(options.length)];
      if (teacher || this.rng.chance(1 / Math.pow(Math.max(1, SKILLS[pick].epoch), 1.5))) o.learned.mask |= 1 << pick;
    } else if (this.carriers >= EXTRA_MIN && available(mine, false).length === 0 && (!teacher || teacher.learned.extra > o.learned.extra)) {
      o.learned.extra++;
    }
  }

  /** Erlerntes an Kinder: nur von Kulturträgern, mit Verlusten (ohne Schrift). */
  private inherit(parent: Organism): Learned {
    if (!parent.genome.culture) return nothingLearned();
    const written = has(parent.learned.mask, SKILL.schrift);
    const keep = written ? 1 : this.cfg.transmission;
    let mask = 0;
    for (let i = 0; i < 31; i++) if ((parent.learned.mask >> i) & 1 && this.rng.chance(keep)) mask |= 1 << i;
    const extra = written ? parent.learned.extra : Math.floor(parent.learned.extra * keep);
    return { mask, extra };
  }

  // --- Selektion -------------------------------------------------------------

  /** Natur: Tod durch Hunger/Alter, Teilung bei genug Energie. Kein Schiedsrichter. */
  private naturalSelection(): void {
    const cfg = this.cfg;
    const survivors: Organism[] = [];
    for (const o of this.organisms) {
      if (!o.alive || o.energy <= 0 || o.age > this.maxAge(o)) { o.alive = false; continue; }
      survivors.push(o);
    }
    this.organisms = survivors;
    const babies: Organism[] = [];
    for (const o of survivors) {
      const area = o.genome.size * o.genome.size;
      if (o.energy > cfg.reproFactor * area && survivors.length + babies.length < cfg.maxPopulation) {
        const childEnergy = o.energy * 0.45; // 10 % gehen bei der Teilung verloren
        o.energy *= 0.45;
        babies.push({
          id: this.nextId++,
          x: (o.x + this.rng.gauss() * 6 + cfg.width) % cfg.width,
          y: (o.y + this.rng.gauss() * 6 + cfg.height) % cfg.height,
          heading: this.rng.range(0, Math.PI * 2),
          energy: childEnergy,
          age: 0,
          genome: mutate(o.genome, this.rng, cfg.mutationRate),
          lineage: o.lineage + 1,
          alive: true,
          eaten: 0,
          travelled: 0,
          learned: this.inherit(o),
          group: 0,
          infection: 0,
        });
      }
    }
    for (const b of babies) this.organisms.push(b);
    if (this.organisms.length < cfg.minPopulation) {
      if (this.organisms.length === 0) this.addEvent(this.refugium.length ? 'Ausgestorben – Überlebende aus Refugien' : 'Ausgestorben – Urformen wandern ein');
      while (this.organisms.length < cfg.minPopulation) {
        // Neubesiedlung aus Refugien (ohne Kultur); nur am Anfang Urformen
        const g = this.refugium.length
          ? { ...mutate(this.refugium[this.rng.int(this.refugium.length)], this.rng, cfg.mutationRate), culture: false }
          : primordialGenome(this.rng);
        this.spawn(g);
      }
    }
  }

  /** Schiedsrichter: Am Generationsende pflanzen sich nur die „Besten“ fort. */
  private judge(): void {
    const cfg = this.cfg;
    const ranked = [...this.organisms].sort((a, b) => fitness(b, cfg.fitness) - fitness(a, cfg.fitness));
    const nElite = Math.max(1, Math.round(ranked.length * cfg.eliteFraction));
    const elite = ranked.slice(0, nElite);
    for (const o of this.organisms) o.alive = false;
    this.organisms = [];
    for (let i = 0; i < cfg.judgePopulation; i++) {
      const parent = elite[this.rng.int(elite.length)];
      this.spawn(mutate(parent.genome, this.rng, cfg.mutationRate), undefined, undefined, cfg.startEnergy, parent.lineage + 1);
    }
    this.generation++;
  }

  // --- Statistik ---------------------------------------------------------------

  /** Arten zählen und über die Zeit wiedererkennen (für Messlatte und Krisenbilanz). */
  private takeCensus(): void {
    const os = this.organisms.filter((o) => o.alive);
    // Refugium auffrischen, solange es genug Leben gibt (Erbgut, das sich bewährt hat)
    if (os.length >= 60 && this.tick >= 1000) {
      this.refugium = Array.from({ length: 40 }, () => os[this.rng.int(os.length)].genome);
    }
    const clusters = clusterSpecies(os.map((o) => o.genome));
    const sampledTotal = Math.min(os.length, 400) || 1;
    const scale = os.length / sampledTotal;
    const used = new Set<number>();
    const stats: SpeciesStat[] = [];
    for (const c of clusters) {
      let rec: SpeciesRecord | null = null;
      let best = 0.35;
      for (const s of this.speciesRegistry) {
        if (used.has(s.id)) continue;
        const d = genomeDistance(s.rep, c.representative);
        if (d < best) { best = d; rec = s; }
      }
      if (!rec) {
        rec = { id: this.nextSpeciesId++, hue: c.representative.hue, rep: c.representative, born: this.tick, peakMembers: 0, peakSkills: 0, peakCommon: 0, wasLeader: false };
        this.speciesRegistry.push(rec);
      }
      rec.rep = c.representative;
      used.add(rec.id);
      let skills = 0, cult = 0, pred = 0, score = 0;
      const judge = this.cfg.mode === 'schiedsrichter';
      const bitCount = new Array(SKILLS.length).fill(0);
      for (const i of c.indices) {
        skills += this.skillCount(os[i]);
        if (os[i].genome.culture) cult++;
        if (this.isPredator(os[i])) pred++;
        if (judge) score += fitness(os[i], this.cfg.fitness);
        const m = this.skillsOf(os[i]);
        for (let b = 0; b < SKILLS.length; b++) if ((m >> b) & 1) bitCount[b]++;
      }
      let common = 0;
      for (let b = 0; b < SKILLS.length; b++) if (bitCount[b] * 2 > c.indices.length) common |= 1 << b;
      const st: SpeciesStat = {
        id: rec.id,
        hue: rec.hue,
        members: Math.round(c.members * scale),
        skills: skills / c.indices.length,
        culture: cult / c.indices.length,
        predator: pred > c.indices.length / 2,
        common,
        born: rec.born,
        score: score / c.indices.length,
      };
      stats.push(st);
      rec.peakMembers = Math.max(rec.peakMembers, st.members);
      if (st.skills >= rec.peakSkills) { rec.peakSkills = st.skills; rec.peakCommon = common; }
    }
    this.updateLeader(stats);
    if (this.leader) { const r = this.speciesRegistry.find((x) => x.id === this.leader!.id); if (r) r.wasLeader = true; }
    if (this.firstEyes === null && !this.cfg.eyesUnlocked && stats.some((s) => s.members >= 10 && has(s.common, SKILL.augen))) {
      this.firstEyes = this.tick;
      this.addEvent('👁️ erste Art mit Augen');
    }
    // Registry schlank halten: nur Arten, die gerade leben – bemerkenswerte Ausgestorbene merken
    for (const r of this.speciesRegistry) {
      if (used.has(r.id) || !(r.peakMembers >= NOTABLE_MEMBERS || r.wasLeader)) continue;
      this.extinct.push({
        id: r.id, hue: r.hue, born: r.born, died: this.tick, peakMembers: r.peakMembers, peakSkills: r.peakSkills,
        common: r.peakCommon, wasLeader: r.wasLeader, crisis: this.crisis?.kind ?? null,
      });
    }
    if (this.extinct.length > MAX_EXTINCT) this.extinct.splice(0, this.extinct.length - MAX_EXTINCT);
    this.speciesRegistry = this.speciesRegistry.filter((s) => used.has(s.id));
    this.speciesCount = stats.length;
    this.census.push({ tick: this.tick, species: stats });
    if (this.census.length > MAX_CENSUS) this.census.splice(0, this.census.length - MAX_CENSUS);
  }

  /** Spitzenreiter bestimmen – mit Hysterese, damit er nicht bei jeder Zählung flackert. */
  private updateLeader(stats: SpeciesStat[]): void {
    const eligible = stats.filter((s) => s.members >= LEADER_MIN_MEMBERS && s.skills >= 1);
    if (!eligible.length) {
      // niemand qualifiziert: bisherigen Spitzenreiter mit aktuellen Zahlen weiterführen (sonst veraltete Werte)
      const cur = this.leader ? stats.find((s) => s.id === this.leader!.id) : undefined;
      if (cur && this.leader) this.leader = { ...this.leader, skills: cur.skills, members: cur.members, culture: cur.culture, common: cur.common };
      return;
    }
    const best = eligible.reduce((a, b) => (b.skills > a.skills ? b : a));
    const current = this.leader ? stats.find((s) => s.id === this.leader!.id && s.members >= LEADER_MIN_MEMBERS) : undefined;
    const toLeader = (s: SpeciesStat, since: number): Leader => ({ id: s.id, hue: s.hue, skills: s.skills, members: s.members, culture: s.culture, common: s.common, since });
    if (!current) {
      // kein (lebender) Spitzenreiter → sofort übernehmen
      if (this.leader) this.addEvent('🏆 Wechsel');
      this.leader = toLeader(best, this.tick);
      this.challenger = null;
      return;
    }
    this.leader = toLeader(current, this.leader!.since);
    if (best.id !== current.id && best.skills > current.skills * 1.15) {
      this.challenger = this.challenger?.id === best.id ? { id: best.id, streak: this.challenger.streak + 1 } : { id: best.id, streak: 1 };
      if (this.challenger.streak >= 3) {
        this.leader = toLeader(best, this.tick);
        this.challenger = null;
        this.addEvent('🏆 Wechsel');
      }
    } else {
      this.challenger = null;
    }
  }

  /** Epoche der Kultur: höchste, aus der mindestens 30 % der Kulturträger etwas können. */
  private updateEpoch(): number {
    const carriers = this.organisms.filter((o) => o.genome.culture);
    let e = 0;
    if (carriers.length >= 3) {
      for (let ep = 1; ep <= EPOCHS.length; ep++) {
        const mask = SKILLS.reduce((m, d, i) => (d.epoch === ep ? m | (1 << i) : m), 0);
        if (carriers.filter((o) => o.learned.mask & mask).length >= carriers.length * 0.3) e = ep;
      }
    }
    // Wechsel erst, wenn die neue Epoche 3 Messungen in Folge besteht (kein Flackern)
    if (e === this.epoch) { this.epochPending = null; return e; }
    this.epochPending = this.epochPending?.e === e ? { e, n: this.epochPending.n + 1 } : { e, n: 1 };
    if (this.epochPending.n < 3) return this.epoch;
    if (e > this.epoch) {
      if (e >= 2 || this.maxEpochReached < 1) this.addEvent(`${EPOCHS[e - 1].icon} ${EPOCHS[e - 1].name}`);
    } else if (this.epoch >= 2) {
      this.addEvent(e === 0 ? '📉 Kultur erloschen' : `📉 zurück: ${EPOCHS[e - 1].name}`);
    }
    this.maxEpochReached = Math.max(this.maxEpochReached, e);
    this.epoch = e;
    this.epochPending = null;
    return e;
  }

  /** Kipppunkt: ≥ 10 % Kulturträger mit Ø ≥ 5 Fähigkeiten, 5 Messungen in Folge. */
  private detectTipping(s: Sample): void {
    if (this.tippingTick !== null) return;
    this.tippingStreak = s.cultureShare >= TIPPING_SHARE && s.cultureSkills >= TIPPING_SKILLS ? this.tippingStreak + 1 : 0;
    if (this.tippingStreak >= 5) {
      this.tippingTick = this.tick;
      this.addEvent('⚡ Kultur kippt');
    }
  }

  private record(): void {
    const os = this.organisms;
    const n = os.length || 1;
    let pred = 0, s = 0, v = 0, e = 0, d = 0, sk = 0, cult = 0, cultSk = 0, maxSk = 0, ready = 0, sick = 0;
    for (const o of os) {
      if (o.infection === 1) sick++;
      const k = this.skillCount(o);
      sk += k;
      if (k > maxSk) maxSk = k;
      if (o.genome.culture) { cult++; cultSk += k; }
      else if (this.isPredator(o)) pred++;
      if (this.kickReady(o)) ready++;
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
      food: this.foodX.length,
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
      epoch: this.updateEpoch(),
    };
    this.samples.push(sample);
    this.detectTipping(sample);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }
}

export function fitness(o: Organism, f: Fitness): number {
  switch (f) {
    case 'futter': return o.eaten;
    case 'rot': return 1 - hueDistance(o.genome.hue, 0) / 180;
    case 'groesse': return o.genome.size;
    case 'strecke': return o.travelled;
  }
}
