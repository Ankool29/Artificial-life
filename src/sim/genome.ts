import { random } from "./random";
import type { Genome } from "./types";

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
