/**
 * Kultur: der seltene Kick (Harari), Entdecken, Lernen von Artgenossen, Vergessen (Tasmanien-Effekt,
 * Henrich), Landwirtschaft mit Raubbau, Epochen und Kipppunkt.
 *
 * Kulturlinien: Jeder Kick gründet eine Linie; Kinder erben ihre Nummer mit der Kulturfähigkeit.
 * Gelernt wird nur innerhalb der eigenen Linie, und jede Linie hat ihre eigene Epoche und ihren
 * eigenen Kipppunkt – „kollektives Gehirn“ heißt: die Köpfe der eigenen Kultur zählen.
 * So können getrennte Kulturen (etwa auf verschiedenen Kontinenten) verschieden weit kommen.
 */
import { CRISES, kickRate } from './config.ts';
import { EPOCHS, EXTRA_MIN, SKILL, SKILLS, available, epochFor, has, nothingLearned, type Learned } from './skills.ts';
import { kickReady, skillCount, skillsOf } from './traits.ts';
import { TIPPING_SHARE, TIPPING_SKILLS, type Organism } from './types.ts';
import type { World } from './world.ts';
import { pow as dpow } from './dmath.ts';

/** Zustand einer Kulturlinie. */
export interface CultureLine {
  id: number;
  /** Schritt des gründenden Kicks. */
  founded: number;
  /** Kulturträger bei der letzten Zählung. */
  carriers: number;
  /** Ø Fähigkeiten der Kulturträger bei der letzten Messung. */
  skills: number;
  /** Erreichte Epoche (0 = keine). */
  epoch: number;
  maxEpoch: number;
  tippingTick: number | null;
  /** Kontinent, auf dem die meisten Träger leben (−1 = unbekannt/Wasser). */
  home: number;
  epochPending: { e: number; n: number } | null;
  tippingStreak: number;
}

export class CultureSystem {
  /** Bodenfruchtbarkeit je Kontinent (Übernutzung durch Landwirtschaft); in der offenen Welt ein Wert. */
  fertility: Float64Array = new Float64Array(1).fill(1);
  /** Lebende (und bis zur nächsten Messung zuletzt gesehene) Kulturlinien. */
  lines = new Map<number, CultureLine>();
  /** Erster Kick (Funke) und erster Kipppunkt irgendeiner Linie. */
  firstSpark: number | null = null;
  tippingTick: number | null = null;

  /** Kulturträger je Linie im aktuellen Schritt (für Epochen-Grenzen und Erfindungen). */
  private carriersByLine = new Map<number, number>();
  private nextLine = 1;
  /** Ernte-Potenzial der Bauern je Kontinent im letzten Tick (für die Begrenzung durch das Ackerland). */
  private farmPotential: Float64Array = new Float64Array(1);
  private overuseWarned: boolean[] = [false];

  /** Für die Welt einrichten: ein Boden-Wert je Kontinent. */
  init(continents: number): void {
    this.fertility = new Float64Array(continents).fill(1);
    this.farmPotential = new Float64Array(continents);
    this.overuseWarned = new Array(continents).fill(false);
  }

  /** Schlechtester Boden und sein Kontinent. */
  worstSoil(): { value: number; region: number } {
    let value = 1, region = 0;
    for (let r = 0; r < this.fertility.length; r++) if (this.fertility[r] < value) { value = this.fertility[r]; region = r; }
    return { value, region };
  }
  private lastSparkEvent = -Infinity;
  private stoneAgeShown = false;

  /** Höchste Epoche aller Linien (für Statistik und Anzeige). */
  get epoch(): number {
    let e = 0;
    for (const l of this.lines.values()) e = Math.max(e, l.epoch);
    return e;
  }

  step(w: World): void {
    const cfg = w.cfg;
    const rng = w.rng;
    const organisms = w.organisms;
    const kp = kickRate(cfg.cultureBoost);
    const byLine = this.carriersByLine;
    byLine.clear();
    let carriers = 0;
    const regions = this.fertility.length;
    const farmers = new Float64Array(regions);
    // Anteil des fruchtbaren Landes je Kontinent: Ackerland und Raubbau verteilen sich nach Fläche
    const land = w.terrain.fertilePerRegion;
    let totalLand = 0;
    for (let r = 0; r < regions; r++) totalLand += land[r];
    const share = (r: number) => (regions === 1 || totalLand === 0 ? 1 : land[r] / totalLand);
    for (const o of organisms) {
      if (!o.alive || !o.genome.culture) continue;
      carriers++;
      byLine.set(o.genome.line, (byLine.get(o.genome.line) ?? 0) + 1);
    }
    // Ackerland begrenzt die Gesamternte: mehr Bauern auf demselben Land bringen nicht mehr
    const landFactor = new Float64Array(regions);
    for (let r = 0; r < regions; r++) {
      landFactor[r] = this.farmPotential[r] > 0 ? Math.min(1, (cfg.landCapacity * share(r) * this.fertility[r]) / this.farmPotential[r]) : 1;
    }
    for (let idx = 0; idx < organisms.length; idx++) {
      const o = organisms[idx];
      if (!o.alive) continue;

      // Kick: gründet eine neue Kulturlinie
      if (kp > 0 && kickReady(cfg, o) && rng.chance(kp)) {
        o.genome.culture = true;
        o.genome.line = this.nextLine++;
        byLine.set(o.genome.line, 1);
        if (this.firstSpark === null) this.firstSpark = w.tick;
        if (carriers === 0 && w.tick - this.lastSparkEvent > 300) {
          w.addEvent('Funke');
          this.lastSparkEvent = w.tick;
        }
        carriers++;
      }
      if (!o.genome.culture) continue;
      const n = skillCount(o);
      const mine = byLine.get(o.genome.line) ?? 0;
      const maxEpoch = epochFor(mine);

      // Entdecken: je mehr man kann, desto eher (Wissen kombiniert sich); Wissenschaft verdoppelt
      const sci = has(o.learned.mask, SKILL.wissenschaft) ? 2 : 1;
      if (rng.chance(cfg.discoveryRate * (1 + 0.2 * n) * sci)) this.learnSomething(w, o, null, maxEpoch, mine);

      // Vergessen (Tasmanien-Effekt): Fähigkeiten von Epochen, für die die eigene Linie zu klein ist
      for (let b = 0; b < SKILLS.length; b++) {
        if ((o.learned.mask >> b) & 1 && SKILLS[b].epoch > maxEpoch && rng.chance(cfg.forgetRate)) o.learned.mask &= ~(1 << b);
      }
      if (o.learned.extra > 0 && mine < EXTRA_MIN && rng.chance(cfg.forgetRate * 3)) {
        o.learned.extra -= Math.ceil(o.learned.extra * 0.05);
      }

      // Von Artgenossen der eigenen Linie lernen
      if (rng.chance(cfg.learnRate)) {
        const range = has(o.learned.mask, SKILL.schrift) ? 180 : 60;
        let teacher = null as Organism | null;
        let seen = 0;
        w.orgGrid.forEachNear(o.x, o.y, range, (qi) => {
          const q = organisms[qi];
          if (q === o || !q.alive || !q.genome.culture || q.genome.line !== o.genome.line) return;
          if (skillCount(q) <= n) return;
          seen++;
          if (rng.int(seen) === 0) teacher = q; // zufälliges Vorbild (Reservoir-Auswahl)
        });
        if (teacher) this.learnSomething(w, o, teacher, maxEpoch, mine);
      }

      // Landwirtschaft
      const harvest = w.crisis ? CRISES[w.crisis.kind].food : 1; // Missernten in Krisen
      const machines = has(o.learned.mask, SKILL.maschinen) ? 2 : 1; // Maschinen: doppelte Ernte, doppelter Raubbau
      const region = regions === 1 ? 0 : w.terrain.regionAt(o.x, o.y); // auf dem Wasser (Boot) wird nicht geackert
      if (has(o.learned.mask, SKILL.landwirtschaft) && region >= 0) farmers[region] += machines;
      if (has(o.learned.mask, SKILL.landwirtschaft) && region >= 0 && rng.chance(cfg.farmRate * harvest * machines * landFactor[region])) {
        w.food.add(
          (o.x + rng.gauss() * 25 + cfg.width) % cfg.width,
          (o.y + rng.gauss() * 25 + cfg.height) % cfg.height,
          cfg.maxFood * 1.5,
          false,
        );
      }
    }

    // Übernutzung: Rodung senkt die Bodenfruchtbarkeit des Kontinents, die sich nur langsam erholt.
    // Gleich viele Bauern auf halb so viel Land laugen den Boden doppelt so schnell aus.
    for (let r = 0; r < regions; r++) {
      this.farmPotential[r] = farmers[r] * cfg.farmRate;
      const f = this.fertility[r] + (cfg.regenRate * (1 - this.fertility[r]) - (cfg.clearRate * farmers[r]) / share(r)); // Klammerung wie früher (Gleitkomma!)
      this.fertility[r] = Math.max(0.15, Math.min(1, f));
      if (!this.overuseWarned[r] && this.fertility[r] < 0.5) {
        this.overuseWarned[r] = true;
        w.addEvent(regions === 1 ? '🪓 Raubbau' : `🪓 Raubbau (${String.fromCharCode(65 + r)})`);
      }
    }
  }

  /**
   * Neue Fähigkeit – selbst entdeckt (teacher = null) oder vom Vorbild gelernt.
   * Entdecken wird mit jeder Epoche schwerer; weitere Erfindungen erst nach der Neuzeit mit genug Trägern der eigenen Linie.
   */
  private learnSomething(w: World, o: Organism, teacher: Organism | null, maxEpoch: number, lineCarriers: number): void {
    const mine = skillsOf(o);
    let options = available(mine, false, maxEpoch);
    if (teacher) {
      const theirs = skillsOf(teacher);
      options = options.filter((i) => has(theirs, i));
    }
    if (options.length) {
      const pick = options[w.rng.int(options.length)];
      if (teacher || w.rng.chance(1 / dpow(Math.max(1, SKILLS[pick].epoch), 1.5))) o.learned.mask |= 1 << pick;
    } else if (lineCarriers >= EXTRA_MIN && available(mine, false).length === 0 && (!teacher || teacher.learned.extra > o.learned.extra)) {
      o.learned.extra++;
    }
  }

  /** Erlerntes an Kinder: nur von Kulturträgern, mit Verlusten (ohne Schrift). */
  inherit(w: World, parent: Organism): Learned {
    if (!parent.genome.culture) return nothingLearned();
    const written = has(parent.learned.mask, SKILL.schrift);
    const keep = written ? 1 : w.cfg.transmission;
    let mask = 0;
    for (let i = 0; i < 31; i++) if ((parent.learned.mask >> i) & 1 && w.rng.chance(keep)) mask |= 1 << i;
    const extra = written ? parent.learned.extra : Math.floor(parent.learned.extra * keep);
    return { mask, extra };
  }

  /**
   * Messung (alle 10 Schritte): je Linie Träger, Ø Fähigkeiten, Heimat-Kontinent, Epoche
   * (höchste, aus der ≥ 30 % der Träger etwas können; Wechsel nach 3 Messungen in Folge) und Kipppunkt
   * (Träger ≥ 10 % der Population mit Ø ≥ 5 Fähigkeiten, 5 Messungen in Folge).
   */
  measure(w: World): void {
    const groups = new Map<number, Organism[]>();
    for (const o of w.organisms) {
      if (!o.genome.culture) continue;
      const g = groups.get(o.genome.line);
      if (g) g.push(o); else groups.set(o.genome.line, [o]);
    }
    const pop = w.organisms.length || 1;
    const multi = groups.size > 1 || [...this.lines.keys()].some((id) => !groups.has(id));
    for (const [id, members] of groups) {
      let line = this.lines.get(id);
      if (!line) {
        line = { id, founded: w.tick, carriers: 0, skills: 0, epoch: 0, maxEpoch: 0, tippingTick: null, home: -1, epochPending: null, tippingStreak: 0 };
        this.lines.set(id, line);
      }
      line.carriers = members.length;
      let sk = 0;
      const homes = new Map<number, number>();
      for (const o of members) {
        sk += skillCount(o);
        const r = w.terrain.regionAt(o.x, o.y);
        homes.set(r, (homes.get(r) ?? 0) + 1);
      }
      line.skills = sk / members.length;
      line.home = [...homes].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      this.updateEpoch(w, line, members, multi);
      this.detectTipping(w, line, pop, multi);
    }
    // Erloschene Linien
    for (const [id, line] of this.lines) {
      if (groups.has(id)) continue;
      if (line.maxEpoch >= 2) w.addEvent(`📉 Kultur erloschen${this.tag(line, true)}`);
      this.lines.delete(id);
    }
  }

  /** „(Linie 3)“ – nur wenn es mehrere Linien gibt oder gab. */
  private tag(line: CultureLine, multi: boolean): string {
    return multi || this.lines.size > 1 ? ` (Linie ${line.id})` : '';
  }

  private updateEpoch(w: World, line: CultureLine, members: Organism[], multi: boolean): void {
    let e = 0;
    if (members.length >= 3) {
      for (let ep = 1; ep <= EPOCHS.length; ep++) {
        const mask = SKILLS.reduce((m, d, i) => (d.epoch === ep ? m | (1 << i) : m), 0);
        if (members.filter((o) => o.learned.mask & mask).length >= members.length * 0.3) e = ep;
      }
    }
    if (e === line.epoch) { line.epochPending = null; return; }
    line.epochPending = line.epochPending?.e === e ? { e, n: line.epochPending.n + 1 } : { e, n: 1 };
    if (line.epochPending.n < 3) return;
    if (e > line.epoch) {
      // Steinzeit nur einmal melden (für die erste Linie) – sonst meldet jeder kleine Funke seine Steinzeit
      if (e >= 2 ? e > line.maxEpoch : !this.stoneAgeShown) w.addEvent(`${EPOCHS[e - 1].icon} ${EPOCHS[e - 1].name}${e >= 2 ? this.tag(line, multi) : ''}`);
      if (e >= 1) this.stoneAgeShown = true;
    } else if (line.epoch >= 2 && e >= 1) {
      // „erloschen“ meldet erst measure(), wenn wirklich kein Träger mehr lebt
      w.addEvent(`📉 zurück: ${EPOCHS[e - 1].name}${this.tag(line, multi)}`);
    }
    line.maxEpoch = Math.max(line.maxEpoch, e);
    line.epoch = e;
    line.epochPending = null;
  }

  private detectTipping(w: World, line: CultureLine, pop: number, multi: boolean): void {
    if (line.tippingTick !== null) return;
    line.tippingStreak = line.carriers / pop >= TIPPING_SHARE && line.skills >= TIPPING_SKILLS ? line.tippingStreak + 1 : 0;
    if (line.tippingStreak >= 5) {
      line.tippingTick = w.tick;
      if (this.tippingTick === null) this.tippingTick = w.tick;
      w.addEvent(`⚡ Kultur kippt${this.tag(line, multi)}`);
    }
  }
}
