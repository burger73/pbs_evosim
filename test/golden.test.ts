/**
 * Golden Master: Sicherheitsnetz für Umbauten.
 *
 * Der Simulationskern ist deterministisch – gleicher Seed, gleicher Verlauf, Bit für Bit.
 * Diese Tests lassen feste Szenarien laufen und vergleichen einen Fingerabdruck des
 * Endzustands mit dem gespeicherten Snapshot (test/__snapshots__/golden.test.ts.snap).
 *
 * - Reines Umstrukturieren (Refactoring) darf den Fingerabdruck NICHT ändern.
 * - Ändert sich Verhalten absichtlich (neue Regel, neuer Parameter), wird der Snapshot
 *   bewusst erneuert:  npx vitest run -u test/golden.test.ts  – und im Commit begründet.
 */
import { describe, expect, it } from 'vitest';
import { defaultConfig, type SimConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';

/** FNV-1a über Zahlen (Gleitkommazahlen bitgenau). */
class Hash {
  private h = 0x811c9dc5;
  private readonly f = new Float64Array(1);
  private readonly u = new Uint32Array(this.f.buffer);
  num(x: number): void {
    this.f[0] = x;
    for (const w of this.u) {
      for (let s = 0; s < 32; s += 8) {
        this.h ^= (w >>> s) & 0xff;
        this.h = Math.imul(this.h, 0x01000193);
      }
    }
  }
  str(s: string): void {
    for (let i = 0; i < s.length; i++) this.num(s.charCodeAt(i));
  }
  get value(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}

function fingerprint(w: World) {
  const h = new Hash();
  for (const o of w.organisms) {
    h.num(o.id); h.num(o.x); h.num(o.y); h.num(o.heading); h.num(o.energy); h.num(o.age);
    h.num(o.lineage); h.num(o.alive ? 1 : 0); h.num(o.eaten); h.num(o.travelled); h.num(o.group); h.num(o.infection);
    const g = o.genome;
    h.num(g.size); h.num(g.speed); h.num(g.sense); h.num(g.diet); h.num(g.skills); h.num(g.culture ? 1 : 0); h.num(g.hue);
    for (const b of g.brain) h.num(b);
    h.num(o.learned.mask); h.num(o.learned.extra);
  }
  for (let i = 0; i < w.foodX.length; i++) { h.num(w.foodX[i]); h.num(w.foodY[i]); h.num(w.foodBuried[i] ? 1 : 0); }
  for (const e of w.events) { h.num(e.tick); h.str(e.label); }
  for (const c of w.census) for (const s of c.species) { h.num(c.tick); h.num(s.id); h.num(s.members); h.num(s.skills); h.num(s.common); }
  const last = w.samples[w.samples.length - 1];
  return {
    tick: w.tick,
    population: w.organisms.length,
    food: w.foodX.length,
    species: w.speciesCount,
    avgSkills: Number(last.avgSkills.toFixed(6)),
    cultureShare: Number(last.cultureShare.toFixed(6)),
    leader: w.leader?.id ?? null,
    extinct: w.extinct.length,
    tipping: w.tippingTick,
    events: w.events.length,
    hash: h.value,
  };
}

function run(over: Partial<SimConfig>, ticks: number, actions: Record<number, (w: World) => void> = {}) {
  const w = new World({ ...defaultConfig(), ...over });
  for (let t = 0; t < ticks; t++) {
    actions[w.tick]?.(w);
    w.step();
  }
  return fingerprint(w);
}

describe('Golden Master', () => {
  it('Natur: Kultur, Eiszeit und Seuche (Seed 8)', () => {
    // Seed 8 mit Anschwung 80 kippt bei ~4400 in die Kultur – so laufen Kultur, Epochen und Krisen mit
    expect(run({ seed: 8, cultureBoost: 80 }, 5600, {
      4700: (w) => w.startCrisis('eiszeit'),
      5300: (w) => w.startCrisis('seuche'),
    })).toMatchSnapshot();
  }, 120_000);

  it('Natur: Augen für alle, Dürre und Vulkan (Seed 3)', () => {
    expect(run({ seed: 3, eyesUnlocked: true, mutationRate: 1.5 }, 2500, {
      800: (w) => w.startCrisis('duerre'),
      2000: (w) => w.startCrisis('vulkan'),
    })).toMatchSnapshot();
  }, 120_000);

  it('Schiedsrichter: „Wer am größten ist“', () => {
    expect(run({ seed: 5, mode: 'schiedsrichter', fitness: 'groesse' }, 2000)).toMatchSnapshot();
  }, 60_000);
});
