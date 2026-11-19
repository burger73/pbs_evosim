/**
 * Artenzählung: Lebewesen nach Ähnlichkeit gruppieren, Arten über die Zeit wiedererkennen,
 * Spitzenreiter bestimmen, bemerkenswerte Ausgestorbene merken.
 */
import { genomeDistance, type Genome } from './genome.ts';
import { SKILL, SKILLS, has } from './skills.ts';
import { clusterSpecies } from './species.ts';
import { fitness, isPredator, skillCount, skillsOf } from './traits.ts';
import {
  LEADER_MIN_MEMBERS, MAX_CENSUS, MAX_EXTINCT, NOTABLE_MEMBERS,
  type Census, type ExtinctSpecies, type Leader, type SpeciesStat,
} from './types.ts';
import type { World } from './world.ts';

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

export class CensusSystem {
  census: Census[] = [];
  speciesCount = 1;
  leader: Leader | null = null;
  /** Bemerkenswerte ausgestorbene Arten, neueste zuletzt. */
  extinct: ExtinctSpecies[] = [];
  /** Erste Art, in der die Mehrheit Augen hat (das „Licht geht an“). */
  firstEyes: number | null = null;
  /** Erbgut-Stichprobe für die Neubesiedlung nach einem Massenaussterben. */
  refugium: Genome[] = [];

  private challenger: { id: number; streak: number } | null = null;
  private nextSpeciesId = 1;
  private registry: SpeciesRecord[] = [];

  /** Typisches Erbgut einer lebenden Art. */
  speciesRep(id: number): Genome | null {
    return this.registry.find((r) => r.id === id)?.rep ?? null;
  }

  /** Alle lebenden Arten mit ihrem typischen Erbgut (für die Krisenbilanz). */
  reps(): Map<number, Genome> {
    return new Map(this.registry.map((r) => [r.id, r.rep]));
  }

  /** Arten zählen und über die Zeit wiedererkennen (für Messlatte und Krisenbilanz). */
  take(w: World): void {
    const cfg = w.cfg;
    const os = w.organisms.filter((o) => o.alive);
    // Refugium auffrischen, solange es genug Leben gibt (Erbgut, das sich bewährt hat)
    if (os.length >= 60 && w.tick >= 1000) {
      this.refugium = Array.from({ length: 40 }, () => os[w.rng.int(os.length)].genome);
    }
    const clusters = clusterSpecies(os.map((o) => o.genome));
    const sampledTotal = Math.min(os.length, 400) || 1;
    const scale = os.length / sampledTotal;
    const used = new Set<number>();
    const stats: SpeciesStat[] = [];
    for (const c of clusters) {
      let rec: SpeciesRecord | null = null;
      let best = 0.35;
      for (const s of this.registry) {
        if (used.has(s.id)) continue;
        const d = genomeDistance(s.rep, c.representative);
        if (d < best) { best = d; rec = s; }
      }
      if (!rec) {
        rec = { id: this.nextSpeciesId++, hue: c.representative.hue, rep: c.representative, born: w.tick, peakMembers: 0, peakSkills: 0, peakCommon: 0, wasLeader: false };
        this.registry.push(rec);
      }
      rec.rep = c.representative;
      used.add(rec.id);
      let skills = 0, cult = 0, pred = 0, score = 0;
      const judge = cfg.mode === 'schiedsrichter';
      const bitCount = new Array(SKILLS.length).fill(0);
      for (const i of c.indices) {
        skills += skillCount(os[i]);
        if (os[i].genome.culture) cult++;
        if (isPredator(os[i])) pred++;
        if (judge) score += fitness(os[i], cfg.fitness);
        const m = skillsOf(os[i]);
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
    this.updateLeader(w, stats);
    if (this.leader) { const r = this.registry.find((x) => x.id === this.leader!.id); if (r) r.wasLeader = true; }
    if (this.firstEyes === null && !cfg.eyesUnlocked && stats.some((s) => s.members >= 10 && has(s.common, SKILL.augen))) {
      this.firstEyes = w.tick;
      w.addEvent('👁️ erste Art mit Augen');
    }
    // Registry schlank halten: nur Arten, die gerade leben – bemerkenswerte Ausgestorbene merken
    for (const r of this.registry) {
      if (used.has(r.id) || !(r.peakMembers >= NOTABLE_MEMBERS || r.wasLeader)) continue;
      this.extinct.push({
        id: r.id, hue: r.hue, born: r.born, died: w.tick, peakMembers: r.peakMembers, peakSkills: r.peakSkills,
        common: r.peakCommon, wasLeader: r.wasLeader, crisis: w.crisis?.kind ?? null,
      });
    }
    if (this.extinct.length > MAX_EXTINCT) this.extinct.splice(0, this.extinct.length - MAX_EXTINCT);
    this.registry = this.registry.filter((s) => used.has(s.id));
    this.speciesCount = stats.length;
    this.census.push({ tick: w.tick, species: stats });
    if (this.census.length > MAX_CENSUS) this.census.splice(0, this.census.length - MAX_CENSUS);
  }

  /** Spitzenreiter bestimmen – mit Hysterese, damit er nicht bei jeder Zählung flackert. */
  private updateLeader(w: World, stats: SpeciesStat[]): void {
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
      if (this.leader) w.addEvent('🏆 Wechsel');
      this.leader = toLeader(best, w.tick);
      this.challenger = null;
      return;
    }
    this.leader = toLeader(current, this.leader!.since);
    if (best.id !== current.id && best.skills > current.skills * 1.15) {
      this.challenger = this.challenger?.id === best.id ? { id: best.id, streak: this.challenger.streak + 1 } : { id: best.id, streak: 1 };
      if (this.challenger.streak >= 3) {
        this.leader = toLeader(best, w.tick);
        this.challenger = null;
        w.addEvent('🏆 Wechsel');
      }
    } else {
      this.challenger = null;
    }
  }
}
