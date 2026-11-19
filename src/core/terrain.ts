/**
 * Gelände: Kontinente, getrennt durch Wasser, mit Gebirgszügen.
 *
 * Erzeugung (deterministisch pro Seed, mit eigenem Zufallsgenerator – unabhängig vom Rest der Simulation):
 *  1. 3–4 Kontinent-Zentren mit Mindestabstand auf der Torus-Welt.
 *  2. Jede Zelle gehört zum nächsten Zentrum (Voronoi) – mit verwirbelten Koordinaten,
 *     damit die Grenzen wie Küsten aussehen statt wie Lineal-Striche.
 *  3. Nahe der Grenze zweier Kontinente liegt Wasser (Meerenge). Damit ist jeder Kontinent
 *     vom anderen getrennt – überqueren nur per seltenem Treibgut (später: Boot).
 *  4. Gebirge: Grate aus „Ridge-Noise“ auf dem Land, etwa mountainShare des Landes.
 */
import type { SimConfig } from './config.ts';
import { Rng } from './rng.ts';
/** Abstand nur mit exakt gerundeten Operationen (Math.hypot darf je Engine abweichen). */
const dist = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

export const LAND = 0, WATER = 1, MOUNTAIN = 2;

/** Glattes, periodisches Rauschen (Value Noise) – passt nahtlos über den Weltrand. */
class Noise {
  private readonly table: Float64Array;
  private readonly nx: number;
  private readonly ny: number;
  constructor(rng: Rng, nx: number, ny: number) {
    this.nx = nx;
    this.ny = ny;
    this.table = new Float64Array(nx * ny);
    for (let i = 0; i < this.table.length; i++) this.table[i] = rng.next();
  }
  /** u, v in Gitter-Einheiten (beliebig, wird periodisch gewickelt). Ergebnis 0..1. */
  at(u: number, v: number): number {
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const ix = (i: number) => ((i % this.nx) + this.nx) % this.nx;
    const iy = (j: number) => ((j % this.ny) + this.ny) % this.ny;
    const t = this.table, nx = this.nx;
    const a = t[iy(y0) * nx + ix(x0)], b = t[iy(y0) * nx + ix(x0 + 1)];
    const c = t[iy(y0 + 1) * nx + ix(x0)], d = t[iy(y0 + 1) * nx + ix(x0 + 1)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

/** Mehrere Oktaven Rauschen (fein + grob), Ergebnis grob 0..1. */
function fbm(n: Noise[], u: number, v: number): number {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (const layer of n) { s += amp * layer.at(u * f, v * f); norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}

export class Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** LAND, WATER oder MOUNTAIN je Zelle. */
  readonly types: Uint8Array;
  /** Kontinent je Zelle (0 …), −1 = Wasser. */
  readonly region: Int8Array;
  readonly continents: number;
  /** Zellen, auf denen Futter wächst und Lebewesen ausgesetzt werden (Land ohne Gebirge). */
  readonly fertileCells: Int32Array;
  /** Fruchtbare Zellen je Kontinent (für Ackerland und Raubbau je Kontinent). */
  readonly fertilePerRegion: Int32Array;
  private readonly width: number;
  private readonly height: number;

  private constructor(cfg: SimConfig, types: Uint8Array, region: Int8Array, continents: number) {
    this.cell = cfg.terrainCell;
    this.width = cfg.width;
    this.height = cfg.height;
    this.cols = Math.ceil(cfg.width / this.cell);
    this.rows = Math.ceil(cfg.height / this.cell);
    this.types = types;
    this.region = region;
    this.continents = continents;
    const fertile: number[] = [];
    for (let i = 0; i < types.length; i++) if (types[i] === LAND) fertile.push(i);
    this.fertileCells = Int32Array.from(fertile);
    this.fertilePerRegion = new Int32Array(continents);
    for (const i of fertile) if (region[i] >= 0) this.fertilePerRegion[region[i]]++;
  }

  /** Ohne Gelände: alles Land, ein Kontinent (für Regeltests und den Vergleich mit früher). */
  static open(cfg: SimConfig): Terrain {
    const n = Math.ceil(cfg.width / cfg.terrainCell) * Math.ceil(cfg.height / cfg.terrainCell);
    return new Terrain(cfg, new Uint8Array(n), new Int8Array(n), 1);
  }

  static generate(cfg: SimConfig): Terrain {
    const rng = new Rng((cfg.seed ^ 0x5eed7e12) >>> 0);
    const cell = cfg.terrainCell;
    const cols = Math.ceil(cfg.width / cell), rows = Math.ceil(cfg.height / cell);
    const W = cfg.width, H = cfg.height;
    const wrap = (d: number, size: number) => (d > size / 2 ? d - size : d < -size / 2 ? d + size : d);

    // 1. Zentren mit Mindestabstand
    const k = 3 + rng.int(2);
    const minDist = Math.sqrt((W * H) / k) * 0.75;
    const centers: [number, number][] = [];
    for (let tries = 0; centers.length < k && tries < 5000; tries++) {
      const x = rng.range(0, W), y = rng.range(0, H);
      if (centers.every(([cx, cy]) => dist(wrap(x - cx, W), wrap(y - cy, H)) >= minDist)) centers.push([x, y]);
    }

    // Rauschen: Verwirbelung (2 Achsen), Küstenrauheit, Gebirgsgrate
    const lattice = (scale: number) => [Math.max(2, Math.round(W / scale)), Math.max(2, Math.round(H / scale))] as const;
    const layers = (scale: number, oct: number) => Array.from({ length: oct }, (_, i) => {
      const [nx, ny] = lattice(scale / (1 << i));
      return new Noise(rng, nx, ny);
    });
    const warpX = layers(400, 3), warpY = layers(400, 3), coast = layers(150, 2), ridge = layers(300, 3);
    const uv = (x: number, y: number, scale: number) => {
      const [nx, ny] = lattice(scale);
      return [(x / W) * nx, (y / H) * ny] as const;
    };

    const types = new Uint8Array(cols * rows);
    const region = new Int8Array(cols * rows);
    const ridgeVal = new Float64Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        // 2. verwirbelte Koordinaten
        const [u4, v4] = uv(x, y, 400);
        const px = x + (fbm(warpX, u4, v4) - 0.5) * cfg.terrainWarp;
        const py = y + (fbm(warpY, u4, v4) - 0.5) * cfg.terrainWarp;
        let d1 = Infinity, d2 = Infinity, best = 0;
        for (let j = 0; j < centers.length; j++) {
          const d = dist(wrap(px - centers[j][0], W), wrap(py - centers[j][1], H));
          if (d < d1) { d2 = d1; d1 = d; best = j; } else if (d < d2) d2 = d;
        }
        // 3. Meerenge an der Grenze (halber Abstandsunterschied ≈ Abstand zur Grenze), mit rauer Küste
        const [uc, vc] = uv(x, y, 150);
        const half = (cfg.channelWidth / 2) * (0.7 + 0.6 * fbm(coast, uc, vc));
        if ((d2 - d1) / 2 < half) { types[i] = WATER; region[i] = -1; continue; }
        types[i] = LAND;
        region[i] = best;
        const [ur, vr] = uv(x, y, 300);
        ridgeVal[i] = 1 - Math.abs(2 * fbm(ridge, ur, vr) - 1); // Grate: Werte nahe 1 entlang „Linien“
      }
    }
    // 4. Gebirge: die höchsten Gratwerte (Anteil mountainShare des Landes)
    const land = [];
    for (let i = 0; i < types.length; i++) if (types[i] === LAND) land.push(ridgeVal[i]);
    land.sort((a, b) => a - b);
    const cut = land.length ? land[Math.floor(land.length * (1 - cfg.mountainShare))] : Infinity;
    for (let i = 0; i < types.length; i++) if (types[i] === LAND && ridgeVal[i] >= cut) types[i] = MOUNTAIN;

    return new Terrain(cfg, types, region, centers.length);
  }

  private index(x: number, y: number): number {
    let c = Math.floor(x / this.cell), r = Math.floor(y / this.cell);
    if (c >= this.cols) c -= this.cols; else if (c < 0) c += this.cols;
    if (r >= this.rows) r -= this.rows; else if (r < 0) r += this.rows;
    return r * this.cols + c;
  }

  typeAt(x: number, y: number): number {
    return this.types[this.index(x, y)];
  }

  regionAt(x: number, y: number): number {
    return this.region[this.index(x, y)];
  }

  /** Zufälliger Punkt auf fruchtbarem Land (zwei bzw. drei Zufallszahlen). */
  randomLand(rng: Rng): [number, number] {
    if (this.fertileCells.length === 0) return [rng.range(0, this.width), rng.range(0, this.height)];
    const i = this.fertileCells[rng.int(this.fertileCells.length)];
    const c = i % this.cols, r = Math.floor(i / this.cols);
    const x = Math.min(this.width - 1e-6, (c + rng.next()) * this.cell);
    const y = Math.min(this.height - 1e-6, (r + rng.next()) * this.cell);
    return [x, y];
  }

  /** Anteile von Land, Gebirge, Wasser (für Anzeige und Tests). */
  shares(): { land: number; mountain: number; water: number } {
    let l = 0, m = 0, w = 0;
    for (const t of this.types) t === LAND ? l++ : t === MOUNTAIN ? m++ : w++;
    const n = this.types.length;
    return { land: l / n, mountain: m / n, water: w / n };
  }
}
