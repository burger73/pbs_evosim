import { N_IN, think } from './brain.ts';
import type { Fitness, SimConfig } from './config.ts';
import { genomeDistance, hueDistance, mutate, primordialGenome, type Genome } from './genome.ts';
import { Grid, wrapDelta } from './grid.ts';
import { Rng } from './rng.ts';
import { SKILL, available, extraBonus, has, noSkills, skillCount, type Skills } from './skills.ts';
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
  /** Erlernte Fähigkeiten (Kultur). */
  skills: Skills;
}

export interface Sample {
  tick: number;
  population: number;
  predators: number;
  species: number;
  food: number;
  avgSize: number;
  avgSpeed: number;
  avgSense: number;
  avgDiet: number;
  avgIntellect: number;
  /** Ø Fähigkeiten der Kulturträger (Intelligenz über der Lernschwelle). */
  topSkills: number;
  /** Ø Fähigkeiten aller übrigen. */
  otherSkills: number;
  /** Anteil der Kulturträger an der Population (0..1). */
  topShare: number;
  /** Höchste Zahl an Fähigkeiten eines einzelnen Lebewesens. */
  maxSkills: number;
}

export interface SimEvent {
  tick: number;
  label: string;
}

export const SAMPLE_EVERY = 10;
/** Ab diesem Ernährungswert kann ein Organismus andere fressen. */
export const PREDATOR_DIET = 0.3;
const MAX_SAMPLES = 2000;

export class World {
  readonly rng: Rng;
  organisms: Organism[] = [];
  foodX: number[] = [];
  foodY: number[] = [];
  tick = 0;
  generation = 0;
  samples: Sample[] = [];
  events: SimEvent[] = [];
  /** Letzte Artenzählung (für die Anzeige). */
  speciesCount = 1;
  private readonly neighborBuf: number[] = [];

  private nextId = 1;
  private foodAcc = 0;
  private foodAlive: boolean[] = [];
  private readonly orgGrid: Grid;
  private readonly foodGrid: Grid;
  private readonly input = new Float64Array(N_IN);
  private readonly output = new Float64Array(2);

  readonly cfg: SimConfig;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.orgGrid = new Grid(cfg.width, cfg.height, 40);
    this.foodGrid = new Grid(cfg.width, cfg.height, 40);
    const n = cfg.mode === 'schiedsrichter' ? cfg.judgePopulation : cfg.initialPopulation;
    for (let i = 0; i < n; i++) this.spawn(primordialGenome(this.rng));
    for (let i = 0; i < cfg.maxFood * 0.6; i++) this.addFood();
    this.record();
  }

  radius(o: Organism): number {
    return this.cfg.baseRadius * o.genome.size;
  }

  /** Effektive Sehweite: ohne Augen nur Tastsinn. */
  senseRadius(o: Organism): number {
    const r = o.genome.sense * this.cfg.maxSense;
    const cap = this.cfg.eyesUnlocked ? this.cfg.maxSense : this.cfg.touchRange;
    return Math.max(this.radius(o) + 2, Math.min(r, cap));
  }

  isPredator(o: Organism): boolean {
    return o.genome.diet > PREDATOR_DIET;
  }

  /** Kann jagen: Räuber von Natur aus – oder durch erlernte Jagd/Waffen. */
  isHunter(o: Organism): boolean {
    return this.isPredator(o) || has(o.skills, SKILL.jagd) || has(o.skills, SKILL.waffen);
  }

  canEat(a: Organism, b: Organism): boolean {
    if (this.cfg.mode !== 'natur') return false;
    const aW = has(a.skills, SKILL.waffen), bW = has(b.skills, SKILL.waffen);
    if (bW && !aW) return false; // Waffen schützen
    const ra = this.radius(a), rb = this.radius(b);
    // Werkzeug-Jagd richtet sich nicht gegen andere Kulturträger
    const fairGame = b.genome.intellect <= this.cfg.learnThreshold;
    if (aW && !bW && ra * 2 > rb && fairGame) return true;
    if (has(a.skills, SKILL.jagd) && ra * 1.5 > rb && fairGame) return true;
    return this.isPredator(a) && ra > this.cfg.predatorSizeRatio * rb;
  }

  maxAge(o: Organism): number {
    let m = this.cfg.maxAge;
    if (has(o.skills, SKILL.kleidung)) m *= 1.2;
    if (has(o.skills, SKILL.medizin)) m *= 1.5;
    return m;
  }

  /** Kann lernen und Wissen an Kinder weitergeben? */
  isCultural(o: Organism): boolean {
    return this.cfg.cultureUnlocked && o.genome.intellect > this.cfg.learnThreshold;
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
      skills: noSkills(),
    };
    this.organisms.push(o);
    return o;
  }

  private addFood(x?: number, y?: number, limit = this.cfg.maxFood): void {
    if (this.foodX.length >= limit) return;
    this.foodX.push(x ?? this.rng.range(0, this.cfg.width));
    this.foodY.push(y ?? this.rng.range(0, this.cfg.height));
    this.foodAlive.push(true); // im Raster erst ab dem nächsten Tick
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

  /** Ein Zeitschritt. */
  step(): void {
    const cfg = this.cfg;
    const W = cfg.width;
    const H = cfg.height;
    this.rebuildGrids();

    for (let idx = 0; idx < this.organisms.length; idx++) {
      const o = this.organisms[idx];
      if (!o.alive) continue;
      const r = this.radius(o);
      const R = this.senseRadius(o);
      const cos = Math.cos(o.heading);
      const sin = Math.sin(o.heading);

      // --- Wahrnehmung -------------------------------------------------
      const R2 = R * R;
      let foodD2 = R2, foodDx = 0, foodDy = 0;
      this.foodGrid.forEachNear(o.x, o.y, R, (fi) => {
        if (!this.foodAlive[fi]) return;
        const dx = wrapDelta(this.foodX[fi] - o.x, W);
        const dy = wrapDelta(this.foodY[fi] - o.y, H);
        const d2 = dx * dx + dy * dy;
        if (d2 < foodD2) { foodD2 = d2; foodDx = dx; foodDy = dy; }
      });
      let preyD2 = R2, preyDx = 0, preyDy = 0, threatD2 = R2, threatDx = 0, threatDy = 0;
      const oPred = this.isHunter(o);
      this.orgGrid.forEachNear(o.x, o.y, R, (qi) => {
        const q = this.organisms[qi];
        if (q === o || !q.alive) return;
        const dx = wrapDelta(q.x - o.x, W);
        const dy = wrapDelta(q.y - o.y, H);
        const d2 = dx * dx + dy * dy;
        if (d2 >= R2) return;
        if (oPred && d2 < preyD2 && this.canEat(o, q)) { preyD2 = d2; preyDx = dx; preyDy = dy; }
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
      const fire = has(o.skills, SKILL.feuer) ? 0.7 : 1;
      const I = o.genome.intellect;
      o.energy -= cfg.baseCost * area * fire + cfg.moveCost * area * v * v + cfg.senseCost * (R / cfg.maxSense) + cfg.intellectCost * I * I;

      // --- Fressen: Pflanzen -------------------------------------------
      const plantGain = cfg.foodEnergy * (1 - o.genome.diet) * (has(o.skills, SKILL.werkzeug) ? 1.4 : 1) * extraBonus(o.skills);
      if (o.genome.diet < 0.8) {
        const reach = r + cfg.foodRadius;
        this.foodGrid.forEachNear(o.x, o.y, reach, (fi) => {
          if (!this.foodAlive[fi]) return;
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
      if (this.isHunter(o) && cfg.mode === 'natur') {
        this.orgGrid.forEachNear(o.x, o.y, r * 2, (qi) => {
          const q = this.organisms[qi];
          if (q === o || !q.alive || !this.canEat(o, q)) return;
          const dx = wrapDelta(q.x - o.x, W);
          const dy = wrapDelta(q.y - o.y, H);
          const reach = r + this.radius(q);
          if (dx * dx + dy * dy < reach * reach) {
            q.alive = false;
            const qArea = q.genome.size * q.genome.size;
            const eff = this.isPredator(o) ? o.genome.diet : 0.6; // Jäger mit Werkzeug verwerten Beute gut
            o.energy += (Math.max(0, q.energy) + cfg.bodyEnergy * qArea) * cfg.predationEfficiency * eff;
            o.eaten++;
          }
        });
      }
    }

    if (cfg.cultureUnlocked && cfg.mode === 'natur') this.culture();
    if (cfg.mode === 'natur') this.naturalSelection();
    this.compactFood();
    this.growFood();
    this.tick++;
    if (cfg.mode === 'schiedsrichter' && this.tick % cfg.generationTicks === 0) this.judge();
    if (this.tick % SAMPLE_EVERY === 0) this.record();
  }

  /** Natur: Tod durch Hunger/Alter, Teilung bei genug Energie. Kein Schiedsrichter. */
  private naturalSelection(): void {
    const cfg = this.cfg;
    const survivors: Organism[] = [];
    const babies: Organism[] = [];
    for (const o of this.organisms) {
      if (!o.alive || o.energy <= 0 || o.age > this.maxAge(o)) { o.alive = false; continue; }
      survivors.push(o);
    }
    this.organisms = survivors;
    for (const o of survivors) {
      const area = o.genome.size * o.genome.size;
      if (o.energy > cfg.reproFactor * area && survivors.length + babies.length < cfg.maxPopulation) {
        const childEnergy = o.energy * 0.45; // 10 % gehen bei der Teilung verloren
        o.energy *= 0.45;
        const child: Organism = {
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
          skills: this.inherit(o),
        };
        babies.push(child);
      }
    }
    for (const b of babies) this.organisms.push(b);
    if (this.organisms.length < cfg.minPopulation) {
      if (this.organisms.length === 0) this.addEvent('Ausgestorben – Urformen wandern ein');
      while (this.organisms.length < cfg.minPopulation) this.spawn(primordialGenome(this.rng));
    }
  }

  /**
   * Kultur: entdecken, voneinander lernen, Landwirtschaft.
   * Entdecken wird umso wahrscheinlicher, je mehr man schon kann (Wissen kombiniert sich).
   */
  private culture(): void {
    const cfg = this.cfg;
    const buf = this.neighborBuf;
    for (let idx = 0; idx < this.organisms.length; idx++) {
      const o = this.organisms[idx];
      if (!o.alive) continue;
      const I = o.genome.intellect;
      const n = skillCount(o.skills);

      // Entdecken
      if (this.rng.chance(cfg.discoveryRate * I * I * (1 + 0.2 * n))) this.learnSomething(o.skills, null);

      // Von anderen lernen (nur oberhalb der Schwelle)
      if (I > cfg.learnThreshold) {
        const p = cfg.learnRate * ((I - cfg.learnThreshold) / (1 - cfg.learnThreshold)) * (has(o.skills, SKILL.sprache) ? 3 : 1);
        if (this.rng.chance(p)) {
          const range = has(o.skills, SKILL.schrift) ? 180 : 60;
          buf.length = 0;
          this.orgGrid.forEachNear(o.x, o.y, range, (qi) => {
            const q = this.organisms[qi];
            if (q !== o && q.alive && q.genome.intellect > cfg.learnThreshold && skillCount(q.skills) > n) buf.push(qi);
          });
          // gelernt wird nur von der eigenen Art (gemeinsame „Sprache“)
          const own = buf.filter((qi) => genomeDistance(this.organisms[qi].genome, o.genome) < 0.4);
          if (own.length) this.learnSomething(o.skills, this.organisms[own[this.rng.int(own.length)]].skills);
        }
      }

      // Landwirtschaft: Futter in der Nähe anbauen
      if (has(o.skills, SKILL.landwirtschaft) && this.rng.chance(cfg.farmRate)) {
        this.addFood(
          (o.x + this.rng.gauss() * 25 + cfg.width) % cfg.width,
          (o.y + this.rng.gauss() * 25 + cfg.height) % cfg.height,
          cfg.maxFood * 1.5,
        );
      }
    }
  }

  /** Eine neue Fähigkeit erwerben – selbst entdeckt (teacher = null) oder von einem Vorbild gelernt. */
  private learnSomething(s: Skills, teacher: Skills | null): void {
    let options = available(s);
    if (teacher) options = options.filter((i) => has(teacher, i));
    if (options.length) {
      s.mask |= 1 << options[this.rng.int(options.length)];
    } else if (!teacher ? available(s).length === 0 : teacher.extra > s.extra && available(s).length === 0) {
      s.extra++;
    }
  }

  /** Weitergabe an ein Kind – nur bei ausreichender Intelligenz, mit Verlusten (ohne Schrift). */
  private inherit(parent: Organism): Skills {
    if (!this.isCultural(parent)) return noSkills();
    const written = has(parent.skills, SKILL.schrift);
    const keep = written ? 1 : this.cfg.transmission;
    let mask = 0;
    for (let i = 0; i < 31; i++) if ((parent.skills.mask >> i) & 1 && this.rng.chance(keep)) mask |= 1 << i;
    const extra = written ? parent.skills.extra : Math.floor(parent.skills.extra * keep);
    return { mask, extra };
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

  private compactFood(): void {
    let j = 0;
    for (let i = 0; i < this.foodX.length; i++) {
      if (!this.foodAlive[i]) continue;
      this.foodX[j] = this.foodX[i];
      this.foodY[j] = this.foodY[i];
      j++;
    }
    this.foodX.length = j;
    this.foodY.length = j;
    this.foodAlive = new Array(j).fill(true);
  }

  private growFood(): void {
    this.foodAcc += this.cfg.foodRate * this.cfg.oxygen;
    while (this.foodAcc >= 1) {
      this.addFood();
      this.foodAcc -= 1;
    }
  }

  private record(): void {
    const os = this.organisms;
    const n = os.length || 1;
    let pred = 0, s = 0, v = 0, e = 0, d = 0, intel = 0;
    let cult = 0, cultSk = 0, restSk = 0, maxSk = 0;
    for (const o of os) {
      const k = skillCount(o.skills);
      if (k > maxSk) maxSk = k;
      if (o.genome.intellect > this.cfg.learnThreshold) { cult++; cultSk += k; } else restSk += k;
      if (this.isPredator(o) && !this.isCultural(o)) pred++; // „wilde“ Räuber
      s += o.genome.size;
      v += o.genome.speed;
      e += o.genome.sense;
      d += o.genome.diet;
      intel += o.genome.intellect;
    }
    if (this.tick % (SAMPLE_EVERY * 5) === 0) {
      const clusters = clusterSpecies(os.map((o) => o.genome));
      this.speciesCount = clusters.length;
    }
    this.samples.push({
      tick: this.tick,
      population: os.length,
      predators: pred,
      species: this.speciesCount,
      food: this.foodX.length,
      avgSize: s / n,
      avgSpeed: v / n,
      avgSense: e / n,
      avgDiet: d / n,
      avgIntellect: intel / n,
      topSkills: cult ? cultSk / cult : 0,
      otherSkills: os.length - cult ? restSk / (os.length - cult) : 0,
      topShare: cult / n,
      maxSkills: maxSk,
    });
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
