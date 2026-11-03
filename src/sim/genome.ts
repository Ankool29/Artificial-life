import { hashSeed, random } from "./random";
import {
  clamp,
  type Genome,
  type ModernGenome,
  type PhysiologyGenes,
} from "./types";

export const LEGACY_PHYSIOLOGY: Readonly<PhysiologyGenes> = Object.freeze({
  metabolicRate: 1,
  digestionRate: 1,
  toxinSensitivity: 1,
  stimulusGain: 1,
  stressSensitivity: 1,
  recoveryRate: 1,
  stimulationDecay: 1,
});
export function physiology(genome: Genome): Readonly<PhysiologyGenes> {
  return genome.version === 2 ? genome.genes : LEGACY_PHYSIOLOGY;
}

// Global physiological loci only. No locus refers to a food or object cue.
export const GENE_RANGES: Record<
  keyof ModernGenome["genes"],
  readonly [number, number]
> = {
  speed: [28, 46],
  vision: [170, 245],
  efficiency: [0.7, 1],
  detox: [0.5, 1.2],
  learningRate: [0.22, 0.5],
  exploration: [0.06, 0.22],
  metabolicRate: [0.75, 1.25],
  digestionRate: [0.7, 1.3],
  toxinSensitivity: [0.12, 1.8],
  stimulusGain: [0.65, 1.45],
  stressSensitivity: [0.3, 1.6],
  recoveryRate: [0.7, 1.3],
  stimulationDecay: [0.7, 1.3],
};
export const GENE_LABELS: Record<keyof ModernGenome["genes"], string> = {
  speed: "Vitesse",
  vision: "Perception",
  efficiency: "Assimilation",
  detox: "Détoxification",
  learningRate: "Plasticité",
  exploration: "Exploration alimentaire",
  metabolicRate: "Dépense métabolique",
  digestionRate: "Débit digestif",
  toxinSensitivity: "Sensibilité aux toxines",
  stimulusGain: "Réponse aux stimuli",
  stressSensitivity: "Réactivité au stress",
  recoveryRate: "Récupération",
  stimulationDecay: "Perte de stimulation",
};

export function generateGenome(seed: string): ModernGenome {
  const source = { rng: hashSeed(`genome-v2:${seed}`) };
  const genes = Object.fromEntries(
    Object.entries(GENE_RANGES).map(([key, [min, max]]) => [
      key,
      min + random(source) * (max - min),
    ]),
  ) as unknown as ModernGenome["genes"];
  return { version: 2, genes };
}

// Asexual inheritance in the laboratory; no mating, cohabitation or inherited memories.
export function inheritGenome(parent: Genome, seed: string): ModernGenome {
  const source = { rng: hashSeed(`inherit-v2:${seed}`) };
  const genes = { ...physiology(parent), ...parent.genes };
  for (const key of Object.keys(GENE_RANGES) as (keyof typeof genes)[]) {
    const [min, max] = GENE_RANGES[key];
    // Small bounded mutation on 15% of loci, deterministic for the genetic seed.
    const mutation =
      random(source) < 0.15 ? (random(source) * 2 - 1) * (max - min) * 0.05 : 0;
    genes[key] = clamp(genes[key] + mutation, min, max);
  }
  return { version: 2, genes };
}

// Named, versioned loci: add traits here without coupling the genome to the UI.
export function createGenome(state: { rng: number }): Genome {
  return {
    version: 1,
    genes: {
      speed: 34 + random(state) * 8,
      vision: 190 + random(state) * 25,
      efficiency: 0.85 + random(state) * 0.15,
      detox: 0.65 + random(state) * 0.2,
      learningRate: 0.32 + random(state) * 0.08,
      exploration: 0.12,
    },
  };
}
