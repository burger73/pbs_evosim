// Simulation ohne Oberfläche – zum Abstimmen der Parameter.
// Aufruf: node scripts/headless.ts [ticks] [augenAbTick] [seed]
import { defaultConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';

const ticks = Number(process.argv[2] ?? 6000);
const eyesAt = Number(process.argv[3] ?? 3000);
const cfg = { ...defaultConfig(), seed: Number(process.argv[4] ?? 42) };
const w = new World(cfg);
const t0 = performance.now();
console.log('tick   pop  pred  arten  futter  größe  tempo  sicht  diät');
for (let t = 1; t <= ticks; t++) {
  if (t === eyesAt) { cfg.eyesUnlocked = true; w.addEvent('Augen'); console.log('--- Augen freigeschaltet ---'); }
  w.step();
  if (t % 500 === 0) {
    const s = w.samples[w.samples.length - 1];
    console.log([s.tick, s.population, s.predators, s.species, s.food, s.avgSize.toFixed(2), s.avgSpeed.toFixed(2), s.avgSense.toFixed(2), s.avgDiet.toFixed(2)].map(String).map((x) => x.padStart(5)).join(' '));
  }
}
console.log(`${ticks} Ticks in ${((performance.now() - t0) / 1000).toFixed(1)} s; Ereignisse:`, w.events.map((e) => `${e.tick}:${e.label}`).join(', ') || '–');
