// Simulation ohne Oberfläche – zum Abstimmen der Parameter.
// Aufruf: node scripts/headless.ts [ticks] [seed] [anschwung 0..100] [augenAb] [krise@tick,...]
//   z. B. node scripts/headless.ts 16000 7 50 2000 eiszeit@9000,duerre@13000
import { defaultConfig, type CrisisKind } from '../src/core/config.ts';
import { SKILLS } from '../src/core/skills.ts';
import { World } from '../src/core/world.ts';

const ticks = Number(process.argv[2] ?? 12000);
const cfg = { ...defaultConfig(), seed: Number(process.argv[3] ?? 42), cultureBoost: Number(process.argv[4] ?? 50) };
const eyesAt = Number(process.argv[5] ?? 2000);
const crises = new Map((process.argv[6] ?? '').split(',').filter(Boolean).map((s) => { const [k, t] = s.split('@'); return [Number(t), k as CrisisKind]; }));
const w = new World(cfg);
const t0 = performance.now();
const every = Math.max(500, Math.round(ticks / 25 / 500) * 500);
console.log('  tick   pop  wild arten  größe tempo  diät | Ø fähigk kickbereit  kultur Ø kult  max | Fähigkeiten-Häufigkeit');
for (let t = 1; t <= ticks; t++) {
  if (t === eyesAt) { cfg.eyesUnlocked = true; w.addEvent('Augen'); }
  const c = crises.get(t); if (c) w.startCrisis(c);
  w.step();
  if (t % every === 0) {
    const s = w.samples[w.samples.length - 1];
    const f = (x: number, d = 2, p = 5) => x.toFixed(d).padStart(p);
    const freq = SKILLS.map((d, i) => { const n = w.organisms.filter((o) => (w.skillsOf(o) >> i) & 1).length; return n ? `${d.icon}${Math.round(100 * n / w.organisms.length)}` : ''; }).filter(Boolean).join(' ');
    console.log(`${String(s.tick).padStart(6)} ${String(s.population).padStart(5)} ${String(s.predators).padStart(5)} ${String(s.species).padStart(5)}  ${f(s.avgSize)} ${f(s.avgSpeed)} ${f(s.avgDiet)} | ${f(s.avgSkills, 2, 7)} ${String(s.kickReady).padStart(8)}   ${f(s.cultureShare * 100, 0)}% ${f(s.cultureSkills, 1, 6)} ${String(s.maxSkills).padStart(4)} | ${freq}${s.crisis ? '  [' + s.crisis + ']' : ''}`);
  }
}
console.log(`${ticks} Ticks in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log('Ereignisse:', w.events.map((e) => `${e.tick}:${e.label}`).join(', ') || '–');
for (const r of w.crisisReports) console.log(`Krise ${r.kind} ${r.start}–${r.end}: ` + r.buckets.map((b) => `${b.label}: ${b.before}→${b.after}`).join(', ') + ` | Arten ausgestorben ${r.extinct.count} (Ø ${r.extinct.avgSkills.toFixed(1)} Fähigk.), überlebt ${r.survived.count} (Ø ${r.survived.avgSkills.toFixed(1)})`);
