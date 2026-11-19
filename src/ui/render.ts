import { CRISES, type SimConfig } from '../core/config.ts';
import type { Census, Sample, SimEvent } from '../core/types.ts';
import { F_CULTURE, F_PICKED, F_PRED, F_SICK, ORG_STRIDE, O_FLAGS, O_GSKILLS, O_HUE, O_R, O_X, O_Y, type Snapshot } from '../sim/protocol.ts';

export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Canvas an die angezeigte Größe und Pixeldichte anpassen. Liefert den Maßstab Welt → Pixel. */
export function fitCanvas(canvas: HTMLCanvasElement, worldW?: number): number {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return worldW ? w / worldW : dpr;
}

/** Gelände einmal vorzeichnen (eine Zelle = ein Pixel, beim Zeichnen weich hochskaliert). */
let terrainImg: HTMLCanvasElement | null = null;
let terrainKey = '';
export function setTerrain(t: Snapshot['terrain']): void {
  if (!t) { terrainImg = null; return; }
  const water = parseColor(css('--water')), mountain = parseColor(css('--mountain'));
  const c = document.createElement('canvas');
  c.width = t.cols; c.height = t.rows;
  const g = c.getContext('2d')!;
  const img = g.createImageData(t.cols, t.rows);
  for (let i = 0; i < t.types.length; i++) {
    const col = t.types[i] === 1 ? water : t.types[i] === 2 ? mountain : null;
    if (!col) continue;
    img.data.set([col[0], col[1], col[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  terrainImg = c;
  terrainKey = `${t.cols}x${t.rows}:${t.cell}`;
}
export const terrainId = () => terrainKey;

function parseColor(s: string): [number, number, number] {
  const m = s.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Welt zeichnen – aus der Momentaufnahme des Workers. highlight: eine Art ist ausgewählt (andere blass). */
export function drawWorld(canvas: HTMLCanvasElement, cfg: SimConfig, snap: Snapshot, zoom = 1, highlight = false): void {
  const ctx = canvas.getContext('2d')!;
  const k = fitCanvas(canvas, cfg.width);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (terrainImg) {
    ctx.imageSmoothingEnabled = true;
    // Zellen ragen am Rand ggf. über die Welt hinaus (aufgerundet) – passend skalieren
    const cell = cfg.terrainCell * k;
    ctx.drawImage(terrainImg, 0, 0, terrainImg.width * cell, terrainImg.height * cell);
  }

  if (snap.crisis) {
    ctx.fillStyle = CRISES[snap.crisis.kind].tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Futter: Oberfläche grün, vergraben braun
  const fr = Math.max(1, cfg.foodRadius * k);
  const surface = css('--food'), buried = css('--buried');
  const food = snap.food;
  for (let i = 0; i < food.length; i += 3) {
    ctx.fillStyle = food[i + 2] ? buried : surface;
    ctx.fillRect(food[i] * k - fr / 2, food[i + 1] * k - fr / 2, fr, fr);
  }

  // Lebewesen
  const predColor = css('--pred');
  const cultColor = css('--cult');
  const sickColor = css('--sick');
  const orgs = snap.orgs;
  let anyPicked = false;
  if (highlight) for (let i = O_FLAGS; i < orgs.length; i += ORG_STRIDE) if (orgs[i] & F_PICKED) { anyPicked = true; break; }
  for (let i = 0; i < orgs.length; i += ORG_STRIDE) {
    const flags = orgs[i + O_FLAGS];
    ctx.globalAlpha = anyPicked && !(flags & F_PICKED) ? 0.15 : 1;
    const r = orgs[i + O_R] * k * zoom;
    const x = orgs[i + O_X] * k, y = orgs[i + O_Y] * k;
    const pred = (flags & F_PRED) !== 0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${orgs[i + O_HUE]} 65% ${pred ? 42 : 52}%)`;
    ctx.fill();
    if (pred) {
      ctx.lineWidth = Math.max(1.5, r * 0.25);
      ctx.strokeStyle = predColor;
      ctx.stroke();
    }
    // Genetische Fähigkeiten: heller Punkt in der Mitte, größer je mehr
    const g = orgs[i + O_GSKILLS];
    if (g > 0) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, r * (0.2 + 0.1 * g)), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
    // Kranke: grünlicher Rand
    if (flags & F_SICK) {
      ctx.beginPath();
      ctx.arc(x, y, r + 1 * k, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, 1.5 * k);
      ctx.strokeStyle = sickColor;
      ctx.stroke();
    }
    // Kulturträger: goldener Ring
    if (flags & F_CULTURE) {
      ctx.beginPath();
      ctx.arc(x, y, r + 2 * k, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, 2 * k);
      ctx.strokeStyle = cultColor;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  const sel = snap.selected;
  if (sel && sel.alive) {
    const x = sel.x * k, y = sel.y * k;
    ctx.setLineDash([4 * k, 4 * k]);
    ctx.lineWidth = Math.max(1, k);
    ctx.strokeStyle = css('--accent');
    ctx.beginPath();
    ctx.arc(x, y, sel.senseR * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, sel.r * k + 5 * k, 0, Math.PI * 2);
    ctx.lineWidth = 2 * k;
    ctx.stroke();
  }
}

const FONT = (px: number, dpr: number) => `${px * dpr}px system-ui, sans-serif`;
/** Platz unten für die Zeitachse. */
const AXIS_H = 16;

/** „Runde“ Schrittweite, sodass etwa `target` Striche auf `range` passen (1, 2, 5, 10, 20, 50 …). */
function niceStep(range: number, target: number): number {
  const raw = Math.max(range / target, 1e-9);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/** Zeitachse (Schritte) am unteren Rand. */
function drawTimeAxis(ctx: CanvasRenderingContext2D, t0: number, t1: number, xOf: (t: number) => number, W: number, H: number, dpr: number): void {
  const step = niceStep(t1 - t0, Math.max(2, W / (90 * dpr)));
  ctx.font = FONT(11, dpr);
  ctx.fillStyle = css('--muted');
  ctx.strokeStyle = css('--border');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - AXIS_H * dpr + 0.5); ctx.lineTo(W, H - AXIS_H * dpr + 0.5); ctx.stroke();
  ctx.textAlign = 'center';
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = xOf(t);
    ctx.beginPath(); ctx.moveTo(x, H - AXIS_H * dpr); ctx.lineTo(x, H - (AXIS_H - 4) * dpr); ctx.stroke();
    if (x > 20 * dpr && x < W - 20 * dpr) ctx.fillText(String(t), x, H - 3 * dpr);
  }
  ctx.textAlign = 'left';
}

/** Waagrechte Hilfslinien mit Beschriftung links (oder rechts). */
function drawValueGrid(ctx: CanvasRenderingContext2D, max: number, yOf: (v: number) => number, x0: number, x1: number, dpr: number, fmt: (v: number) => string, side: 'left' | 'right' = 'left', color?: string): void {
  const step = niceStep(max, 3);
  ctx.font = FONT(11, dpr);
  ctx.lineWidth = 1;
  for (let v = 0; v <= max; v += step) {
    const y = yOf(v);
    if (side === 'left') {
      ctx.strokeStyle = css('--border');
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    ctx.fillStyle = color ?? css('--muted');
    ctx.textAlign = side === 'left' ? 'right' : 'left';
    if (v > 0) ctx.fillText(fmt(v), side === 'left' ? x0 - 4 * dpr : x1 + 4 * dpr, y + 4 * dpr);
  }
  ctx.textAlign = 'left';
}

function drawEvents(ctx: CanvasRenderingContext2D, events: readonly SimEvent[], t0: number, xOf: (t: number) => number, H: number, dpr: number): void {
  ctx.strokeStyle = css('--muted');
  ctx.fillStyle = css('--muted');
  ctx.font = FONT(11, dpr);
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  let lastX = -Infinity, row = 0;
  for (const e of events) {
    if (e.tick < t0) continue;
    const x = xOf(e.tick);
    // Kleine Ereignisse (Spitzenreiter-Wechsel, Treibgut, Funke) nur als kurzer Strich unten
    if (e.label.startsWith('🏆') || e.label.startsWith('🌊') || e.label === 'Funke') {
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x, H - 6 * dpr); ctx.stroke();
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      continue;
    }
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    row = x - lastX < 110 * dpr ? (row + 1) % 4 : 0; // Beschriftungen nicht übereinander
    const w = ctx.measureText(e.label).width;
    const W = ctx.canvas.width;
    ctx.fillText(e.label, x + 3 * dpr + w > W ? x - 3 * dpr - w : x + 3 * dpr, (12 + row * 13) * dpr); // am rechten Rand links vom Strich
    lastX = x;
  }
  ctx.setLineDash([]);
}

export interface Series {
  color: string;
  value: (s: Sample) => number;
  /** Eigene Skala (z. B. Arten neben Population). */
  axis?: 'left' | 'right';
}

export function drawChart(canvas: HTMLCanvasElement, samples: readonly Sample[], series: Series[], events: readonly SimEvent[], fixedMax?: number): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = fitCanvas(canvas);
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (samples.length < 2) return;
  const pad = 4 * dpr, padL = 40 * dpr;
  const hasRight = series.some((s) => s.axis === 'right');
  const padR = hasRight ? 32 * dpr : pad;
  const bottom = H - AXIS_H * dpr;
  const t0 = samples[0].tick, t1 = samples[samples.length - 1].tick;
  const xOf = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);

  const maxFor = (axis: 'left' | 'right') => {
    if (fixedMax) return fixedMax;
    let m = 1;
    for (const s of series) if ((s.axis ?? 'left') === axis) for (const p of samples) m = Math.max(m, s.value(p));
    return m * 1.1;
  };
  const max = { left: maxFor('left'), right: maxFor('right') };

  // Krisenphasen hinterlegen
  for (let i = 0; i < samples.length; i++) {
    const c = samples[i].crisis;
    if (!c) continue;
    ctx.fillStyle = CRISES[c].tint;
    const x = xOf(samples[i].tick);
    const next = i + 1 < samples.length ? xOf(samples[i + 1].tick) : x + 1;
    ctx.fillRect(x, 0, Math.max(1, next - x), bottom);
  }
  const yOf = (v: number, m: number) => bottom - pad - (v / m) * (bottom - 2 * pad);
  if (fixedMax) drawValueGrid(ctx, fixedMax, (v) => yOf(v, fixedMax), padL, W - padR, dpr, (v) => `${Math.round((v / fixedMax) * 100)} %`);
  else drawValueGrid(ctx, max.left, (v) => yOf(v, max.left), padL, W - padR, dpr, (v) => String(Math.round(v)));
  const right = series.find((s) => s.axis === 'right');
  if (right) drawValueGrid(ctx, max.right, (v) => yOf(v, max.right), padL, W - padR, dpr, (v) => String(Math.round(v)), 'right', right.color);
  drawTimeAxis(ctx, t0, t1, xOf, W, H, dpr);
  drawEvents(ctx, events, t0, xOf, bottom, dpr);

  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = 'round';
  for (const s of series) {
    const m = max[s.axis ?? 'left'];
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    samples.forEach((p, i) => {
      const x = xOf(p.tick);
      const y = yOf(s.value(p), m);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

/** Messlatte: eine Linie pro Art (Farbe der Art), Fähigkeiten logarithmisch. */
export function drawSpeciesChart(canvas: HTMLCanvasElement, census: readonly Census[], events: readonly SimEvent[], leaderId: number | null, pickedId: number | null = null): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = fitCanvas(canvas);
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (census.length < 2) return;
  const padL = 40 * dpr, pad = 4 * dpr;
  const bottom = H - AXIS_H * dpr;
  const t0 = census[0].tick, t1 = census[census.length - 1].tick;
  const xOf = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - pad);
  let maxV = Math.log10(1 + 10);
  for (const c of census) for (const s of c.species) maxV = Math.max(maxV, Math.log10(1 + s.skills));
  maxV *= 1.08;
  const yOf = (skills: number) => bottom - pad - (Math.log10(1 + skills) / maxV) * (bottom - 2 * pad);

  // Skala 0, 1, 10, 100, …
  ctx.font = FONT(11, dpr);
  ctx.fillStyle = css('--muted');
  ctx.strokeStyle = css('--border');
  ctx.lineWidth = 1;
  for (const v of [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000]) {
    if (Math.log10(1 + v) > maxV) break;
    const y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - pad, y); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(String(v), padL - 4 * dpr, y + 4 * dpr);
    ctx.textAlign = 'left';
  }
  drawTimeAxis(ctx, t0, t1, xOf, W, H, dpr);
  drawEvents(ctx, events, t0, xOf, bottom, dpr);

  // Linien pro Art
  const lines = new Map<number, { hue: number; pts: [number, number][] }>();
  for (const c of census) {
    for (const s of c.species) {
      if (s.members < 5) continue;
      let l = lines.get(s.id);
      if (!l) { l = { hue: s.hue, pts: [] }; lines.set(s.id, l); }
      l.pts.push([xOf(c.tick), yOf(s.skills)]);
    }
  }
  // farbig: Spitzenreiter + die 4 größten Arten der letzten Zählung; alle anderen blass
  const last = census[census.length - 1].species;
  const highlighted = new Set([...last].sort((a, b) => b.members - a.members).slice(0, 4).map((s) => s.id));
  if (leaderId !== null) highlighted.add(leaderId);
  if (pickedId !== null) highlighted.add(pickedId);
  const draw = (id: number, l: { hue: number; pts: [number, number][] }) => {
    if (l.pts.length < 2) return;
    const lead = id === leaderId;
    ctx.strokeStyle = highlighted.has(id) ? `hsl(${l.hue} 65% 45%)` : css('--faint');
    ctx.lineWidth = (lead ? 3.5 : id === pickedId ? 2.8 : highlighted.has(id) ? 2 : 1) * dpr;
    if (id === pickedId) ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.beginPath();
    l.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  for (const [id, l] of lines) if (!highlighted.has(id)) draw(id, l); // blasse zuerst, farbige obendrauf
  for (const [id, l] of lines) if (highlighted.has(id) && id !== leaderId) draw(id, l);
  if (leaderId !== null && lines.has(leaderId)) draw(leaderId, lines.get(leaderId)!);
  if (pickedId !== null && pickedId !== leaderId && lines.has(pickedId)) draw(pickedId, lines.get(pickedId)!);
}
