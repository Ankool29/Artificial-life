import type { Action, Cue, Food, World, Brain } from "../sim/types";
import type { BodyState, DecisionTrace } from "../sim/diagnostics";
import type { PlantStage } from "../sim/ecology-types";
import type {
  EcologicalTrace,
  PhysiologyTrace,
} from "../sim/ecological-diagnostics";
export type {
  EcologicalTrace,
  PhysiologyTrace,
} from "../sim/ecological-diagnostics";
export interface FoodAvailability {
  present: Record<Cue, number>;
  visible: {
    id: number;
    cue: Cue;
    distance: number;
    contact: boolean;
    stomachFits: boolean;
    minimumTravelSeconds: number;
  }[];
  visibleCount: number;
  visibleDetailsTruncated: boolean;
  physicalCount: number;
  presentNutrients: number;
  contactAndFits: number;
  nearestPhysical: number | null;
  presence: boolean;
}
export interface EcologicalSample {
  tick: number;
  segment: number;
  ecologicalTime: number | null;
  plants: Record<Cue, number>;
  stages: Record<PlantStage, number>;
  stagesByVariety: Record<Cue, Record<PlantStage, number>>;
  fruits: Record<Cue, number>;
  soilWater: number;
  soilMinerals: number;
  cells: Record<Cue, number>[];
  counters: Record<string, number>;
  observedDynamics: Record<
    Cue,
    { germinations: number; births: number; deaths: number }
  >;
  observedProduced: Record<Cue, number>;
  observedConsumed: Record<Cue, number>;
}
export interface LifeSample {
  tick: number;
  segment: number;
  body: BodyState;
  hunger: number;
  action: Action;
  x: number;
  y: number;
  alive: boolean;
  present: boolean;
  food: FoodAvailability;
  fluxes: PhysiologyTrace;
  absorbed: Record<Cue, { nutrients: number; energy: number; toxins: number }>;
}
export interface EcologicalEntry {
  tick: number;
  segment: number;
  kind: "capture" | "plant" | "extinction" | "food" | "death" | "intervention";
  text: string;
  trace?: EcologicalTrace;
}
export interface IngestionRecord {
  tick: number;
  segment: number;
  food: Food;
  plantFruit: boolean;
}
export interface ExecutionRecord {
  tick: number;
  segment: number;
  action: Action;
  moving: boolean;
  distance: number;
}
export interface DeathReport {
  version: 1;
  tick: number;
  coverageStart: number;
  gaps: number;
  provenance: "recorded" | "loaded-dead";
  final: LifeSample;
  ecosystem: EcologicalSample;
  physiology: PhysiologyTrace | null;
  foodAssociations: Brain;
  lastDecision: DecisionTrace | null;
  recentTotals: {
    firstSampleTick: number;
    lastSampleTick: number;
    sampleCount: number;
    absorbed: LifeSample["absorbed"];
    fluxes: Pick<
      PhysiologyTrace,
      "energySpent" | "toxinDamage" | "starvationDamage" | "recovery"
    >;
  };
  samples: LifeSample[];
  ingestions: IngestionRecord[];
  decisions: {
    tick: number;
    segment: number;
    trace: Pick<
      DecisionTrace,
      "chosen" | "branch" | "foodPolicy" | "foods" | "motivations"
    >;
  }[];
  executions: ExecutionRecord[];
  facts: string[];
  hypotheses: string[];
  limitations: string[];
}
export interface EcologicalSession {
  revision: number;
  startTick: number;
  segment: number;
  gaps: number;
  dropped: Record<string, number>;
  ecological: EcologicalSample[];
  life: LifeSample[];
  events: EcologicalEntry[];
  ingestions: IngestionRecord[];
  decisions: {
    tick: number;
    segment: number;
    trace: Pick<
      DecisionTrace,
      "chosen" | "branch" | "foodPolicy" | "foods" | "motivations"
    >;
  }[];
  executions: ExecutionRecord[];
  produced: Record<Cue, number>;
  consumed: Record<Cue, number>;
  mortalityFactors: Record<Cue, Record<string, number>>;
  deaths: Record<Cue, number>;
  germinations: Record<Cue, number>;
  births: Record<Cue, number>;
  death?: DeathReport;
}
export interface WorldProfile {
  id: string;
  world: World;
}
