/**
 * Plattformunabhängige Mathematik.
 *
 * Math.sin, Math.cos, Math.pow & Co. dürfen laut JavaScript-Standard je nach Engine im letzten Bit
 * abweichen – und tun es (gemessen: Node 24 und Chromium unterscheiden sich bei sin, cos, pow).
 * In einer chaotischen Simulation wächst so ein Bit zu einem völlig anderen Verlauf: derselbe Seed
 * sähe in Firefox anders aus als in Chrome.
 *
 * Grundrechenarten (+ − × ÷) und Math.sqrt sind dagegen überall exakt gleich (IEEE 754, korrekt
 * gerundet). Diese Funktionen nutzen nur sie – damit ist „gleicher Seed, gleicher Verlauf“ in jedem
 * Browser garantiert. Genauigkeit: relativer Fehler ≲ 1e-14 (für die Simulation mehr als genug).
 */

const LN2 = 0.6931471805599453;
const INV_LN2 = 1.4426950408889634;
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** 2^k für ganze k (exakt, durch wiederholtes Verdoppeln/Halbieren). */
function pow2i(k: number): number {
  let r = 1;
  if (k > 0) { let b = 2; while (k) { if (k & 1) r *= b; b *= b; k >>= 1; } }
  else if (k < 0) { let b = 0.5; k = -k; while (k) { if (k & 1) r *= b; b *= b; k >>= 1; } }
  return r;
}

/** Sinus auf [−π/4, π/4] (Taylor bis x¹⁵). */
function sinKernel(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))));
}

/** Kosinus auf [−π/4, π/4] (Taylor bis x¹⁶). */
function cosKernel(x: number): number {
  const x2 = x * x;
  return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2 * (-1 / 87178291200 + x2 * (1 / 20922789888000))))))));
}

/** Auf [−π, π] bringen und den Quadranten bestimmen (für die Werte der Simulation völlig ausreichend genau). */
function reduce(x: number): [number, number] {
  let r = x - Math.round(x / TWO_PI) * TWO_PI; // jetzt in [−π, π]
  const q = Math.round(r / HALF_PI); // −2 … 2
  r -= q * HALF_PI; // jetzt in [−π/4, π/4]
  return [r, ((q % 4) + 4) % 4];
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  switch (q) {
    case 0: return sinKernel(r);
    case 1: return cosKernel(r);
    case 2: return -sinKernel(r);
    default: return -cosKernel(r);
  }
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  switch (q) {
    case 0: return cosKernel(r);
    case 1: return -sinKernel(r);
    case 2: return -cosKernel(r);
    default: return sinKernel(r);
  }
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2; // |r| ≤ ln2/2
  // Taylor bis r¹⁴ (|r| ≤ 0,35 → Fehler ~1e-17)
  let t = 1 / 87178291200;
  for (let n = 13; n >= 1; n--) t = 1 / factorial(n) + r * t;
  const er = 1 + r * t;
  // 2^k in zwei Schritten (vermeidet Über-/Unterlauf bei großen |k|)
  const k1 = Math.trunc(k / 2);
  return er * pow2i(k1) * pow2i(k - k1);
}

const FACT: number[] = [1];
for (let i = 1; i <= 20; i++) FACT[i] = FACT[i - 1] * i;
function factorial(n: number): number {
  return FACT[n];
}

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  // x = m · 2^k mit m in [√½, √2)
  let k = 0, m = x;
  while (m >= 2) { m /= 2; k++; }
  while (m < 1) { m *= 2; k--; }
  if (m > 1.4142135623730951) { m /= 2; k++; }
  // log(m) = 2·atanh(s) mit s = (m−1)/(m+1), |s| ≤ 0,172
  const s = (m - 1) / (m + 1), s2 = s * s;
  let sum = 0;
  for (let n = 31; n >= 1; n -= 2) sum = 1 / n + s2 * sum;
  return 2 * s * sum + k * LN2;
}

export function log2(x: number): number {
  return log(x) * INV_LN2;
}

export function tanh(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return -1;
  if (Math.abs(x) < 1e-5) return x - (x * x * x) / 3;
  const e = exp(2 * x);
  return (e - 1) / (e + 1);
}

/** a^b für a > 0 (und die Sonderfälle, die die Simulation braucht). */
export function pow(a: number, b: number): number {
  if (b === 0) return 1;
  if (a === 0) return b > 0 ? 0 : Infinity;
  if (a < 0) return Number.isInteger(b) ? (b % 2 ? -1 : 1) * pow(-a, b) : NaN;
  return exp(b * log(a));
}

export { PI };
