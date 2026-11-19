/**
 * Kultur: der seltene Kick (Harari), Entdecken, Lernen von Artgenossen, Vergessen (Tasmanien-Effekt,
 * Henrich), Landwirtschaft mit Raubbau, Epochen und Kipppunkt.
 */
import { CRISES, kickRate } from './config.ts';
import { hueDistance } from './genome.ts';
import { EPOCHS, EXTRA_MIN, SKILL, SKILLS, available, epochFor, has, nothingLearned, type Learned } from './skills.ts';
import { kickReady, skillCount, skillsOf } from './traits.ts';
import { TIPPING_SHARE, TIPPING_SKILLS, type Organism, type Sample } from './types.ts';
import type { World } from './world.ts';

export class CultureSystem {
  /** Bodenfruchtbarkeit (Übernutzung durch Landwirtschaft). */
  fertility = 1;
  /** Erreichte Epoche der Kultur (0 = keine). */
  epoch = 0;
  /** Erster Kick (Funke) und Kipppunkt der Kultur. */
  firstSpark: number | null = null;
  tippingTick: number | null = null;

  private carriers = 0;
  /** Ernte-Potenzial aller Bauern im letzten Tick (für die Begrenzung durch das Ackerland). */
  private farmPotential = 0;
  private epochPending: { e: number; n: number } | null = null;
  private maxEpochReached = 0;
  private overuseWarned = false;
  private tippingStreak = 0;
  private lastSparkEvent = -Infinity;

  /**
   * Der Kick (Harari): seltener Glücksfall, nur bei genug genetischen Fähigkeiten (Bedingung b).
   * Kulturträger entdecken, lernen von Artgenossen (Bedingung a wirkt von selbst: ohne
   * Nachbarn kein Lernen) und betreiben Landwirtschaft.
   */
  step(w: World): void {
    const cfg = w.cfg;
    const rng = w.rng;
    const organisms = w.organisms;
    const kp = kickRate(cfg.cultureBoost);
    let carriers = 0;
    let farmers = 0;
    for (const o of organisms) if (o.alive && o.genome.culture) carriers++;
    this.carriers = carriers;
    const maxEpoch = epochFor(carriers);
    // Ackerland begrenzt die Gesamternte: mehr Bauern auf demselben Land bringen nicht mehr
    const landFactor = this.farmPotential > 0 ? Math.min(1, (cfg.landCapacity * this.fertility) / this.farmPotential) : 1;
    for (let idx = 0; idx < organisms.length; idx++) {
      const o = organisms[idx];
      if (!o.alive) continue;

      // Kick
      if (kp > 0 && kickReady(cfg, o) && rng.chance(kp)) {
        o.genome.culture = true;
        if (this.firstSpark === null) this.firstSpark = w.tick;
        if (carriers === 0 && w.tick - this.lastSparkEvent > 300) {
          w.addEvent('Funke');
          this.lastSparkEvent = w.tick;
        }
        carriers++;
      }
      if (!o.genome.culture) continue;
      const n = skillCount(o);

      // Entdecken: je mehr man kann, desto eher (Wissen kombiniert sich); Wissenschaft verdoppelt
      const sci = has(o.learned.mask, SKILL.wissenschaft) ? 2 : 1;
      if (rng.chance(cfg.discoveryRate * (1 + 0.2 * n) * sci)) this.learnSomething(w, o, null, maxEpoch);

      // Vergessen (Tasmanien-Effekt): Fähigkeiten von Epochen, für die die Kulturträger nicht mehr reichen
      for (let b = 0; b < SKILLS.length; b++) {
        if ((o.learned.mask >> b) & 1 && SKILLS[b].epoch > maxEpoch && rng.chance(cfg.forgetRate)) o.learned.mask &= ~(1 << b);
      }
      if (o.learned.extra > 0 && carriers < EXTRA_MIN && rng.chance(cfg.forgetRate * 3)) {
        o.learned.extra -= Math.ceil(o.learned.extra * 0.05);
      }

      // Von Artgenossen lernen
      if (rng.chance(cfg.learnRate)) {
        const range = has(o.learned.mask, SKILL.schrift) ? 180 : 60;
        let teacher = null as Organism | null;
        let seen = 0;
        w.orgGrid.forEachNear(o.x, o.y, range, (qi) => {
          const q = organisms[qi];
          if (q === o || !q.alive || !q.genome.culture || hueDistance(q.genome.hue, o.genome.hue) > 40) return;
          if (skillCount(q) <= n) return;
          seen++;
          if (rng.int(seen) === 0) teacher = q; // zufälliges Vorbild (Reservoir-Auswahl)
        });
        if (teacher) this.learnSomething(w, o, teacher, maxEpoch);
      }

      // Landwirtschaft
      const harvest = w.crisis ? CRISES[w.crisis.kind].food : 1; // Missernten in Krisen
      const machines = has(o.learned.mask, SKILL.maschinen) ? 2 : 1; // Maschinen: doppelte Ernte, doppelter Raubbau
      if (has(o.learned.mask, SKILL.landwirtschaft)) farmers += machines;
      if (has(o.learned.mask, SKILL.landwirtschaft) && rng.chance(cfg.farmRate * harvest * machines * landFactor)) {
        w.food.add(
          (o.x + rng.gauss() * 25 + cfg.width) % cfg.width,
          (o.y + rng.gauss() * 25 + cfg.height) % cfg.height,
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
      w.addEvent('🪓 Raubbau');
    }
  }

  /**
   * Neue Fähigkeit – selbst entdeckt (teacher = null) oder vom Vorbild gelernt.
   * Entdecken wird mit jeder Epoche schwerer; weitere Erfindungen erst nach der Neuzeit mit genug Kulturträgern.
   */
  private learnSomething(w: World, o: Organism, teacher: Organism | null, maxEpoch: number): void {
    const mine = skillsOf(o);
    let options = available(mine, false, maxEpoch);
    if (teacher) {
      const theirs = skillsOf(teacher);
      options = options.filter((i) => has(theirs, i));
    }
    if (options.length) {
      const pick = options[w.rng.int(options.length)];
      if (teacher || w.rng.chance(1 / Math.pow(Math.max(1, SKILLS[pick].epoch), 1.5))) o.learned.mask |= 1 << pick;
    } else if (this.carriers >= EXTRA_MIN && available(mine, false).length === 0 && (!teacher || teacher.learned.extra > o.learned.extra)) {
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

  /** Epoche der Kultur: höchste, aus der mindestens 30 % der Kulturträger etwas können. */
  updateEpoch(w: World): number {
    const carriers = w.organisms.filter((o) => o.genome.culture);
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
      if (e >= 2 || this.maxEpochReached < 1) w.addEvent(`${EPOCHS[e - 1].icon} ${EPOCHS[e - 1].name}`);
    } else if (this.epoch >= 2) {
      w.addEvent(e === 0 ? '📉 Kultur erloschen' : `📉 zurück: ${EPOCHS[e - 1].name}`);
    }
    this.maxEpochReached = Math.max(this.maxEpochReached, e);
    this.epoch = e;
    this.epochPending = null;
    return e;
  }

  /** Kipppunkt: ≥ 10 % Kulturträger mit Ø ≥ 5 Fähigkeiten, 5 Messungen in Folge. */
  detectTipping(w: World, s: Sample): void {
    if (this.tippingTick !== null) return;
    this.tippingStreak = s.cultureShare >= TIPPING_SHARE && s.cultureSkills >= TIPPING_SKILLS ? this.tippingStreak + 1 : 0;
    if (this.tippingStreak >= 5) {
      this.tippingTick = w.tick;
      w.addEvent('⚡ Kultur kippt');
    }
  }
}
