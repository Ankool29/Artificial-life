import type { Cue } from "./types";
import type { Plant } from "./ecology-types";
export interface PhysiologyTrace {
  energySpent: number;
  toxinDamage: number;
  starvationDamage: number;
  recovery: number;
  energyAfterDigestion: number;
  healthAfterMetabolism: number;
}
export type EcologicalTrace =
  | {
      event: "germination" | "seed" | "fruit";
      plantId: number;
      variety: Cue;
      childId?: number;
      foodId?: number;
    }
  | {
      event: "death";
      plant: Plant;
      damage: number;
      conditions: {
        dormantExpired: boolean;
        waterDeficit: boolean;
        energyDeficit: boolean;
        mineralDeficit: boolean;
        oldAge: boolean;
      };
    }
  | { event: "decay" | "removed-fruit"; foodId: number; plantId: number };
