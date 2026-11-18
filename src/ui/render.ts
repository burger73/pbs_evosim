import type { Organism, Sample, SimEvent, World } from '../core/world.ts';

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

export function drawWorld(canvas: HTMLCanvasElement, world: World, selected: Organism | null): void {
  const ctx = canvas.getContext('2d')!;
  const k = fitCanvas(canvas, world.cfg.width);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Futter
  ctx.fillStyle = css('--food');
  const fr = Math.max(1, world.cfg.foodRadius * k);
  for (let i = 0; i < world.foodX.length; i++) {
    ctx.fillRect(world.foodX[i] * k - fr / 2, world.foodY[i] * k - fr / 2, fr, fr);
  }

  // Lebewesen
  const predColor = css('--pred');
  for (const o of world.organisms) {
    const r = world.radius(o) * k;
    const x = o.x * k, y = o.y * k;
    const pred = world.isPredator(o);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${o.genome.hue} 65% ${pred ? 42 : 52}%)`;
    ctx.fill();
    if (pred) {
      ctx.lineWidth = Math.max(1.5, r * 0.25);
      ctx.strokeStyle = predColor;
      ctx.stroke();
    }
    // Blickrichtung
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(o.heading) * r * 1.6, y + Math.sin(o.heading) * r * 1.6);
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
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
    ctx.arc(x, y, world.radius(selected) * k + 4 * k, 0, Math.PI * 2);
    ctx.lineWidth = 2 * k;
    ctx.stroke();
  }
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

  // Ereignisse
  ctx.strokeStyle = css('--muted');
  ctx.fillStyle = css('--muted');
  ctx.font = `${10 * dpr}px system-ui, sans-serif`;
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  for (const e of events) {
    if (e.tick < t0) continue;
    const x = xOf(e.tick);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillText(e.label, x + 3 * dpr, 11 * dpr);
  }
  ctx.setLineDash([]);

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
