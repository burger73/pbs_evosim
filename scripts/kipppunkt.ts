// Verlauf rund um den Kipppunkt: Anteil Kulturträger, Ø Intelligenz, Fähigkeiten
import { defaultConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';
const seed = Number(process.argv[2] ?? 7);
const cfg = { ...defaultConfig(), seed };
const w = new World(cfg);
let prevSkills = 0;
for (let t = 1; t <= 9000; t++) {
  if (t === 2000) cfg.eyesUnlocked = true;
  if (t === 4000) cfg.cultureUnlocked = true;
  w.step();
  if (t >= 4000 && t % 100 === 0) {
    const s = w.samples[w.samples.length - 1];
    const total = s.topSkills * s.topShare * s.population + s.otherSkills * (1 - s.topShare) * s.population;
    const growth = prevSkills > 0 ? total / prevSkills : 0;
    prevSkills = total;
    console.log(`${t} anteil=${(s.topShare * 100).toFixed(1).padStart(5)}% intel=${s.avgIntellect.toFixed(3)} fähigk=${s.topSkills.toFixed(1).padStart(6)} gesamt=${total.toFixed(0).padStart(7)} wachstum/100=${growth.toFixed(2)}`);
  }
}
