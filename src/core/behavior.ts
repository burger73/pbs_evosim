/**
 * Ein Zeitschritt im Leben jedes Lebewesens: wahrnehmen → entscheiden (Gehirn) → bewegen →
 * Energie verbrauchen → anstecken → fressen. Hier steckt der Großteil der Rechenzeit.
 */
import { N_IN, think } from './brain.ts';
import { CRISES } from './config.ts';
import { hueDistance } from './genome.ts';
import { wrapDelta } from './grid.ts';
import { LIMITS } from './genome.ts';
import { SKILL, extraBonus, has, popcount, upkeep } from './skills.ts';
import { MOUNTAIN, WATER } from './terrain.ts';
import { canHunt, isHunter, isPredator, maxEnergy, plantFactor, radius, senseRadius, skillsOf } from './traits.ts';
import type { World } from './world.ts';
import { cos as dcos, log2 as dlog2, sin as dsin } from './dmath.ts';

const input = new Float64Array(N_IN);
const output = new Float64Array(2);
const cellBuf = new Int32Array(4096);

// Vorberechnete Werte je Lebewesen (Index = Position in world.organisms), gültig für einen Schritt.
// Sie ändern sich während stepOrganisms nicht: Fähigkeiten und Kultur ändern sich erst in culture.ts,
// Gruppen werden vorher gezählt. So wird „wer kann wen fressen“ zu ein paar Bit-Operationen.
let cap = 0;
let rad = new Float64Array(0);
let skl = new Int32Array(0);
let pred = new Uint8Array(0);
let cult = new Uint8Array(0);
let grp = new Int32Array(0);
let diet = new Float64Array(0);

const B_WAFFEN = 1 << SKILL.waffen, B_HUETTE = 1 << SKILL.huette, B_METALL = 1 << SKILL.metall;
const B_GRUPPE = 1 << SKILL.gruppe, B_BAU = 1 << SKILL.bau, B_BOOT = 1 << SKILL.boot;

/** Wie traits.canEat (Natur-Modus), aber auf den vorberechneten Werten. Muss exakt gleich rechnen! */
function canEatI(a: number, b: number, predatorSizeRatio: number, sizeBonus = 0): boolean {
  if (cult[a] && cult[b]) return false; // Kulturträger fressen keine Kulturträger
  const sa = skl[a], sb = skl[b];
  const aW = (sa & B_WAFFEN) !== 0, bW = (sb & B_WAFFEN) !== 0;
  if (bW && !aW) return false;
  if ((sb & B_HUETTE) !== 0 && !aW) return false;
  const ra = rad[a], rb = rad[b];
  if (aW && !cult[b] && ra * ((sa & B_METALL) !== 0 ? 3 : 2) > rb) return true;
  if (!pred[a]) return false;
  let ratio = sizeBonus > 0 ? predatorSizeRatio - sizeBonus * diet[a] : predatorSizeRatio;
  if ((sa & B_GRUPPE) !== 0 && grp[a] >= 2) ratio = Math.min(ratio, 0.9);
  if ((sb & B_BAU) !== 0) ratio *= 1.5;
  if ((sb & B_GRUPPE) !== 0 && grp[b] >= 2) ratio *= 1.4;
  return ra > ratio * rb;
}

function precompute(w: World): void {
  const os = w.organisms, n = os.length;
  if (n > cap) {
    cap = Math.max(n, cap * 2, 1024);
    rad = new Float64Array(cap); skl = new Int32Array(cap); pred = new Uint8Array(cap);
    cult = new Uint8Array(cap); grp = new Int32Array(cap); diet = new Float64Array(cap);
  }
  for (let i = 0; i < n; i++) {
    const o = os[i];
    rad[i] = radius(w.cfg, o);
    skl[i] = skillsOf(o);
    pred[i] = canHunt(w.cfg, o) ? 1 : 0; // kann von Natur aus jagen
    cult[i] = o.genome.culture ? 1 : 0;
    grp[i] = o.group;
    diet[i] = o.genome.diet;
  }
}

/** Für „Gruppe“: Artgenossen (ähnliche Farbe, gleiche Rolle) in der Nähe zählen. */
export function countGroups(w: World): void {
  const W = w.cfg.width, H = w.cfg.height;
  const organisms = w.organisms;
  for (const o of organisms) {
    o.group = 0;
    if (!has(o.genome.skills, SKILL.gruppe)) continue;
    const pred = isPredator(o);
    w.orgGrid.forEachNear(o.x, o.y, 30, (qi) => {
      const q = organisms[qi];
      if (q === o || !q.alive || isPredator(q) !== pred || hueDistance(q.genome.hue, o.genome.hue) > 30) return;
      const dx = wrapDelta(q.x - o.x, W), dy = wrapDelta(q.y - o.y, H);
      if (dx * dx + dy * dy < 900) o.group++;
    });
  }
}

/**
 * Treibgut: Das Lebewesen wird in Blickrichtung über das Wasser getragen und landet am nächsten Ufer.
 * Erreicht es so einen anderen Kontinent, ist das ein Gründerereignis (wie Darwins Finken).
 */
function drift(w: World, o: World['organisms'][number]): boolean {
  const cfg = w.cfg, t = w.terrain, W = cfg.width, H = cfg.height;
  const dx = dcos(o.heading), dy = dsin(o.heading);
  const stepLen = cfg.terrainCell / 2;
  let wasWater = false;
  for (let d = stepLen; d <= cfg.driftRange; d += stepLen) {
    const x = (o.x + dx * d + W * 4) % W, y = (o.y + dy * d + H * 4) % H;
    const type = t.typeAt(x, y);
    if (type === WATER) { wasWater = true; continue; }
    if (!wasWater) continue;
    const from = t.regionAt(o.x, o.y), to = t.regionAt(x, y);
    o.x = x; o.y = y;
    if (from !== to) w.addEvent('🌊 Treibgut');
    return true;
  }
  return false;
}

export function stepOrganisms(w: World): void {
  const cfg = w.cfg;
  const rng = w.rng;
  const food = w.food;
  const organisms = w.organisms;
  const W = cfg.width;
  const H = cfg.height;
  const crisisDef = w.crisis ? CRISES[w.crisis.kind] : null;
  const terrain = w.terrain, terrainOn = cfg.terrain;
  const natur = cfg.mode === 'natur';
  const psr = cfg.predatorSizeRatio, hsb = cfg.huntSizeBonus;
  // Andere haben sich seit dem Rasteraufbau schon bewegt (höchstens maxMove) – Zellen nur mit diesem Puffer auslassen
  const maxMove = LIMITS.speed[1] * cfg.speedScale + 1e-6;
  precompute(w);
  food.grid.build();
  w.orgGrid.build();
  const fStart = food.grid.cellStart, fItems = food.grid.items;
  const oStart = w.orgGrid.cellStart, oItems = w.orgGrid.items;

  for (let idx = 0; idx < organisms.length; idx++) {
    const o = organisms[idx];
    if (!o.alive) continue;
    const sk = skillsOf(o);
    const digger = has(sk, SKILL.graben);
    const r = radius(cfg, o);
    const R = senseRadius(cfg, o);
    const cos = dcos(o.heading);
    const sin = dsin(o.heading);

    // --- Wahrnehmung -------------------------------------------------
    const R2 = R * R;
    let foodD2 = R2, foodDx = 0, foodDy = 0;
    const ox = o.x, oy = o.y;
    const fAlive = food.alive, fBuried = food.buried, fX = food.x, fY = food.y;
    let nc = food.grid.cellsNear(ox, oy, R, cellBuf, true); // Futter bewegt sich nicht: exakt
    for (let k = 0; k < nc; k++) {
      const c = cellBuf[k];
      for (let i = fStart[c], e = fStart[c + 1]; i < e; i++) {
        const fi = fItems[i];
        if (!fAlive[fi] || (fBuried[fi] && !digger)) continue;
        const dx = wrapDelta(fX[fi] - ox, W);
        const dy = wrapDelta(fY[fi] - oy, H);
        const d2 = dx * dx + dy * dy;
        if (d2 < foodD2) { foodD2 = d2; foodDx = dx; foodDy = dy; }
      }
    }
    // Kulturträger jagen nur bei Hunger – sonst rotten sie mit Waffen alles Wilde aus
    // Satte jagen nicht: Kulturträger nur bei Hunger (sonst rotten sie alles Wilde aus), Wilde je nach wildHuntHunger
    const hunger = o.genome.culture ? cfg.cultureHuntHunger : cfg.wildHuntHunger;
    const hunter = isHunter(cfg, o) && (hunger === Infinity || o.energy < hunger * cfg.reproFactor * o.genome.size * o.genome.size);
    // Jagdsinn: Wer von Natur aus jagt, nimmt Beute weiter wahr (Geruch, Gehör) – je fleischlicher, desto weiter
    const Rp = cfg.huntSense > 0 && pred[idx] ? Math.max(R, cfg.huntSense * o.genome.diet) : R;
    const Rp2 = Rp * Rp;
    let preyD2 = Rp2, preyDx = 0, preyDy = 0, threatD2 = R2, threatDx = 0, threatDy = 0;
    nc = w.orgGrid.cellsNear(ox, oy, Rp + maxMove, cellBuf, true);
    for (let k = 0; k < nc; k++) {
      const c = cellBuf[k];
      for (let i = oStart[c], e = oStart[c + 1]; i < e; i++) {
        const qi = oItems[i];
        const q = organisms[qi];
        if (q === o || !q.alive) continue;
        const dx = wrapDelta(q.x - ox, W);
        const dy = wrapDelta(q.y - oy, H);
        const d2 = dx * dx + dy * dy;
        if (d2 >= Rp2) continue;
        if (hunter && d2 < preyD2 && natur && canEatI(idx, qi, psr, hsb)) { preyD2 = d2; preyDx = dx; preyDy = dy; }
        if (d2 < threatD2 && natur && canEatI(qi, idx, psr, hsb)) { threatD2 = d2; threatDx = dx; threatDy = dy; }
      }
    }
    const sense = (d2: number, dx: number, dy: number, i: number, rad: number, rad2: number) => {
      if (d2 >= rad2) { input[i] = 0; input[i + 1] = 0; return; }
      const d = Math.sqrt(d2) || 1;
      input[i] = (cos * dy - sin * dx) / d;
      input[i + 1] = 1 - d / rad;
    };
    input[0] = 1;
    sense(foodD2, foodDx, foodDy, 1, R, R2);
    sense(preyD2, preyDx, preyDy, 3, Rp, Rp2);
    sense(threatD2, threatDx, threatDy, 5, R, R2);
    input[7] = Math.min(1, o.energy / (cfg.reproFactor * o.genome.size * o.genome.size));

    // --- Entscheidung & Bewegung --------------------------------------
    think(o.genome.brain, input, output);
    o.heading += output[0] * cfg.maxTurn;
    const v = output[1] * o.genome.speed * cfg.speedScale;
    let inMountain = false;
    if (!terrainOn) {
      o.x = (o.x + dcos(o.heading) * v + W) % W;
      o.y = (o.y + dsin(o.heading) * v + H) % H;
      o.travelled += v;
    } else {
      inMountain = terrain.typeAt(o.x, o.y) === MOUNTAIN;
      const step = inMountain ? v * cfg.mountainSlow : v; // im Gebirge langsamer (die Anstrengung kostet trotzdem)
      const nx = (o.x + dcos(o.heading) * step + W) % W;
      const ny = (o.y + dsin(o.heading) * step + H) % H;
      if (terrain.typeAt(nx, ny) !== WATER || (skl[idx] & B_BOOT) !== 0) { // mit Boot geht es übers Wasser
        o.x = nx; o.y = ny; o.travelled += step;
      } else if (!(rng.chance(cfg.driftChance) && drift(w, o))) {
        // Am Ufer abprallen wie eine Billardkugel: die Richtung spiegeln, in der Wasser liegt.
        // (Einfach umdrehen wäre fatal: Man liefe auf der eigenen, abgegrasten Spur zurück.)
        const waterX = terrain.typeAt(nx, o.y) === WATER, waterY = terrain.typeAt(o.x, ny) === WATER;
        if (waterX && !waterY) o.heading = Math.PI - o.heading;
        else if (waterY && !waterX) o.heading = -o.heading;
        else o.heading += Math.PI;
      }
    }
    o.age++;

    // --- Energiekosten ------------------------------------------------
    const area = o.genome.size * o.genome.size;
    let base = cfg.baseCost * area;
    if (has(sk, SKILL.feuer)) base *= 0.7;
    if (crisisDef && has(sk, SKILL.vorrat)) base *= 0.6;
    let cold = 0;
    // Im Gebirge verstärkt sich die Kälte einer Krise (mountainCold = Aufschlag in Kältekrisen)
    const crisisCold = crisisDef ? crisisDef.cold : 0;
    const coldStrength = inMountain && crisisCold > 0 ? crisisCold * (1 + cfg.mountainCold) : crisisCold;
    if (coldStrength > 0) {
      cold = coldStrength * cfg.coldCost * area;
      if (has(sk, SKILL.bau)) cold *= 0.5;
      if (has(sk, SKILL.feuer)) cold *= 0.4;
      if (has(sk, SKILL.kleidung)) cold *= 0.5;
      if (has(sk, SKILL.huette)) cold *= 0.3;
    }
    const move = cfg.moveCost * area * v * v * (has(sk, SKILL.maschinen) ? 0.5 : 1);
    // Komplexitätskosten: einfache Kultur (bis 4 erlernte Fähigkeiten) ist billig
    const complexity = cfg.complexityCost * (Math.max(0, popcount(o.learned.mask) - 4) + 2 * dlog2(1 + o.learned.extra));
    o.energy -= base + move + cfg.senseCost * (R / cfg.maxSense) + cold
      + upkeep(o.genome.skills) + (o.genome.culture ? cfg.cultureCost : 0) + complexity;

    // --- Seuche ------------------------------------------------------
    if (o.infection === 1) {
      const med = has(sk, SKILL.medizin);
      if (rng.chance(cfg.diseaseMortality * (med ? 0.5 : 1))) o.alive = false;
      else if (rng.chance(cfg.recoverRate)) o.infection = 2;
      else {
        const rr = cfg.infectRadius * cfg.infectRadius;
        w.orgGrid.forEachNear(o.x, o.y, cfg.infectRadius, (qi) => {
          const q = organisms[qi];
          if (q === o || !q.alive || q.infection !== 0) return;
          const dx = wrapDelta(q.x - o.x, W), dy = wrapDelta(q.y - o.y, H);
          if (dx * dx + dy * dy > rr) return;
          const p = cfg.infectRate * (hueDistance(q.genome.hue, o.genome.hue) < 40 ? 1 : 0.1);
          if (rng.chance(p)) q.infection = 1;
        });
      }
    }

    // --- Fressen: Pflanzen -------------------------------------------
    if (o.genome.diet < 0.8) {
      const plantGain = cfg.foodEnergy * plantFactor(cfg, o.genome.diet) * (has(sk, SKILL.werkzeug) ? 1.4 : 1) * (has(sk, SKILL.metall) ? 1.3 : 1) * extraBonus(o.learned.extra);
      const reach = (r + cfg.foodRadius) * (has(sk, SKILL.netz) ? 2 : 1);
      food.grid.forEachNear(o.x, o.y, reach, (fi) => {
        if (!food.alive[fi] || (food.buried[fi] && !digger)) return;
        const dx = wrapDelta(food.x[fi] - o.x, W);
        const dy = wrapDelta(food.y[fi] - o.y, H);
        if (dx * dx + dy * dy < reach * reach) {
          food.alive[fi] = false;
          o.energy += plantGain;
          o.eaten++;
        }
      });
    }

    // --- Fressen: Beute ----------------------------------------------
    if (hunter && cfg.mode === 'natur') {
      w.orgGrid.forEachNear(o.x, o.y, r * 2, (qi) => {
        const q = organisms[qi];
        if (q === o || !q.alive || !canEatI(idx, qi, psr, hsb)) return;
        const dx = wrapDelta(q.x - o.x, W);
        const dy = wrapDelta(q.y - o.y, H);
        const reach = r + radius(cfg, q);
        if (dx * dx + dy * dy < reach * reach) {
          q.alive = false;
          w.kills++;
          const qArea = q.genome.size * q.genome.size;
          const eff = canHunt(cfg, o) ? o.genome.diet : 0.6; // Jäger mit Waffen verwerten Beute gut
          o.energy += (Math.max(0, q.energy) + cfg.bodyEnergy * qArea) * cfg.predationEfficiency * eff;
          o.eaten++;
        }
      });
    }
  }

  // Überschüssige Energie verfällt (sonst horten Lebewesen unbegrenzt, sobald die Population voll ist)
  for (const o of organisms) {
    const cap = maxEnergy(cfg, o);
    if (o.energy > cap) o.energy = cap;
  }
}
