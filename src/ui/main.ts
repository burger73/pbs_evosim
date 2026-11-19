import './style.css';
import { CRISES, defaultConfig, FITNESS_LABELS, type CrisisKind, type Fitness, type Mode, type SimConfig } from '../core/config.ts';
import { LIMITS } from '../core/genome.ts';
import { SKILLS, has } from '../core/skills.ts';
import { TIPPING_SHARE, TIPPING_SKILLS, World, type Organism } from '../core/world.ts';
import { css, drawChart, drawSpeciesChart, drawWorld } from './render.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
if (params.has('embed')) document.body.classList.add('embed');

const worldCanvas = $<HTMLCanvasElement>('world');
const chartPop = $<HTMLCanvasElement>('chartPop');
const chartSpecies = $<HTMLCanvasElement>('chartSpecies');
const chartTraits = $<HTMLCanvasElement>('chartTraits');
const statsEl = $('stats');
const cultureEl = $('cultureStatus');
const reportEl = $('report');
const selectedEl = $('selected');
const playBtn = $<HTMLButtonElement>('play');
const eyesBtn = $<HTMLButtonElement>('eyes');
const fitnessSel = $<HTMLSelectElement>('fitness');
const seedIn = $<HTMLInputElement>('seed');
const speedIn = $<HTMLInputElement>('speed');
const mutIn = $<HTMLInputElement>('mutation');
const oxyIn = $<HTMLInputElement>('oxygen');
const boostIn = $<HTMLInputElement>('boost');
const randomIn = $<HTMLInputElement>('randomCrises');
const zoomIn = $<HTMLInputElement>('zoom');
const leaderEl = $('leader');
const crisisBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-crisis]'));

for (const [k, label] of Object.entries(FITNESS_LABELS)) fitnessSel.add(new Option(label, k));

let cfg: SimConfig;
let world: World;
let running = true;
let selected: Organism | null = null;
let frame = 0;
let shownReports = 0;

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
    cultureBoost: Number(boostIn.value),
    randomCrises: randomIn.checked,
  };
  world = new World(cfg);
  selected = null;
  selectedEl.hidden = true;
  reportEl.hidden = true;
  shownReports = 0;
  eyesBtn.disabled = false;
  eyesBtn.textContent = '👁 Augen freischalten';
  document.body.classList.toggle('mode-natur', cfg.mode === 'natur');
  document.body.classList.toggle('mode-schiedsrichter', cfg.mode === 'schiedsrichter');
  if (cfg.mode === 'schiedsrichter') world.addEvent(`Schiedsrichter: ${FITNESS_LABELS[cfg.fitness]}`);
}

// --- Geplante Ereignisse per URL: ?augen=T ?eiszeit=T ?duerre=T ?vulkan=T ----------
const planned: [number, () => void][] = [];
if (params.has('augen')) planned.push([Number(params.get('augen')), () => { if (!cfg.eyesUnlocked) eyesBtn.click(); }]);
for (const kind of Object.keys(CRISES) as CrisisKind[]) {
  if (params.has(kind)) planned.push([Number(params.get(kind)), () => world.startCrisis(kind)]);
}
function scheduled(): void {
  for (const [t, fn] of planned) if (world.tick === t) fn();
}
function prerun(): void {
  const n = Math.min(50000, Number(params.get('vorlauf') ?? 0));
  for (let i = 0; i < n; i++) { scheduled(); world.step(); }
}

const boostLabel = (v: number) =>
  v === 0 ? 'aus – Kultur unmöglich' : v <= 20 ? 'sehr selten' : v <= 45 ? 'selten' : v <= 65 ? 'mittel' : v <= 85 ? 'häufig' : 'fast sicher';

function updateOutputs(): void {
  $('speedOut').textContent = `${speedIn.value}× pro Bild`;
  $('zoomOut').textContent = `${Number(zoomIn.value).toFixed(2).replace(/\.?0+$/, '')}×`;
  $('mutOut').textContent = `${Number(mutIn.value).toFixed(1)}×`;
  $('oxyOut').textContent = `${Number(oxyIn.value).toFixed(1)}×`;
  $('boostOut').textContent = `${boostIn.value} · ${boostLabel(Number(boostIn.value))}`;
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
zoomIn.addEventListener('input', updateOutputs);
mutIn.addEventListener('input', () => { cfg.mutationRate = Number(mutIn.value); updateOutputs(); });
mutIn.addEventListener('change', () => world.addEvent(`Mutation ${Number(mutIn.value).toFixed(1)}×`));
oxyIn.addEventListener('input', () => { cfg.oxygen = Number(oxyIn.value); updateOutputs(); });
oxyIn.addEventListener('change', () => world.addEvent(`O₂ ${Number(oxyIn.value).toFixed(1)}×`));
boostIn.addEventListener('input', () => { cfg.cultureBoost = Number(boostIn.value); updateOutputs(); });
boostIn.addEventListener('change', () => world.addEvent(`Anschwung ${boostIn.value}`));
randomIn.addEventListener('change', () => { cfg.randomCrises = randomIn.checked; });
eyesBtn.addEventListener('click', () => {
  cfg.eyesUnlocked = true;
  world.addEvent('Augen');
  eyesBtn.disabled = true;
  eyesBtn.textContent = '👁 Augen sind freigeschaltet';
});
for (const b of crisisBtns) b.addEventListener('click', () => world.startCrisis(b.dataset.crisis as CrisisKind));

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
const icons = (mask: number) => SKILLS.filter((_, i) => has(mask, i)).map((d) => `<span title="${d.label}: ${d.effect}">${d.icon}</span>`).join(' ');

function renderSelected(): void {
  if (!selected) { selectedEl.hidden = true; return; }
  const o = selected;
  const g = o.genome;
  const learnedOnly = o.learned.mask & ~g.skills;
  selectedEl.hidden = false;
  selectedEl.innerHTML = `
    <h3><span class="swatch" style="background:hsl(${g.hue} 65% 52%)"></span>
      Lebewesen #${o.id} ${o.alive ? '' : '† (gestorben)'}</h3>
    <dl>
      <dt>Rolle</dt><dd>${g.culture ? '🧠 Kulturträger' : world.isPredator(o) ? 'Räuber' : 'Pflanzenfresser'}</dd>
      <dt>Größe</dt><dd>${bar(g.size, LIMITS.size)} ${g.size.toFixed(2)}</dd>
      <dt>Tempo</dt><dd>${bar(g.speed, LIMITS.speed)} ${g.speed.toFixed(2)}</dd>
      <dt>Sicht</dt><dd>${bar(g.sense, LIMITS.sense)} ${g.sense.toFixed(2)}</dd>
      <dt>Ernährung</dt><dd>${bar(g.diet, LIMITS.diet)} ${(g.diet * 100).toFixed(0)} % Räuber</dd>
      <dt>Vererbt</dt><dd class="skills">${icons(g.skills) || '–'}</dd>
      <dt>Gelernt</dt><dd class="skills">${icons(learnedOnly) || '–'}${o.learned.extra ? ` <small>+ ${o.learned.extra} Erfindungen</small>` : ''}</dd>
      <dt>Energie</dt><dd>${o.energy.toFixed(0)}</dd>
      <dt>Alter</dt><dd>${o.age}</dd>
      <dt>Vorfahren</dt><dd>${o.lineage} Generationen bis zur Urform</dd>
    </dl>`;
}

function renderStats(): void {
  const s = world.samples[world.samples.length - 1];
  const parts = [
    `Zeit <b>${world.tick}</b>`,
    `Population <b>${world.organisms.length}</b>`,
    `wilde Räuber <b>${s.predators}</b>`,
    `Arten <b>${world.speciesCount}</b>`,
    `Ø Fähigkeiten <b>${s.avgSkills < 10 ? s.avgSkills.toFixed(1) : Math.round(s.avgSkills)}</b>`,
  ];
  if (cfg.mode === 'schiedsrichter') parts.push(`Generation <b>${world.generation}</b>`);
  if (world.crisis) {
    const def = CRISES[world.crisis.kind];
    parts.push(`<b class="crisis">${def.icon} ${def.label}: noch ${world.crisis.until - world.tick}</b>`);
  }
  statsEl.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  for (const b of crisisBtns) b.disabled = !!world.crisis;

  if (cfg.mode !== 'natur') { cultureEl.innerHTML = ''; return; }
  const c: string[] = [];
  if (cfg.cultureBoost === 0) c.push('Kultur: <b>aus</b> (Anschwung 0)');
  else if (world.tippingTick !== null) {
    c.push(`<b class="tipped">⚡ Kipppunkt bei ${world.tippingTick}</b>`, `Kulturträger <b>${Math.round(s.cultureShare * 100)} %</b>`, `Rekord <b>${s.maxSkills}</b> Fähigkeiten`);
  } else if (s.cultureShare > 0) {
    c.push(`🔥 Funke! Kulturträger <b>${Math.round(s.cultureShare * 100)} %</b> (Schwelle ${TIPPING_SHARE * 100} %)`, `ihr Wissen <b>${s.cultureSkills.toFixed(1)}</b> (Schwelle ${TIPPING_SKILLS})`);
  } else {
    c.push(`Kultur: noch kein Funke`, `kick-bereit (≥ ${cfg.kickMinSkills} vererbte Fähigkeiten): <b>${s.kickReady}</b>`);
    if (world.firstSpark !== null) c.push('<span class="muted">(frühere Funken verpufft)</span>');
  }
  cultureEl.innerHTML = c.map((p) => `<span>${p}</span>`).join('');
}

function renderLeader(): void {
  const l = world.leader;
  if (!l || cfg.mode !== 'natur') { leaderEl.hidden = true; return; }
  leaderEl.hidden = false;
  const sk = l.skills < 10 ? l.skills.toFixed(1) : String(Math.round(l.skills));
  leaderEl.innerHTML = `🏆 <b>Spitzenreiter</b>
    <span class="swatch" style="background:hsl(${l.hue} 65% 52%)"></span> Art ${l.id}
    · Ø <b>${sk}</b> Fähigkeiten · <b>${l.members}</b> Tiere${l.culture > 0.5 ? ' · 🧠 Kultur' : ''}
    · <span class="skills">${icons(l.common) || '–'}</span>
    · führt seit ${l.since} <span class="muted">(${world.tick - l.since} Schritte)</span>`;
}

function renderReport(): void {
  if (world.crisisReports.length === shownReports) return;
  shownReports = world.crisisReports.length;
  const r = world.crisisReports[shownReports - 1];
  const def = CRISES[r.kind];
  const rows = r.buckets
    .filter((b) => b.before > 0 || b.after > 0)
    .map((b) => {
      const f = b.before ? b.after / b.before : NaN;
      const txt = b.before === 0 ? 'neu' : f === 0 ? 'ausgelöscht' : `×${f < 10 ? f.toFixed(2) : Math.round(f)}`;
      return `<tr><td>${b.label}</td><td>${b.before}</td><td>${b.after}</td><td class="${f >= 1 || b.before === 0 ? 'up' : 'down'}">${txt}</td></tr>`;
    })
    .join('');
  reportEl.hidden = false;
  reportEl.innerHTML = `
    <h3>${def.icon} Bilanz ${def.label} (${r.start}–${r.end})</h3>
    <table><thead><tr><th>Fähigkeiten</th><th>vorher</th><th>nachher</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p>Arten ausgestorben: <b>${r.extinct.count}</b>${r.extinct.count ? ` (Ø ${r.extinct.avgSkills.toFixed(1)} Fähigkeiten)` : ''} ·
       überlebt: <b>${r.survived.count}</b>${r.survived.count ? ` (Ø ${r.survived.avgSkills.toFixed(1)})` : ''}</p>`;
}

function renderCharts(): void {
  const samples = world.samples;
  drawChart(chartPop, samples, [
    { color: css('--pop'), value: (s) => s.population * (1 - s.cultureShare) - s.predators },
    { color: css('--pred'), value: (s) => s.predators },
    { color: css('--cult'), value: (s) => s.population * s.cultureShare },
    { color: css('--spec'), value: (s) => s.species, axis: 'right' },
  ], world.events);
  drawSpeciesChart(chartSpecies, world.census, world.events, world.leader?.id ?? null);
  drawChart(chartTraits, samples, [
    { color: css('--size'), value: (s) => (s.avgSize - LIMITS.size[0]) / (LIMITS.size[1] - LIMITS.size[0]) },
    { color: css('--speed'), value: (s) => (s.avgSpeed - LIMITS.speed[0]) / (LIMITS.speed[1] - LIMITS.speed[0]) },
    { color: css('--sense'), value: (s) => s.avgSense },
    { color: css('--diet'), value: (s) => s.avgDiet },
  ], world.events, 1);
}

function loop(): void {
  if (running) {
    const n = Number(speedIn.value);
    for (let i = 0; i < n; i++) { scheduled(); world.step(); }
  }
  drawWorld(worldCanvas, world, selected, Number(zoomIn.value));
  if (frame++ % 10 === 0) {
    renderStats();
    renderCharts();
    renderReport();
    renderLeader();
    if (selected) renderSelected();
  }
  requestAnimationFrame(loop);
}

if (params.has('seed')) seedIn.value = params.get('seed')!;
if (params.has('anschwung')) boostIn.value = params.get('anschwung')!;
updateOutputs();
restart();
prerun();
requestAnimationFrame(loop);
