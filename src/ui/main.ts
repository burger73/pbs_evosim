import './style.css';
import { defaultConfig, FITNESS_LABELS, type Fitness, type Mode, type SimConfig } from '../core/config.ts';
import { LIMITS } from '../core/genome.ts';
import { SKILLS, has, skillCount } from '../core/skills.ts';
import { TIPPING_SHARE, TIPPING_SKILLS, World, type Organism } from '../core/world.ts';
import { css, drawChart, drawWorld } from './render.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
if (params.has('embed')) document.body.classList.add('embed');

const worldCanvas = $<HTMLCanvasElement>('world');
const chartPop = $<HTMLCanvasElement>('chartPop');
const chartTraits = $<HTMLCanvasElement>('chartTraits');
const chartSkills = $<HTMLCanvasElement>('chartSkills');
const cultureBtn = $<HTMLButtonElement>('culture');
const statsEl = $('stats');
const selectedEl = $('selected');
const playBtn = $<HTMLButtonElement>('play');
const eyesBtn = $<HTMLButtonElement>('eyes');
const fitnessSel = $<HTMLSelectElement>('fitness');
const seedIn = $<HTMLInputElement>('seed');
const speedIn = $<HTMLInputElement>('speed');
const mutIn = $<HTMLInputElement>('mutation');
const oxyIn = $<HTMLInputElement>('oxygen');

for (const [k, label] of Object.entries(FITNESS_LABELS)) fitnessSel.add(new Option(label, k));

let cfg: SimConfig;
let world: World;
let running = true;
let selected: Organism | null = null;
let frame = 0;

function currentMode(): Mode {
  return (document.querySelector('input[name="mode"]:checked') as HTMLInputElement).value as Mode;
}

function restart(): void {
  cfg = {
    ...defaultConfig(),
    seed: Number(seedIn.value) || 1,
    mode: currentMode(),
    fitness: fitnessSel.value as Fitness,
    mutationRate: Number(mutIn.value),
    oxygen: Number(oxyIn.value),
  };
  world = new World(cfg);
  selected = null;
  selectedEl.hidden = true;
  eyesBtn.disabled = false;
  eyesBtn.textContent = '👁 Augen freischalten';
  cultureBtn.disabled = false;
  cultureBtn.textContent = '🧠 Kultur freischalten';
  document.body.classList.toggle('mode-natur', cfg.mode === 'natur');
  document.body.classList.toggle('mode-schiedsrichter', cfg.mode === 'schiedsrichter');
  if (cfg.mode === 'schiedsrichter') world.addEvent(`Schiedsrichter: ${FITNESS_LABELS[cfg.fitness]}`);
}

/** ?vorlauf=N rechnet N Schritte vor; ?augen=T / ?kultur=T schalten bei Schritt T frei (auch ohne Vorlauf: wartet bis T). */
const eyesAt = params.has('augen') ? Number(params.get('augen')) : -1;
const cultureAt = params.has('kultur') ? Number(params.get('kultur')) : -1;
function scheduled(): void {
  if (world.tick === eyesAt && !cfg.eyesUnlocked) eyesBtn.click();
  if (world.tick === cultureAt && !cfg.cultureUnlocked) cultureBtn.click();
}
function prerun(): void {
  const n = Math.min(50000, Number(params.get('vorlauf') ?? 0));
  for (let i = 0; i < n; i++) {
    scheduled();
    world.step();
  }
}

function updateOutputs(): void {
  $('speedOut').textContent = `${speedIn.value}× pro Bild`;
  $('mutOut').textContent = `${Number(mutIn.value).toFixed(1)}×`;
  $('oxyOut').textContent = `${Number(oxyIn.value).toFixed(1)}×`;
}

// --- Bedienelemente ----------------------------------------------------
document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', restart));
fitnessSel.addEventListener('change', restart);
$('restart').addEventListener('click', restart);
seedIn.addEventListener('change', restart);
playBtn.addEventListener('click', () => {
  running = !running;
  playBtn.textContent = running ? '⏸ Pause' : '▶ Weiter';
});
speedIn.addEventListener('input', updateOutputs);
mutIn.addEventListener('input', () => { cfg.mutationRate = Number(mutIn.value); updateOutputs(); });
mutIn.addEventListener('change', () => world.addEvent(`Mutation ${Number(mutIn.value).toFixed(1)}×`));
oxyIn.addEventListener('input', () => { cfg.oxygen = Number(oxyIn.value); updateOutputs(); });
oxyIn.addEventListener('change', () => world.addEvent(`O₂ ${Number(oxyIn.value).toFixed(1)}×`));
cultureBtn.addEventListener('click', () => {
  cfg.cultureUnlocked = true;
  world.addEvent('Kultur');
  cultureBtn.disabled = true;
  cultureBtn.textContent = '🧠 Kultur ist freigeschaltet';
});
eyesBtn.addEventListener('click', () => {
  cfg.eyesUnlocked = true;
  world.addEvent('Augen');
  eyesBtn.disabled = true;
  eyesBtn.textContent = '👁 Augen sind freigeschaltet';
});

worldCanvas.addEventListener('click', (ev) => {
  const rect = worldCanvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * cfg.width;
  const y = ((ev.clientY - rect.top) / rect.height) * cfg.height;
  let best: Organism | null = null;
  let bestD = 30 * 30;
  for (const o of world.organisms) {
    const d = (o.x - x) ** 2 + (o.y - y) ** 2;
    if (d < bestD) { bestD = d; best = o; }
  }
  selected = best;
  renderSelected();
});

// --- Anzeige -----------------------------------------------------------
const bar = (v: number, [lo, hi]: readonly [number, number]) => {
  const n = Math.round(((v - lo) / (hi - lo)) * 10);
  return '▮'.repeat(n) + '▯'.repeat(10 - n);
};

function renderSelected(): void {
  if (!selected) { selectedEl.hidden = true; return; }
  const o = selected;
  const g = o.genome;
  selectedEl.hidden = false;
  selectedEl.innerHTML = `
    <h3><span class="swatch" style="background:hsl(${g.hue} 65% 52%)"></span>
      Lebewesen #${o.id} ${o.alive ? '' : '† (gestorben)'}</h3>
    <dl>
      <dt>Rolle</dt><dd>${world.isPredator(o) ? 'Räuber' : 'Pflanzenfresser'}</dd>
      <dt>Größe</dt><dd>${bar(g.size, LIMITS.size)} ${g.size.toFixed(2)}</dd>
      <dt>Tempo</dt><dd>${bar(g.speed, LIMITS.speed)} ${g.speed.toFixed(2)}</dd>
      <dt>Sicht</dt><dd>${bar(g.sense, LIMITS.sense)} ${g.sense.toFixed(2)}</dd>
      <dt>Ernährung</dt><dd>${bar(g.diet, LIMITS.diet)} ${(g.diet * 100).toFixed(0)} % Räuber</dd>
      <dt>Intelligenz</dt><dd>${bar(g.intellect, LIMITS.intellect)} ${g.intellect.toFixed(2)}${world.isCultural(o) ? ' · Kulturträger' : ''}</dd>
      <dt>Fähigkeiten</dt><dd>${skillCount(o.skills)}${o.skills.extra ? ` (davon ${o.skills.extra} weitere Erfindungen)` : ''}</dd>
      <dt>Energie</dt><dd>${o.energy.toFixed(0)}</dd>
      <dt>Alter</dt><dd>${o.age}</dd>
      <dt>Vorfahren</dt><dd>${o.lineage} Generationen bis zur Urform</dd>
    </dl>
    <div class="skills" title="${SKILLS.filter((_, i) => has(o.skills, i)).map((d) => `${d.label}: ${d.effect}`).join('\n')}">${SKILLS.filter((_, i) => has(o.skills, i)).map((d) => d.icon).join(' ')}</div>`;
}

function renderStats(): void {
  const s = world.samples[world.samples.length - 1];
  const parts = [
    `Zeit <b>${world.tick}</b>`,
    `Population <b>${world.organisms.length}</b>`,
    `Räuber <b>${s?.predators ?? 0}</b>`,
    `Arten <b>${world.speciesCount}</b>`,
  ];
  if (cfg.cultureUnlocked) {
    parts.push(`Kulturträger <b>${Math.round((s?.topShare ?? 0) * 100)} %</b>`, `Rekord <b>${s?.maxSkills ?? 0}</b> Fähigkeiten`);
    if (world.tippingTick !== null) {
      parts.push(`<b class="tipped">⚡ Kipppunkt bei ${world.tippingTick}</b> (${world.tippingTick - (world.cultureSince ?? 0)} nach Kultur)`);
    } else {
      // Frühwarnung: wie nah sind Anteil und Wissen der Kulturträger an der Schwelle?
      const share = Math.min(1, (s?.topShare ?? 0) / TIPPING_SHARE);
      const know = Math.min(1, (s?.topSkills ?? 0) / TIPPING_SKILLS);
      parts.push(`Inkubation · Anteil <b>${Math.round(share * 100)} %</b> · Wissen <b>${Math.round(know * 100)} %</b> der Schwelle`);
    }
  }
  if (cfg.mode === 'schiedsrichter') parts.push(`Generation <b>${world.generation}</b>`);
  statsEl.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
}

function renderCharts(): void {
  const samples = world.samples;
  drawChart(chartPop, samples, [
    { color: css('--pop'), value: (s) => s.population - s.predators },
    { color: css('--pred'), value: (s) => s.predators },
    { color: css('--spec'), value: (s) => s.species, axis: 'right' },
  ], world.events);
  drawChart(chartTraits, samples, [
    { color: css('--size'), value: (s) => (s.avgSize - LIMITS.size[0]) / (LIMITS.size[1] - LIMITS.size[0]) },
    { color: css('--speed'), value: (s) => (s.avgSpeed - LIMITS.speed[0]) / (LIMITS.speed[1] - LIMITS.speed[0]) },
    { color: css('--sense'), value: (s) => s.avgSense },
    { color: css('--diet'), value: (s) => s.avgDiet },
    { color: css('--intel'), value: (s) => s.avgIntellect },
  ], world.events, 1);
  drawChart(chartSkills, samples, [
    { color: css('--cult'), value: (s) => s.topSkills },
    { color: css('--rest'), value: (s) => s.otherSkills },
    { color: css('--share'), value: (s) => s.topShare, axis: 'right' },
  ], world.events);
}

function loop(): void {
  if (running) {
    const n = Number(speedIn.value);
    for (let i = 0; i < n; i++) { scheduled(); world.step(); }
  }
  drawWorld(worldCanvas, world, selected);
  if (frame++ % 10 === 0) {
    renderStats();
    renderCharts();
    if (selected) renderSelected();
  }
  requestAnimationFrame(loop);
}

if (params.has('seed')) seedIn.value = params.get('seed')!;
updateOutputs();
restart();
prerun();
requestAnimationFrame(loop);
