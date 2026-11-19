import { Worker } from 'node:worker_threads';
import type { LaufAuftrag, LaufErgebnis } from './lauf.ts';

/** Mehrere Läufe parallel in Worker-Threads (Node führt die .ts-Dateien direkt aus). */
export function laeufe(auftraege: LaufAuftrag[]): Promise<LaufErgebnis[]> {
  const url = new URL('./lauf.ts', import.meta.url);
  return Promise.all(auftraege.map((a) => new Promise<LaufErgebnis>((resolve, reject) => {
    const w = new Worker(url, { workerData: a });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', (code) => { if (code !== 0) reject(new Error(`Lauf Seed ${a.seed} endete mit Code ${code}`)); });
  })));
}
