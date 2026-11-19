import './style.css';
import { CRISES, defaultConfig, FITNESS_LABELS, type CrisisKind, type Fitness, type Mode, type SimConfig } from '../core/config.ts';
import { LIMITS } from '../core/genome.ts';
import { EPOCHS, SKILLS, has } from '../core/skills.ts';
import {
  LEADER_MIN_MEMBERS, MAX_CENSUS, MAX_SAMPLES, TIPPING_SHARE, TIPPING_SKILLS,
  type Census, type CrisisReport, type ExtinctSpecies, type Sample, type SimEvent, type SpeciesStat,
} from '../core/types.ts';
import type { PlannedAction, Snapshot, ToWorker } from '../sim/protocol.ts';
import { css, drawChart, drawSpeciesChart, drawWorld, setTerrain } from './render.ts';

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
const selectedBody = $('selectedBody');
const playBtn = $<HTMLButtonElement>('play');
const fitnessSel = $<HTMLSelectElement>('fitness');
const seedIn = $<HTMLInputElement>('seed');
const speedIn = $<HTMLInputElement>('speed');
const mutIn = $<HTMLInputElement>('mutation');
const oxyIn = $<HTMLInputElement>('oxygen');
const boostIn = $<HTMLInputElement>('boost');
const randomIn = $<HTMLInputElement>('randomCrises');
const zoomIn = $<HTMLInputElement>('zoom');
const leaderEl = $('leader');
const pauseQuick = $<HTMLButtonElement>('pauseQuick');
const pausedBadge = $('pausedBadge');
const loadingBadge = $('loadingBadge');
const topTable = $<HTMLTableElement>('topTable');
const topHint = $('topHint');
const extinctTable = $<HTMLTableElement>('extinctTable');
const lineTable = $<HTMLTableElement>('lineTable');
const crisisBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-crisis]'));

for (const [k, label] of Object.entries(FITNESS_LABELS)) fitnessSel.add(new Option(label, k));

// Die Simulation läuft in einem Web Worker; hier kommen nur Momentaufnahmen an.
const sim = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => sim.postMessage(m);

let cfg: SimConfig;
/** Letzte Momentaufnahme und die daraus gesammelten Listen (der Worker schickt nur Neues). */
let snap: Snapshot | null = null;
const view = {
  samples: [] as Sample[],
  census: [] as Census[],
  events: [] as SimEvent[],
  extinct: [] as ExtinctSpecies[],
  reports: [] as CrisisReport[],
};
/** Eine run-Anfrage ist unterwegs – erst nach der Antwort die nächste. */
let pending = false;
let firstStart = true;
let running = true;
let frame = 0;
// Gemessenes Tempo (Schritte pro Sekunde)
let rateSteps = 0, rateSince = performance.now(), stepsPerSecond = 0;
let shownReports = 0;
/** In der Tabelle ausgewählte Art (wird in der Welt hervorgehoben). */
let picked: number | null = null;
/** Letzte gezeichnete Artenzählung – Leiste und Tabellen nur bei neuer Zählung neu aufbauen (sonst sterben Tooltips). */
let shownCensus = '';

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
  const prerun = firstStart ? Math.min(50000, Number(params.get('vorlauf') ?? 0)) : 0;
  firstStart = false;
  send({ type: 'init', cfg, planned, prerun });
  pending = true;
  if (prerun > 0) { loadingBadge.textContent = `⏳ Vorlauf: ${prerun} Schritte werden gerechnet …`; loadingBadge.hidden = false; }
  selectedEl.hidden = true;
  reportEl.hidden = true;
  shownReports = 0;
  picked = null;
  shownCensus = '';
  document.body.classList.toggle('mode-natur', cfg.mode === 'natur');
  document.body.classList.toggle('mode-schiedsrichter', cfg.mode === 'schiedsrichter');
}

sim.onmessage = (ev: MessageEvent<Snapshot>) => {
  const s = ev.data;
  if (s.reset) {
    view.samples = []; view.census = []; view.events = []; view.extinct = []; view.reports = [];
    setTerrain(s.terrain);
  }
  view.samples.push(...s.newSamples);
  view.census.push(...s.newCensus);
  view.events.push(...s.newEvents);
  if (view.samples.length > MAX_SAMPLES) view.samples.splice(0, view.samples.length - MAX_SAMPLES);
  if (view.census.length > MAX_CENSUS) view.census.splice(0, view.census.length - MAX_CENSUS);
  if (s.extinct) view.extinct = s.extinct;
  if (s.crisisReports) view.reports = s.crisisReports;
  snap = s;
  pending = false;
  loadingBadge.hidden = true;
  if (!s.reset) rateSteps += s.steps;
  const now = performance.now();
  if (now - rateSince > 1000) {
    stepsPerSecond = (rateSteps * 1000) / (now - rateSince);
    rateSteps = 0;
    rateSince = now;
    updateOutputs();
  }
};

// --- Geplante Ereignisse per URL: ?augen=T ?eiszeit=T ?duerre=T ?vulkan=T ----------
const planned: PlannedAction[] = [];
if (params.has('augen')) planned.push({ tick: Number(params.get('augen')), action: 'augen' });
for (const kind of Object.keys(CRISES) as CrisisKind[]) {
  if (params.has(kind)) planned.push({ tick: Number(params.get(kind)), action: kind });
}

const boostLabel = (v: number) =>
  v === 0 ? 'aus – Kultur unmöglich' : v <= 20 ? 'sehr selten' : v <= 45 ? 'selten' : v <= 65 ? 'mittel' : v <= 85 ? 'häufig' : 'fast sicher';

function updateOutputs(): void {
  $('speedOut').textContent = `${speedIn.value}× pro Bild` + (running && stepsPerSecond > 0 ? ` · ≈ ${Math.round(stepsPerSecond)} Schritte/s` : '');
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
function setRunning(on: boolean): void {
  running = on;
  playBtn.textContent = running ? '⏸ Pause' : '▶ Weiter';
  pauseQuick.textContent = running ? '⏸' : '▶';
  pauseQuick.classList.toggle('paused', !running);
  pausedBadge.hidden = running;
  updateOutputs();
}
playBtn.addEventListener('click', () => setRunning(!running));
pauseQuick.addEventListener('click', () => setRunning(!running));
document.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space' || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return;
  const t = ev.target as HTMLElement;
  if (t.closest('input, select, textarea, button')) return; // Leertaste dort nicht abfangen
  ev.preventDefault();
  setRunning(!running);
});
speedIn.addEventListener('input', updateOutputs);
zoomIn.addEventListener('input', updateOutputs);
/** Regler: beim Ziehen nur den Wert setzen, beim Loslassen zusätzlich ein Ereignis im Verlauf. */
function slider(el: HTMLInputElement, apply: (v: number) => Partial<SimConfig>, label: (v: number) => string): void {
  el.addEventListener('input', () => { const p = apply(Number(el.value)); Object.assign(cfg, p); send({ type: 'set', patch: p }); updateOutputs(); });
  el.addEventListener('change', () => send({ type: 'set', patch: apply(Number(el.value)), event: label(Number(el.value)) }));
}
slider(mutIn, (v) => ({ mutationRate: v }), (v) => `Mutation ${v.toFixed(1)}×`);
slider(oxyIn, (v) => ({ oxygen: v }), (v) => `O₂ ${v.toFixed(1)}×`);
slider(boostIn, (v) => ({ cultureBoost: v }), (v) => `Anschwung ${v}`);
randomIn.addEventListener('change', () => { cfg.randomCrises = randomIn.checked; send({ type: 'set', patch: { randomCrises: randomIn.checked } }); });
for (const b of crisisBtns) b.addEventListener('click', () => send({ type: 'crisis', kind: b.dataset.crisis as CrisisKind }));

let lastPointer = 'mouse';
worldCanvas.addEventListener('pointerdown', (ev) => { lastPointer = ev.pointerType; });
worldCanvas.addEventListener('click', (ev) => {
  const rect = worldCanvas.getBoundingClientRect();
  const scale = cfg.width / rect.width; // Welteinheiten pro Bildschirm-Pixel
  const x = (ev.clientX - rect.left) * scale;
  const y = (ev.clientY - rect.top) * scale;
  // Treffer-Radius in Bildschirm-Pixeln: fingerbreit bei Berührung, kleiner mit der Maus
  const r = Math.max(12, (lastPointer === 'touch' ? 26 : 14) * scale);
  send({ type: 'select', x, y, r });
  if (!running) send({ type: 'run', steps: 0 }); // auch angehalten sofort anzeigen
});

// --- Anzeige -----------------------------------------------------------
const bar = (v: number, [lo, hi]: readonly [number, number]) => {
  const n = Math.round(((v - lo) / (hi - lo)) * 10);
  return '▮'.repeat(n) + '▯'.repeat(10 - n);
};
/** Tabellen immer auf 10 Zeilen auffüllen, damit darunter nichts springt. */
const padRows = (rows: string[], cols: number, emptyText: string) => {
  const out = [...rows];
  for (let i = out.length; i < 10; i++) out.push(`<tr class="filler"><td colspan="${cols}" class="${i === 0 ? 'empty' : ''}">${i === 0 ? emptyText : '&nbsp;'}</td></tr>`);
  return out.join('');
};
/** Kontinente heißen A, B, C, D (−1 = auf dem Wasser / unbekannt). */
const continentName = (r: number) => (r >= 0 ? String.fromCharCode(65 + r) : '–');
/**
 * „Art“ oder „Volk“: Gruppen ähnlicher Lebewesen heißen Art; hat die Mehrheit Kultur, ist es ein Volk
 * (eine Kulturlinie zerfällt durch äußerliche Drift in mehrere Völker – das sind keine Menschenarten).
 */
const isVolk = (culture: number | boolean) => (typeof culture === 'boolean' ? culture : culture > 0.5);
const groupName = (id: number, culture: number | boolean) => `${isVolk(culture) ? 'Volk' : 'Art'} ${id}`;
const fmtSkills = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const swatch = (hue: number) => `<span class="swatch" style="background:hsl(${hue} 65% 52%)"></span>`;
const icons = (mask: number) => SKILLS.filter((_, i) => has(mask, i)).map((d) => `<span title="${d.label}: ${d.effect}">${d.icon}</span>`).join(' ');

function renderSelected(): void {
  const o = snap?.selected;
  if (!o) { selectedEl.hidden = true; return; }
  selectedEl.hidden = false;
  selectedBody.innerHTML = `
    <h3><span class="swatch" style="background:hsl(${o.hue} 65% 52%)"></span>
      Lebewesen #${o.id} ${o.alive ? '' : '† (gestorben)'}</h3>
    <dl>
      <dt>Rolle</dt><dd>${o.role === 'kultur' ? '🧠 Kulturträger' : o.role === 'raeuber' ? 'Räuber' : 'Pflanzenfresser'}</dd>
      <dt>Größe</dt><dd>${bar(o.size, LIMITS.size)} ${o.size.toFixed(2)}</dd>
      <dt>Tempo</dt><dd>${bar(o.speed, LIMITS.speed)} ${o.speed.toFixed(2)}</dd>
      <dt>Sicht</dt><dd>${bar(o.sense, LIMITS.sense)} ${o.sense.toFixed(2)}</dd>
      <dt>Ernährung</dt><dd>${bar(o.diet, LIMITS.diet)} ${(o.diet * 100).toFixed(0)} % Räuber</dd>
      <dt>Vererbt</dt><dd class="skills">${icons(o.skills) || '–'}</dd>
      <dt>Gelernt</dt><dd class="skills">${icons(o.learnedOnly) || '–'}${o.extra ? ` <small>+ ${o.extra} Erfindungen</small>` : ''}</dd>
      <dt>Energie</dt><dd>${o.energy.toFixed(0)}</dd>
      <dt>Alter</dt><dd>${o.age}</dd>
      <dt>Vorfahren</dt><dd>${o.lineage} Generationen bis zur Urform</dd>
    </dl>`;
}

function renderStats(): void {
  const w = snap!;
  const s = view.samples[view.samples.length - 1];
  if (!s) return;
  const parts = [
    `Zeit <b>${w.tick}</b>`,
    `Population <b>${w.population}</b>`,
    `wilde Räuber <b>${s.predators}</b>`,
    ...groupCounts(),
    `Ø Fähigkeiten <b>${s.avgSkills < 10 ? s.avgSkills.toFixed(1) : Math.round(s.avgSkills)}</b>`,
  ];
  if (s.fertility < 0.99) parts.push(`Boden${cfg.terrain ? ' ' + continentName(s.fertilityRegion) : ''} <b class="${s.fertility < 0.5 ? 'crisis' : ''}">${Math.round(s.fertility * 100)} %</b>`);
  if (s.infected > 0) parts.push(`krank <b class="crisis">${Math.round(s.infected * 100)} %</b>`);
  if (cfg.mode === 'schiedsrichter') parts.push(`Generation <b>${w.generation}</b>`);
  if (w.crisis) {
    const def = CRISES[w.crisis.kind];
    parts.push(`<b class="crisis">${def.icon} ${def.label}: noch ${w.crisis.until - w.tick}</b>`);
  }
  statsEl.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  for (const b of crisisBtns) b.disabled = !!w.crisis;

  if (cfg.mode !== 'natur') { cultureEl.innerHTML = ''; return; }
  const c: string[] = [];
  if (cfg.cultureBoost === 0) c.push('Kultur: <b>aus</b> (Anschwung 0)');
  else if (w.tippingTick !== null) {
    const lead = w.lines[0];
    const ep = lead && lead.epoch > 0 ? EPOCHS[lead.epoch - 1] : null;
    c.push(`<b class="tipped">⚡ Kultur-Kipppunkt bei ${w.tippingTick}</b>`,
      ep ? `führende Kultur: <b>Linie ${lead.id} ${ep.icon} ${ep.name}</b>${w.lines.length > 1 ? ` · ${w.lines.length - 1} weitere` : ''}` : 'Kultur erloschen',
      `Kulturträger <b>${Math.round(s.population * s.cultureShare)}</b>`, `Rekord <b>${s.maxSkills}</b> Fähigkeiten`);
  } else if (s.cultureShare > 0) {
    c.push(`🔥 Funke! Kulturträger <b>${Math.round(s.cultureShare * 100)} %</b> (Schwelle ${TIPPING_SHARE * 100} %)`, `ihr Wissen <b>${s.cultureSkills.toFixed(1)}</b> (Schwelle ${TIPPING_SKILLS})`);
  } else {
    c.push(`Kultur: noch kein Funke`, `kick-bereit (≥ ${cfg.kickMinSkills} vererbte Fähigkeiten): <b>${s.kickReady}</b>`);
    if (w.firstSpark !== null) c.push('<span class="muted">(frühere Funken verpufft)</span>');
  }
  cultureEl.innerHTML = c.map((p) => `<span>${p}</span>`).join('');
}

function renderLeader(): void {
  const l = snap!.leader;
  leaderEl.hidden = cfg.mode !== 'natur';
  if (!l) { leaderEl.innerHTML = '🏆 <span class="muted">noch kein Spitzenreiter – zählt ab 10 Individuen und Ø 1 Fähigkeit</span>'; return; }
  leaderEl.innerHTML = `🏆 <b>Spitzenreiter</b>
    ${swatch(l.hue)}${groupName(l.id, l.culture)}
    · Ø <b>${fmtSkills(l.skills)}</b> Fähigkeiten · <b>${l.members}</b> Individuen${l.culture > 0.5 ? ' · 🧠 Kultur' : ''}
    · <span class="skills">${icons(l.common) || '–'}</span>
    · führt seit ${l.since} <span class="muted">(${snap!.tick - l.since} Schritte)</span>`;
}

/** Top 10 lebende Arten: Natur → nach Ø Fähigkeiten, Schiedsrichter → nach dem gewählten Kriterium. */
function renderTop(): void {
  const census = view.census[view.census.length - 1];
  const judge = cfg.mode === 'schiedsrichter';
  const key = (s: SpeciesStat) => (judge ? s.score : s.skills);
  const all = census?.species ?? [];
  const big = all.filter((s) => s.members >= LEADER_MIN_MEMBERS);
  const list = [...(big.length ? big : all)].sort((a, b) => key(b) - key(a) || b.members - a.members).slice(0, 10);
  if (picked !== null && !census?.species.some((s) => s.id === picked)) { picked = null; send({ type: 'pick', id: null }); } // ausgestorben
  topHint.textContent = judge
    ? `Sortiert nach „${FITNESS_LABELS[cfg.fitness]}“ (Ø der Gruppe), nur Gruppen ab ${LEADER_MIN_MEMBERS} Individuen. Klick auf eine Zeile hebt die Gruppe in der Welt hervor.`
    : `Sortiert nach Ø Fähigkeiten (wie der Spitzenreiter), nur Gruppen ab ${LEADER_MIN_MEMBERS} Individuen. Hat die Mehrheit Kultur, heißt die Gruppe „Volk“. Individuen: geschätzte Zahl der Lebewesen. Klick auf eine Zeile hebt die Gruppe in der Welt hervor, nochmal Klick hebt es auf.`;
  const head = `<thead><tr><th>#</th><th>Art / Volk</th><th class="num">Individuen</th>
    ${judge ? '<th class="num">Ø Kriterium</th>' : ''}<th class="num">Ø Fähigk.</th><th>Fähigkeiten (Mehrheit)</th>
    <th>Ernährung</th>${cfg.terrain ? '<th>Kontinent</th>' : ''}${judge ? '' : '<th title="Kulturlinie der Mehrheit · Anteil Kulturträger">Linie</th>'}<th class="num">lebt seit</th></tr></thead>`;
  const rows = list.map((s, i) => `<tr data-id="${s.id}" class="${s.id === picked ? 'picked' : ''}">
    <td>${!judge && s.id === snap!.leader?.id ? '🏆' : i + 1}</td>
    <td>${swatch(s.hue)}${groupName(s.id, s.culture)}</td>
    <td class="num">${s.members}</td>
    ${judge ? `<td class="num">${s.score.toFixed(1)}</td>` : ''}
    <td class="num">${fmtSkills(s.skills)}</td>
    <td class="skills">${icons(s.common) || '–'}</td>
    <td>${s.predator ? '🥩 Räuber' : '🌿 Pflanzen'}</td>
    ${cfg.terrain ? `<td>${continentName(s.home)}</td>` : ''}
    ${judge ? '' : `<td>${s.culture > 0 ? `${s.line} <span class="muted">· ${Math.round(s.culture * 100)} %</span>` : '–'}</td>`}
    <td class="num">${s.born} <span class="muted">(${snap!.tick - s.born})</span></td></tr>`);
  topTable.innerHTML = head + `<tbody>${padRows(rows, 10, 'noch keine Arten gezählt')}</tbody>`;
}

/** „Arten 12 · Völker 17“ (Völker = Gruppen, deren Mehrheit Kultur hat). */
function groupCounts(): string[] {
  const last = view.census[view.census.length - 1];
  if (!last) return [];
  const voelker = last.species.filter((s) => isVolk(s.culture)).length;
  const arten = last.species.length - voelker;
  return voelker ? [`Arten <b>${arten}</b>`, `Völker <b>${voelker}</b>`] : [`Arten <b>${arten}</b>`];
}

/** Kulturlinien: Heimat, Träger, Epoche – „Arm und Reich“ auf einen Blick. Fest 4 Zeilen hoch (springt nicht). */
function renderLines(): void {
  const lines = snap!.lines.slice(0, 6);
  const census = view.census[view.census.length - 1];
  const peoples = (id: number) => census?.species.filter((s) => isVolk(s.culture) && s.line === id).length ?? 0;
  const head = `<thead><tr><th>Linie</th><th>Heimat</th><th class="num">Träger</th><th class="num" title="Gruppen dieser Kultur, die sich äußerlich auseinanderentwickelt haben">Völker</th><th>Epoche</th><th class="num">Ø Fähigk.</th><th class="num">gekippt</th><th class="num">gegründet</th></tr></thead>`;
  const rows = lines.map((l) => {
    const [home, ...more] = l.continents.filter((c) => c.share >= 0.05);
    const where = cfg.terrain ? (home ? continentName(home.region) + (more.length ? ` <span class="muted">+ ${more.map((c) => continentName(c.region)).join(', ')}</span>` : '') : '–') : '–';
    const ep = l.epoch > 0 ? `${EPOCHS[l.epoch - 1].icon} ${EPOCHS[l.epoch - 1].name}` : '<span class="muted">noch keine</span>';
    return `<tr><td>${swatch(l.hue)}Linie ${l.id}</td><td>${where}</td><td class="num">${l.carriers}</td><td class="num">${peoples(l.id) || '–'}</td><td>${ep}</td>
      <td class="num">${fmtSkills(l.skills)}</td><td class="num">${l.tippingTick ?? '–'}</td><td class="num">${l.founded}</td></tr>`;
  });
  const out = [...rows];
  for (let i = out.length; i < 4; i++) out.push(`<tr class="filler"><td colspan="8" class="${i === 0 ? 'empty' : ''}">${i === 0 ? 'noch keine Kultur mit 10 Trägern' : '&nbsp;'}</td></tr>`);
  lineTable.innerHTML = head + `<tbody>${out.join('')}</tbody>`;
}

function renderExtinct(): void {
  const list = view.extinct.slice(-10).reverse();
  const head = `<thead><tr><th>Art / Volk</th><th>lebte</th>${cfg.terrain ? '<th>Kontinent</th>' : ''}<th class="num">Höchststand</th><th class="num">beste Ø Fähigk.</th>
    <th>Fähigkeiten (damals)</th><th>Ende</th></tr></thead>`;
  const rows = list.map((e) => `<tr>
    <td>${swatch(e.hue)}${groupName(e.id, e.culture)}${e.wasLeader ? ' 🏆' : ''}</td>
    <td>${e.born}–${e.died}</td>${cfg.terrain ? `<td>${continentName(e.home)}</td>` : ''}
    <td class="num">${e.peakMembers} Ind.</td>
    <td class="num">${fmtSkills(e.peakSkills)}</td>
    <td class="skills">${icons(e.common) || '–'}</td>
    <td>${e.crisis ? `während ${CRISES[e.crisis].icon} ${CRISES[e.crisis].label}` : '–'}</td></tr>`);
  extinctTable.innerHTML = head + `<tbody>${padRows(rows, 7, 'noch keine bemerkenswerte Art ausgestorben')}</tbody>`;
}

function renderLegend(): void {
  const item = (d: (typeof SKILLS)[number]) => `<div><dt>${d.icon}</dt><dd><b>${d.label}</b> – ${d.effect}</dd></div>`;
  const parts = ['<div class="group">Vererbt – entstehen durch Mutation, kosten laufend Energie</div>', ...SKILLS.filter((d) => d.genetic).map(item)];
  EPOCHS.forEach((ep, i) => {
    parts.push(`<div class="group">Erfunden in Epoche ${i + 1}: ${ep.icon} ${ep.name} – nur durch Kultur, kosten nichts</div>`);
    parts.push(...SKILLS.filter((d) => !d.genetic && d.epoch === i + 1).map(item));
  });
  $('legend').innerHTML = parts.join('');
}

selectedEl.addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement).id !== 'closeSelected') return;
  send({ type: 'deselect' });
  selectedEl.hidden = true;
  if (!running) send({ type: 'run', steps: 0 });
});

topTable.addEventListener('click', (ev) => {
  const tr = (ev.target as HTMLElement).closest('tr[data-id]') as HTMLElement | null;
  if (!tr) return;
  const id = Number(tr.dataset.id);
  picked = picked === id ? null : id;
  send({ type: 'pick', id: picked });
  renderTop();
});

function renderReport(): void {
  if (view.reports.length === shownReports) return;
  shownReports = view.reports.length;
  if (!shownReports) return;
  const r = view.reports[shownReports - 1];
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
  const samples = view.samples;
  drawChart(chartPop, samples, [
    { color: css('--pop'), value: (s) => s.population * (1 - s.cultureShare) - s.predators },
    { color: css('--pred'), value: (s) => s.predators },
    { color: css('--cult'), value: (s) => s.population * s.cultureShare },
    { color: css('--spec'), value: (s) => s.species, axis: 'right' },
  ], view.events);
  drawSpeciesChart(chartSpecies, view.census, view.events, snap!.leader?.id ?? null, picked);
  drawChart(chartTraits, samples, [
    { color: css('--size'), value: (s) => (s.avgSize - LIMITS.size[0]) / (LIMITS.size[1] - LIMITS.size[0]) },
    { color: css('--speed'), value: (s) => (s.avgSpeed - LIMITS.speed[0]) / (LIMITS.speed[1] - LIMITS.speed[0]) },
    { color: css('--sense'), value: (s) => s.avgSense },
    { color: css('--diet'), value: (s) => s.avgDiet },
    { color: css('--soil'), value: (s) => s.fertility },
  ], view.events, 1);
}

function loop(): void {
  // Nächste Rechenrunde anfordern (angehalten: 0 Schritte – nur für Auswahl/Hervorhebung)
  if (!pending) {
    send({ type: 'run', steps: running ? Number(speedIn.value) : 0 });
    pending = true;
  }
  if (!snap) { requestAnimationFrame(loop); return; }
  drawWorld(worldCanvas, cfg, snap, Number(zoomIn.value), picked !== null);
  if (frame++ % 10 === 0) {
    renderStats();
    renderCharts();
    renderReport();
    renderSelected();
    const last = view.census[view.census.length - 1];
    const key = `${view.census.length}:${last?.tick}:${view.extinct.length}`;
    if (key !== shownCensus) {
      shownCensus = key;
      renderLeader();
      renderTop();
      renderLines();
      renderExtinct();
    }
  }
  requestAnimationFrame(loop);
}

if (params.has('seed')) seedIn.value = params.get('seed')!;
if (params.has('anschwung')) boostIn.value = params.get('anschwung')!;
updateOutputs();
renderLegend();
restart();
requestAnimationFrame(loop);
