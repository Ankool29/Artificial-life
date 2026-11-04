import type { Cue, Food, Point } from "./types";

export const MAX_PLANTS = 36;
export const SOIL_SIDE = 5;
export const SOIL_CELLS = SOIL_SIDE * SOIL_SIDE;
export const ECOLOGY_INTERVAL = 10;
export const PLANT_STAGES = [
  "seed",
  "germinating",
  "growing",
  "mature",
  "fruiting",
  "senescent",
  "dead",
] as const;
export type PlantStage = (typeof PLANT_STAGES)[number];
export interface Budget {
  initial: number;
  input: number;
  output: number;
}
export interface SoilCell {
  water: number;
  minerals: number;
  litterEnergy: number;
  litterMinerals: number;
}
export interface PlantBud {
  remaining: number;
  energy: number;
  minerals: number;
  water: number;
}
export interface Plant extends Point {
  id: number;
  variety: Cue;
  age: number;
  stage: PlantStage;
  stageAge: number;
  development: number;
  energy: number;
  biomass: number;
  water: number;
  minerals: number;
  health: number;
  longevity: number;
  seedTimer: number;
  bud: PlantBud | null;
  fruitsProduced: number;
  seedsProduced: number;
}
// Physical ecological bookkeeping, never forwarded to the creature's perception.
export interface PlantFruit {
  foodId: number;
  plantId: number;
  cell: number;
  expiresAt: number;
  energy: number;
  minerals: number;
  water: number;
}
export interface EcologySettings {
  light: number;
  waterInput: number;
  mineralInput: number;
}
export interface EcologyState {
  version: 1;
  rng: number;
  phase: number;
  time: number;
  creaturePresent: boolean;
  settings: EcologySettings;
  soil: SoilCell[];
  plants: Plant[];
  fruits: PlantFruit[];
  budgets: { water: Budget; minerals: Budget; energy: Budget };
  counters: {
    planted: number;
    germinated: number;
    born: number;
    died: number;
    produced: number;
    consumed: number;
    decayed: number;
    removedFruits: number;
    uprooted: number;
  };
}
export interface EcologyWorld {
  seed: string;
  nextId: number;
  width: number;
  height: number;
  foods: Food[];
  ecology?: EcologyState;
}
