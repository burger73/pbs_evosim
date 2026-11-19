/// <reference lib="webworker" />
/**
 * Web Worker: die Simulation läuft hier, getrennt von der Oberfläche.
 * So bleibt die Bedienung flüssig, auch wenn ein Schritt länger dauert.
 */
import { SimHost } from './host.ts';
import type { ToWorker } from './protocol.ts';

const host = new SimHost();
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const snap = host.handle(ev.data);
  if (snap) (self as unknown as DedicatedWorkerGlobalScope).postMessage(snap, [snap.orgs.buffer, snap.food.buffer]);
};
