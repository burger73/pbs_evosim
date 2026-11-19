/**
 * Ein Zeitschritt im Leben jedes Lebewesens: wahrnehmen → entscheiden (Gehirn) → bewegen →
 * Energie verbrauchen → anstecken → fressen. Hier steckt der Großteil der Rechenzeit.
 */
import { N_IN, think } from './brain.ts';
import { CRISES } from './config.ts';
import { hueDistance } from './genome.ts';
import { wrapDelta } from './grid.ts';
import { SKILL, extraBonus, has, popcount, upkeep } from './skills.ts';
import { canEat, isHunter, isPredator, maxEnergy, radius, senseRadius, skillsOf } from './traits.ts';
import type { World } from './world.ts';

const input = new Float64Array(N_IN);
const output = new Float64Array(2);

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

export function stepOrganisms(w: World): void {
  const cfg = w.cfg;
  const rng = w.rng;
  const food = w.food;
  const organisms = w.organisms;
  const W = cfg.width;
  const H = cfg.height;
  const crisisDef = w.crisis ? CRISES[w.crisis.kind] : null;

  for (let idx = 0; idx < organisms.length; idx++) {
    const o = organisms[idx];
    if (!o.alive) continue;
    const sk = skillsOf(o);
    const digger = has(sk, SKILL.graben);
    const r = radius(cfg, o);
    const R = senseRadius(cfg, o);
    const cos = Math.cos(o.heading);
    const sin = Math.sin(o.heading);

    // --- Wahrnehmung -------------------------------------------------
    const R2 = R * R;
    let foodD2 = R2, foodDx = 0, foodDy = 0;
    food.grid.forEachNear(o.x, o.y, R, (fi) => {
      if (!food.alive[fi] || (food.buried[fi] && !digger)) return;
      const dx = wrapDelta(food.x[fi] - o.x, W);
      const dy = wrapDelta(food.y[fi] - o.y, H);
      const d2 = dx * dx + dy * dy;
      if (d2 < foodD2) { foodD2 = d2; foodDx = dx; foodDy = dy; }
    });
    let preyD2 = R2, preyDx = 0, preyDy = 0, threatD2 = R2, threatDx = 0, threatDy = 0;
    const hunter = isHunter(o);
    w.orgGrid.forEachNear(o.x, o.y, R, (qi) => {
      const q = organisms[qi];
      if (q === o || !q.alive) return;
      const dx = wrapDelta(q.x - o.x, W);
      const dy = wrapDelta(q.y - o.y, H);
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2) return;
      if (hunter && d2 < preyD2 && canEat(cfg, o, q)) { preyD2 = d2; preyDx = dx; preyDy = dy; }
      if (d2 < threatD2 && canEat(cfg, q, o)) { threatD2 = d2; threatDx = dx; threatDy = dy; }
    });
    const sense = (d2: number, dx: number, dy: number, i: number) => {
      if (d2 >= R2) { input[i] = 0; input[i + 1] = 0; return; }
      const d = Math.sqrt(d2) || 1;
      input[i] = (cos * dy - sin * dx) / d;
      input[i + 1] = 1 - d / R;
    };
    input[0] = 1;
    sense(foodD2, foodDx, foodDy, 1);
    sense(preyD2, preyDx, preyDy, 3);
    sense(threatD2, threatDx, threatDy, 5);
    input[7] = Math.min(1, o.energy / (cfg.reproFactor * o.genome.size * o.genome.size));

    // --- Entscheidung & Bewegung --------------------------------------
    think(o.genome.brain, input, output);
    o.heading += output[0] * cfg.maxTurn;
    const v = output[1] * o.genome.speed * cfg.speedScale;
    o.x = (o.x + Math.cos(o.heading) * v + W) % W;
    o.y = (o.y + Math.sin(o.heading) * v + H) % H;
    o.travelled += v;
    o.age++;

    // --- Energiekosten ------------------------------------------------
    const area = o.genome.size * o.genome.size;
    let base = cfg.baseCost * area;
    if (has(sk, SKILL.feuer)) base *= 0.7;
    if (crisisDef && has(sk, SKILL.vorrat)) base *= 0.6;
    let cold = 0;
    if (crisisDef && crisisDef.cold > 0) {
      cold = crisisDef.cold * cfg.coldCost * area;
      if (has(sk, SKILL.bau)) cold *= 0.5;
      if (has(sk, SKILL.feuer)) cold *= 0.4;
      if (has(sk, SKILL.kleidung)) cold *= 0.5;
      if (has(sk, SKILL.huette)) cold *= 0.3;
    }
    const move = cfg.moveCost * area * v * v * (has(sk, SKILL.maschinen) ? 0.5 : 1);
    // Komplexitätskosten: einfache Kultur (bis 4 erlernte Fähigkeiten) ist billig
    const complexity = cfg.complexityCost * (Math.max(0, popcount(o.learned.mask) - 4) + 2 * Math.log2(1 + o.learned.extra));
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
      const plantGain = cfg.foodEnergy * (1 - o.genome.diet) * (has(sk, SKILL.werkzeug) ? 1.4 : 1) * (has(sk, SKILL.metall) ? 1.3 : 1) * extraBonus(o.learned.extra);
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
        if (q === o || !q.alive || !canEat(cfg, o, q)) return;
        const dx = wrapDelta(q.x - o.x, W);
        const dy = wrapDelta(q.y - o.y, H);
        const reach = r + radius(cfg, q);
        if (dx * dx + dy * dy < reach * reach) {
          q.alive = false;
          const qArea = q.genome.size * q.genome.size;
          const eff = isPredator(o) ? o.genome.diet : 0.6; // Jäger mit Waffen verwerten Beute gut
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
