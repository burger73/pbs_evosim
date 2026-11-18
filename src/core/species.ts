import { genomeDistance, type Genome } from './genome.ts';

export interface SpeciesCluster {
  representative: Genome;
  members: number;
  /** Indizes (ins Eingabe-Array) der gezählten Mitglieder. */
  indices: number[];
}

/**
 * Grobe „Arten“-Zählung: Genome, die sich im Merkmalsraum ähneln, werden
 * gruppiert (Leader-Clustering). Gruppen mit weniger als minMembers zählen nicht.
 * Biologisch unsauber – aber ein brauchbares Maß für Vielfalt.
 */
export function clusterSpecies(
  genomes: readonly Genome[],
  threshold = 0.3,
  minMembers = 3,
  maxSample = 400,
): SpeciesCluster[] {
  const step = Math.max(1, Math.floor(genomes.length / maxSample));
  const clusters: SpeciesCluster[] = [];
  for (let i = 0; i < genomes.length; i += step) {
    const g = genomes[i];
    let best: SpeciesCluster | null = null;
    let bestD = threshold;
    for (const c of clusters) {
      const d = genomeDistance(g, c.representative);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) { best.members++; best.indices.push(i); }
    else clusters.push({ representative: g, members: 1, indices: [i] });
  }
  return clusters.filter((c) => c.members >= minMembers).sort((a, b) => b.members - a.members);
}
