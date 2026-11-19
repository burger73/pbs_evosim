// Leistungsmessung: Millisekunden pro Simulationsschritt bei voller Population.
// Aufruf: node scripts/leistung.ts [maxPopulation=900] [breite=1200] [höhe=800] [seed=11] [augenFürAlle=1]
// augenFürAlle=1 ist der ungünstigste Fall (alle sehen weit); 0 = Augen nur als Fähigkeit (typischer Verlauf).
// Misst nach einer Aufwärmphase (bis die Population voll ist) 1000 Schritte.
import { defaultConfig } from '../src/core/config.ts';
import { World } from '../src/core/world.ts';

const [maxPop = 900, width = 1200, height = 800, seed = 11, eyesAll = 1] = process.argv.slice(2).map(Number);
const area = (width * height) / (1200 * 800);
const cfg = { ...defaultConfig(), seed, width, height, maxPopulation: maxPop, maxFood: Math.round(1400 * area), foodRate: 3.5 * area, eyesUnlocked: eyesAll === 1 };
const w = new World(cfg);
let warm = 0;
while (w.organisms.length < maxPop * 0.9 && warm < 20000) { w.step(); warm++; }
const n = 1000;
let popSum = 0;
const t0 = performance.now();
for (let i = 0; i < n; i++) { w.step(); popSum += w.organisms.length; }
const ms = (performance.now() - t0) / n;
const pop = Math.round(popSum / n);
console.log(`Welt ${width}×${height}, max ${maxPop}, Augen für alle: ${eyesAll === 1 ? 'ja' : 'nein'}, Ø Population ${pop} (Aufwärmen ${warm} Schritte)`);
console.log(`${ms.toFixed(2)} ms pro Schritt · ${(ms / pop * 1000).toFixed(2)} µs pro Lebewesen · Tempo 4 ≈ ${(ms * 4).toFixed(1)} ms pro Bild (Budget 16,7 ms)`);
