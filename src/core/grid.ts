/**
 * Räumliches Raster für schnelle Nachbarschaftssuche auf einer Torus-Welt
 * (wer rechts hinausläuft, kommt links wieder herein).
 *
 * Intern flach gespeichert (Zählsortierung nach Zelle): items enthält die IDs Zelle für Zelle,
 * cellStart[c] … cellStart[c + 1] ist der Bereich von Zelle c. Innerhalb einer Zelle bleibt die
 * Einfügereihenfolge erhalten – wichtig, weil die Besuchsreihenfolge das Verhalten beeinflusst
 * (Zufallszahlen, Gleichstände).
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  private readonly cellW: number;
  private readonly cellH: number;
  /** Bereichsanfänge je Zelle (Länge cols·rows + 1). */
  readonly cellStart: Int32Array;
  /** IDs, nach Zellen sortiert. */
  items: Int32Array = new Int32Array(64);
  private cellOfItem: Int32Array = new Int32Array(64);
  private readonly pendingX: number[] = [];
  private readonly pendingY: number[] = [];
  private readonly pendingId: number[] = [];
  private dirty = false;
  /** Puffer für forEachNear (fn darf kein forEachNear auf DIESEM Raster rufen). */
  private readonly scratch = new Int32Array(4096);
  private readonly colIdx = new Int32Array(1024);
  private readonly colD2 = new Float64Array(1024);

  constructor(width: number, height: number, cellSize: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.max(1, Math.floor(width / cellSize));
    this.rows = Math.max(1, Math.floor(height / cellSize));
    this.cellW = width / this.cols;
    this.cellH = height / this.rows;
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
  }

  clear(): void {
    this.pendingX.length = 0;
    this.pendingY.length = 0;
    this.pendingId.length = 0;
    this.dirty = true;
  }

  private cellIndex(x: number, y: number): number {
    let cx = Math.floor(x / this.cellW) % this.cols;
    let cy = Math.floor(y / this.cellH) % this.rows;
    if (cx < 0) cx += this.cols;
    if (cy < 0) cy += this.rows;
    return cy * this.cols + cx;
  }

  insert(id: number, x: number, y: number): void {
    this.pendingId.push(id);
    this.pendingX.push(x);
    this.pendingY.push(y);
    this.dirty = true;
  }

  /** Eingefügte Punkte nach Zellen sortieren (stabil). Wird bei der ersten Abfrage automatisch aufgerufen. */
  build(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const n = this.pendingId.length;
    if (this.items.length < n) {
      this.items = new Int32Array(Math.max(n, this.items.length * 2));
      this.cellOfItem = new Int32Array(this.items.length);
    }
    const start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(this.pendingX[i], this.pendingY[i]);
      this.cellOfItem[i] = c;
      start[c + 1]++;
    }
    for (let c = 1; c < start.length; c++) start[c] += start[c - 1];
    // Füllen: Schreibzeiger je Zelle, in Einfügereihenfolge (stabil)
    const fill = start.slice(0, start.length - 1);
    for (let i = 0; i < n; i++) this.items[fill[this.cellOfItem[i]]++] = this.pendingId[i];
  }

  /**
   * Zellen, die den Kreis (x, y, r) berühren können, in fester Reihenfolge (Zeile für Zeile).
   * Schreibt die Zellindizes nach out und liefert ihre Anzahl. Mit skipFar werden Zellen
   * ausgelassen, die vollständig außerhalb des Kreises liegen – nur verwenden, wenn ohnehin
   * nur Treffer innerhalb von r zählen.
   */
  cellsNear(x: number, y: number, r: number, out: Int32Array, skipFar = false): number {
    this.build();
    const cols = this.cols, rows = this.rows, cw = this.cellW, ch = this.cellH;
    let cx = Math.floor(x / cw) % cols;
    let cy = Math.floor(y / ch) % rows;
    if (cx < 0) cx += cols;
    if (cy < 0) cy += rows;
    const sx = Math.ceil(r / cw);
    const sy = Math.ceil(r / ch);
    const allX = 2 * sx + 1 >= cols;
    const allY = 2 * sy + 1 >= rows;
    const x0 = allX ? 0 : cx - sx;
    const x1 = allX ? cols - 1 : cx + sx;
    const y0 = allY ? 0 : cy - sy;
    const y1 = allY ? rows - 1 : cy + sy;
    const r2 = r * r;
    // Position innerhalb der eigenen Zelle (für den Mindestabstand zu Nachbarzellen)
    const fx = x - cx * cw, fy = y - cy * ch;
    const skipY = skipFar && !allY, skipX = skipFar && !allX;
    // Spalten einmal vorbereiten: Zellspalte (um den Rand gewickelt) und quadrierter Mindestabstand
    const nx = x1 - x0 + 1;
    const colIdx = this.colIdx, colD2 = this.colD2;
    for (let j = 0; j < nx; j++) {
      const gx = x0 + j;
      colIdx[j] = gx < 0 ? gx + cols : gx >= cols ? gx - cols : gx;
      if (skipX) {
        const k = gx - cx;
        const d = k > 0 ? k * cw - fx : k < 0 ? fx - (k + 1) * cw : 0;
        colD2[j] = d * d;
      } else colD2[j] = 0;
    }
    let n = 0;
    for (let gy = y0; gy <= y1; gy++) {
      const ry = gy < 0 ? gy + rows : gy >= rows ? gy - rows : gy;
      let dy2 = 0;
      if (skipY) {
        const k = gy - cy;
        const d = k > 0 ? k * ch - fy : k < 0 ? fy - (k + 1) * ch : 0;
        dy2 = d * d;
        if (dy2 > r2) continue;
      }
      const base = ry * cols;
      if (skipX) {
        for (let j = 0; j < nx; j++) if (colD2[j] + dy2 <= r2) out[n++] = base + colIdx[j];
      } else {
        for (let j = 0; j < nx; j++) out[n++] = base + colIdx[j];
      }
    }
    return n;
  }

  /** Ruft fn für alle Einträge in Zellen auf, die den Kreis (x, y, r) berühren können. */
  forEachNear(x: number, y: number, r: number, fn: (id: number) => void): void {
    const cells = this.scratch;
    const nc = this.cellsNear(x, y, r, cells);
    const start = this.cellStart, items = this.items;
    for (let k = 0; k < nc; k++) {
      const c = cells[k];
      for (let i = start[c], e = start[c + 1]; i < e; i++) fn(items[i]);
    }
  }
}

/** Kürzeste Differenz auf dem Torus. */
export function wrapDelta(d: number, size: number): number {
  if (d > size / 2) return d - size;
  if (d < -size / 2) return d + size;
  return d;
}
