// Gibt es nach 10 % Kulturträgern ein Zurück? Läuft bis 1500 Ticks nach dem Kipppunkt.
import { defaultConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';
const seed = Number(process.argv[2]);
const cfg = { ...defaultConfig(), seed };
const w = new World(cfg);
let kipp = -1, minAfter = 1, streak = 0, maxBefore = 0;
for (let t = 1; t <= 14000; t++) {
  if (t === 2000) cfg.eyesUnlocked = true;
  if (t === 4000) cfg.cultureUnlocked = true;
  w.step();
  if (t % 10 || t < 4000) continue;
  const share = w.samples[w.samples.length - 1].topShare;
  if (kipp < 0) {
    maxBefore = Math.max(maxBefore, share);
    streak = share >= 0.1 ? streak + 1 : 0;
    if (streak >= 5) kipp = t;
  } else {
    minAfter = Math.min(minAfter, share);
    if (t - kipp >= 1500) break;
  }
}
const end = w.samples[w.samples.length - 1].topShare;
const wk = w.tippingTick;
console.log(`seed ${String(seed).padStart(5)}: kipppunkt ${kipp < 0 ? 'keiner' : `t=${kipp} (+${kipp - 4000})`}  min danach ${(minAfter * 100).toFixed(0)} %  ende ${(end * 100).toFixed(0)} %  | eingebaute Erkennung: ${wk === null ? 'keine' : `t=${wk}`}`);
