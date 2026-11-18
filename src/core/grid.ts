/**
 * Räumliches Raster für schnelle Nachbarschaftssuche auf einer Torus-Welt
 * (wer rechts hinausläuft, kommt links wieder herein).
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly buckets: number[][];

  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number, cellSize: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.max(1, Math.floor(width / cellSize));
    this.rows = Math.max(1, Math.floor(height / cellSize));
    this.cellW = width / this.cols;
    this.cellH = height / this.rows;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const b of this.buckets) b.length = 0;
  }

  private cellOf(x: number, y: number): [number, number] {
    let cx = Math.floor(x / this.cellW) % this.cols;
    let cy = Math.floor(y / this.cellH) % this.rows;
    if (cx < 0) cx += this.cols;
    if (cy < 0) cy += this.rows;
    return [cx, cy];
  }

  insert(id: number, x: number, y: number): void {
    const [cx, cy] = this.cellOf(x, y);
    this.buckets[cy * this.cols + cx].push(id);
  }

  /** Ruft fn für alle Einträge in Zellen auf, die den Kreis (x, y, r) berühren können. */
  forEachNear(x: number, y: number, r: number, fn: (id: number) => void): void {
    const [cx, cy] = this.cellOf(x, y);
    const sx = Math.ceil(r / this.cellW);
    const sy = Math.ceil(r / this.cellH);
    const allX = 2 * sx + 1 >= this.cols;
    const allY = 2 * sy + 1 >= this.rows;
    const x0 = allX ? 0 : cx - sx;
    const x1 = allX ? this.cols - 1 : cx + sx;
    const y0 = allY ? 0 : cy - sy;
    const y1 = allY ? this.rows - 1 : cy + sy;
    for (let gy = y0; gy <= y1; gy++) {
      const ry = ((gy % this.rows) + this.rows) % this.rows;
      for (let gx = x0; gx <= x1; gx++) {
        const rx = ((gx % this.cols) + this.cols) % this.cols;
        const b = this.buckets[ry * this.cols + rx];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}

/** Kürzeste Differenz auf dem Torus. */
export function wrapDelta(d: number, size: number): number {
  if (d > size / 2) return d - size;
  if (d < -size / 2) return d + size;
  return d;
}
