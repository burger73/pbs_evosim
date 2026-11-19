/**
 * Futter: Oberflächenfutter (für alle) und vergrabenes Futter (nur für Gräber).
 * Gespeichert als parallele Arrays – schnell und einfach zu zeichnen.
 */
import type { SimConfig } from './config.ts';
import { Grid } from './grid.ts';
import type { Rng } from './rng.ts';

export class FoodField {
  readonly x: number[] = [];
  readonly y: number[] = [];
  readonly buried: boolean[] = [];
  /** Noch nicht gefressen? Gefressenes wird am Ende des Schritts entfernt (compact). */
  alive: boolean[] = [];
  readonly grid: Grid;
  private readonly cfg: SimConfig;
  private readonly rng: Rng;
  private acc = 0;
  private buriedCount = 0;

  constructor(cfg: SimConfig, rng: Rng) {
    this.cfg = cfg;
    this.rng = rng;
    this.grid = new Grid(cfg.width, cfg.height, 40);
  }

  get count(): number {
    return this.x.length;
  }

  /**
   * Futter hinzufügen. Vergrabenes und Oberflächenfutter haben getrennte Obergrenzen –
   * sonst verstopft ungefressenes vergrabenes Futter die Welt, solange niemand graben kann.
   */
  add(x?: number, y?: number, limit = this.cfg.maxFood, buried?: boolean): void {
    const b = buried ?? this.rng.chance(this.cfg.buriedShare);
    const cap = b ? limit * this.cfg.buriedShare : limit * (1 - this.cfg.buriedShare);
    if ((b ? this.buriedCount : this.x.length - this.buriedCount) >= cap) return;
    this.x.push(x ?? this.rng.range(0, this.cfg.width));
    this.y.push(y ?? this.rng.range(0, this.cfg.height));
    this.buried.push(b);
    this.alive.push(true);
    if (b) this.buriedCount++;
  }

  /** Gefressenes entfernen. */
  compact(): void {
    let j = 0;
    this.buriedCount = 0;
    for (let i = 0; i < this.x.length; i++) {
      if (!this.alive[i]) continue;
      if (this.buried[i]) this.buriedCount++;
      this.x[j] = this.x[i];
      this.y[j] = this.y[i];
      this.buried[j] = this.buried[i];
      j++;
    }
    this.x.length = j;
    this.y.length = j;
    this.buried.length = j;
    this.alive = new Array(j).fill(true);
  }

  /** Nachwachsen: Rate × Sauerstoff × Krisen-Faktor × Bodenfruchtbarkeit. */
  grow(crisisFactor: number, fertility: number): void {
    this.acc += this.cfg.foodRate * this.cfg.oxygen * crisisFactor * fertility;
    while (this.acc >= 1) {
      this.add();
      this.acc -= 1;
    }
  }

  /** Dürre/Vulkan: Oberflächenfutter verdirbt, vergrabenes bleibt. */
  decay(rate: number): void {
    for (let i = 0; i < this.x.length; i++) if (!this.buried[i] && this.rng.chance(rate)) this.alive[i] = false;
  }

  rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.x.length; i++) this.grid.insert(i, this.x[i], this.y[i]);
  }
}
