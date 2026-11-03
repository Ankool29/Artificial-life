import type {
  Action,
  Association,
  Cue,
  Food,
  Needs,
  ObjectAssociation,
  ObjectEffects,
  Observation,
  ObjectObservation,
  ObjectCue,
  Creature,
} from "./types";

// Diagnostic payloads only: never part of World, genomes or saved profiles.
export interface BodyState extends Needs {
  energy: number;
  stomach: number;
  toxins: number;
  health: number;
}
export const bodyState = (c: Creature): BodyState => ({
  energy: c.metabolism.energy,
  stomach: c.metabolism.stomach,
  toxins: c.metabolism.toxins,
  health: c.metabolism.health,
  ...c.needs,
});
export interface CandidateScore {
  stage: "food" | "arbitration";
  action: Action;
  score: number;
  association?: { cue: Cue | ObjectCue; value: number; experiences: number };
  predictedEffects?: ObjectEffects;
}
export interface DecisionTrace {
  tick: number;
  needs: Needs;
  energy: number;
  stomach: number;
  motivations: {
    hunger: number;
    curiosity: number;
    rest: number;
    comfort: number;
  };
  foods: Observation[];
  objects: ObjectObservation[];
  candidates: CandidateScore[];
  foodPolicy: "ineligible" | "exploration" | "scored";
  branch: "urgent-food" | "best-score" | "rest-gate" | "wander";
  chosen: Action;
}
export interface AbsorptionTrace {
  slot: number;
  cue: Cue;
  energy: number;
  health: number;
  absorbedToxin: number;
  completed: boolean;
}
export type DiagnosticEvent = { tick: number } & (
  | { kind: "decision"; trace: DecisionTrace }
  | { kind: "ingestion"; food: Food }
  | { kind: "absorption"; trace: AbsorptionTrace }
  | {
      kind: "food-learning";
      cue: Cue;
      before: Association;
      after: Association;
      reward: number;
      rate: number;
    }
  | { kind: "interaction-start"; objectId: number; cue: ObjectCue }
  | {
      kind: "object-learning";
      objectId: number;
      cue: ObjectCue;
      changes: ObjectEffects;
      before: ObjectAssociation;
      after: ObjectAssociation;
      reward: number;
      rate: number;
    }
  | {
      kind: "state";
      body: BodyState;
      drives: DecisionTrace["motivations"];
      action: Action;
      alive: boolean;
    }
);
export type SimulationObserver = (event: DiagnosticEvent) => void;
