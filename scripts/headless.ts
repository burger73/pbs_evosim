// Simulation ohne Oberfläche – zum Abstimmen der Parameter.
// Aufruf: node scripts/headless.ts [ticks] [augenAbTick] [kulturAbTick] [seed]
import { defaultConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';

const ticks = Number(process.argv[2] ?? 6000);
const eyesAt = Number(process.argv[3] ?? 3000);
const cultureAt = Number(process.argv[4] ?? -1);
const cfg = { ...defaultConfig(), seed: Number(process.argv[5] ?? 42) };
const w = new World(cfg);
const t0 = performance.now();
const every = Math.max(500, Math.round(ticks / 30 / 500) * 500);
console.log('  tick   pop  pred arten  größe tempo sicht  diät intel | fähigk. kultur / rest  max  anteil');
for (let t = 1; t <= ticks; t++) {
  if (t === eyesAt) { cfg.eyesUnlocked = true; w.addEvent('Augen'); console.log('--- Augen ---'); }
  if (t === cultureAt) { cfg.cultureUnlocked = true; w.addEvent('Kultur'); console.log('--- Kultur ---'); }
  w.step();
  if (t % every === 0) {
    const s = w.samples[w.samples.length - 1];
    const f = (x: number, d = 2) => x.toFixed(d).padStart(5);
    console.log(`${String(s.tick).padStart(6)} ${String(s.population).padStart(5)} ${String(s.predators).padStart(5)} ${String(s.species).padStart(5)}  ${f(s.avgSize)} ${f(s.avgSpeed)} ${f(s.avgSense)} ${f(s.avgDiet)} ${f(s.avgIntellect)} | ${f(s.topSkills, 1)} / ${f(s.otherSkills, 1)} ${String(s.maxSkills).padStart(4)}  ${f(s.topShare * 100, 0)} %`);
  }
}
console.log(`${ticks} Ticks in ${((performance.now() - t0) / 1000).toFixed(1)} s; Ereignisse:`, w.events.map((e) => `${e.tick}:${e.label}`).join(', ') || '–');
