import { CRISES } from '../core/config.ts';
import { GENETIC_MASK, popcount } from '../core/skills.ts';
import type { Census, Organism, Sample, SimEvent, World } from '../core/world.ts';

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

export function drawWorld(canvas: HTMLCanvasElement, world: World, selected: Organism | null, zoom = 1): void {
  const ctx = canvas.getContext('2d')!;
  const k = fitCanvas(canvas, world.cfg.width);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (world.crisis) {
    ctx.fillStyle = CRISES[world.crisis.kind].tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Futter: Oberfläche grün, vergraben braun
  const fr = Math.max(1, world.cfg.foodRadius * k);
  const surface = css('--food'), buried = css('--buried');
  for (let i = 0; i < world.foodX.length; i++) {
    ctx.fillStyle = world.foodBuried[i] ? buried : surface;
    ctx.fillRect(world.foodX[i] * k - fr / 2, world.foodY[i] * k - fr / 2, fr, fr);
  }

  // Lebewesen
  const predColor = css('--pred');
  const cultColor = css('--cult');
  for (const o of world.organisms) {
    const r = world.radius(o) * k * zoom;
    const x = o.x * k, y = o.y * k;
    const pred = world.isPredator(o) && !o.genome.culture;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${o.genome.hue} 65% ${pred ? 42 : 52}%)`;
    ctx.fill();
    if (pred) {
      ctx.lineWidth = Math.max(1.5, r * 0.25);
      ctx.strokeStyle = predColor;
      ctx.stroke();
    }
    // Genetische Fähigkeiten: heller Punkt in der Mitte, größer je mehr
    const g = popcount(o.genome.skills & GENETIC_MASK);
    if (g > 0) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, r * (0.2 + 0.1 * g)), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
    // Kulturträger: goldener Ring
    if (o.genome.culture) {
      ctx.beginPath();
      ctx.arc(x, y, r + 2 * k, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, 2 * k);
      ctx.strokeStyle = cultColor;
      ctx.stroke();
    }
  }

  if (selected && selected.alive) {
    const x = selected.x * k, y = selected.y * k;
    ctx.setLineDash([4 * k, 4 * k]);
    ctx.lineWidth = Math.max(1, k);
    ctx.strokeStyle = css('--accent');
    ctx.beginPath();
    ctx.arc(x, y, world.senseRadius(selected) * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, world.radius(selected) * k + 5 * k, 0, Math.PI * 2);
    ctx.lineWidth = 2 * k;
    ctx.stroke();
  }
}

function drawEvents(ctx: CanvasRenderingContext2D, events: readonly SimEvent[], t0: number, xOf: (t: number) => number, H: number, dpr: number): void {
  ctx.strokeStyle = css('--muted');
  ctx.fillStyle = css('--muted');
  ctx.font = `${10 * dpr}px system-ui, sans-serif`;
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  let lastX = -Infinity, row = 0;
  for (const e of events) {
    if (e.tick < t0) continue;
    const x = xOf(e.tick);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    row = x - lastX < 60 * dpr ? (row + 1) % 3 : 0; // Beschriftungen nicht übereinander
    ctx.fillText(e.label, x + 3 * dpr, (11 + row * 11) * dpr);
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
  const pad = 4 * dpr;
  const t0 = samples[0].tick, t1 = samples[samples.length - 1].tick;
  const xOf = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);

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
    ctx.fillRect(x, 0, Math.max(1, next - x), H);
  }
  drawEvents(ctx, events, t0, xOf, H, dpr);

  ctx.lineWidth = 1.6 * dpr;
  for (const s of series) {
    const m = max[s.axis ?? 'left'];
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    samples.forEach((p, i) => {
      const x = xOf(p.tick);
      const y = H - pad - (s.value(p) / m) * (H - 2 * pad);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

/** Messlatte: eine Linie pro Art (Farbe der Art), Fähigkeiten logarithmisch. */
export function drawSpeciesChart(canvas: HTMLCanvasElement, census: readonly Census[], events: readonly SimEvent[], leaderId: number | null): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = fitCanvas(canvas);
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (census.length < 2) return;
  const padL = 26 * dpr, pad = 4 * dpr;
  const t0 = census[0].tick, t1 = census[census.length - 1].tick;
  const xOf = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - pad);
  let maxV = Math.log10(1 + 10);
  for (const c of census) for (const s of c.species) maxV = Math.max(maxV, Math.log10(1 + s.skills));
  maxV *= 1.08;
  const yOf = (skills: number) => H - pad - (Math.log10(1 + skills) / maxV) * (H - 2 * pad);

  // Skala 0, 1, 10, 100, …
  ctx.font = `${9 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = css('--muted');
  ctx.strokeStyle = css('--border');
  ctx.lineWidth = 1;
  for (const v of [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000]) {
    if (Math.log10(1 + v) > maxV) break;
    const y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - pad, y); ctx.stroke();
    ctx.fillText(String(v), 2 * dpr, y + 3 * dpr);
  }
  drawEvents(ctx, events, t0, xOf, H, dpr);

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
  const draw = (id: number, l: { hue: number; pts: [number, number][] }) => {
    if (l.pts.length < 2) return;
    const lead = id === leaderId;
    ctx.strokeStyle = highlighted.has(id) ? `hsl(${l.hue} 65% 45%)` : css('--faint');
    ctx.lineWidth = (lead ? 3.2 : highlighted.has(id) ? 1.6 : 1) * dpr;
    ctx.beginPath();
    l.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  };
  for (const [id, l] of lines) if (!highlighted.has(id)) draw(id, l); // blasse zuerst, farbige obendrauf
  for (const [id, l] of lines) if (highlighted.has(id) && id !== leaderId) draw(id, l);
  if (leaderId !== null && lines.has(leaderId)) draw(leaderId, lines.get(leaderId)!);
}
