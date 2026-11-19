/**
 * Winziges neuronales Netz: 8 Eingänge → 6 versteckte Neuronen → 2 Ausgänge.
 * Die Gewichte sind Teil des Genoms – das „Verhalten“ wird also mitvererbt
 * und mutiert, niemand programmiert es.
 *
 * Eingänge:
 *   0 Bias (immer 1)
 *   1 Futter: Richtung (sin des relativen Winkels, + = links)
 *   2 Futter: Nähe (0 = nichts gesehen, 1 = direkt davor)
 *   3 Beute: Richtung
 *   4 Beute: Nähe
 *   5 Gefahr: Richtung
 *   6 Gefahr: Nähe
 *   7 eigene Energie (0..1)
 * Ausgänge:
 *   0 Drehung (−1..1)
 *   1 Schub (0..1)
 */
import { exp, tanh } from './dmath.ts';
export const N_IN = 8;
export const N_HID = 6;
export const N_OUT = 2;
export const BRAIN_SIZE = N_IN * N_HID + N_HID * N_OUT;

const hidden = new Float64Array(N_HID);

export function think(w: Float32Array, input: Float64Array, out: Float64Array): void {
  let k = 0;
  for (let h = 0; h < N_HID; h++) {
    let s = 0;
    for (let i = 0; i < N_IN; i++) s += w[k++] * input[i];
    hidden[h] = tanh(s);
  }
  let s0 = 0;
  let s1 = 0;
  for (let h = 0; h < N_HID; h++) {
    s0 += w[k++] * hidden[h];
    s1 += w[k++] * hidden[h];
  }
  out[0] = tanh(s0);
  out[1] = 1 / (1 + exp(-s1));
}
