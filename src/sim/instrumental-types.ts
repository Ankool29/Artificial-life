import { MAX_FOODS, type Cue, type Point } from "./types";

export const MAX_DEVICES = 4;
export const MAX_TRANSITIONS = 16;
export const MAX_EPISODES = 12;
// A resource may outlive its action. Budget one trace per physical food slot.
export const MAX_LINKS = MAX_FOODS;
// Partial meals can overlap: stomach mass does not imply four bolus slots.
// Rich evidence budget; unknown ledger slots follow biological boluses without
// blocking ingestion. Digestion and ingestion equations remain unchanged.
export const MAX_GUT_CREDITS = MAX_FOODS;
export const MAX_HYPOTHESES = MAX_DEVICES;
export const EVENT_WINDOW = 50;
// Legacy name retained for API compatibility: now bounds attention/suppression,
// not the lifetime of identity evidence or digestion credit.
export const CREDIT_WINDOW = 900;
export const CREDIT_TAU = 300;
export type Situation = "clear" | "resource-visible";
export interface Device extends Point {
  id: number;
  appearance: "lever";
  kind: "dispenser";
  stock: number;
  capacity: number;
  readyAt: number;
  rechargeTicks: number;
  delayTicks: number;
  pressedUntil: number;
  pendingAt: number | null;
  recipe: { cue: Cue; mass: number; nutrients: number; toxins: number };
}
// The brain receives this affordance, never Device or its physical internals.
export interface ActuatorObservation extends Point {
  id: number;
  appearance: "lever";
  action: "press";
  distance: number;
}
export interface TransitionMemory {
  targetId: number;
  action: "press";
  situation: Situation;
  attempts: number;
  observations: number;
  successes: number;
  probability: number;
  value: number;
  outcomes: number;
  lastReward: number;
  lastTick: number;
  partialOutcomes?: number;
}
export interface ActionEpisode extends Point {
  id: number;
  targetId: number;
  situation: Situation;
  tick: number;
  covered: boolean;
  eventSeen: boolean;
  conflicted?: boolean;
}
// Perceptual evidence only: no physical producer, recipe, stock or cooldown.
export interface CreditHypothesis {
  episodeId: number;
  targetId: number;
  situation: Situation;
  actionTick: number;
}
export interface Attribution {
  hypotheses?: CreditHypothesis[];
  // null means the appearance time was not retained in an old save.
  observedTick?: number | null;
  bound?: boolean;
  conflicted?: boolean;
}
export interface ResourceLink extends Attribution {
  foodId: number;
  episodeId: number | null;
  tick: number;
}
export interface GutCredit extends Attribution {
  episodeId: number | null;
  foodId: number | null;
  settled?: boolean;
}
export interface InstrumentalState {
  version: 1 | 2;
  learning: boolean;
  devices: Device[];
  memories: TransitionMemory[];
  episodes: ActionEpisode[];
  links: ResourceLink[];
  gut: GutCredit[];
  seenFoods: number[];
  nextEpisode: number;
  uncertainUntil?: number;
}
export type PhysicalEvent =
  | { kind: "motion"; tick: number; targetId: number; x: number; y: number }
  | {
      kind: "resource";
      tick: number;
      targetId: number;
      foodId: number;
      cue: Cue;
      x: number;
      y: number;
    };
// Resource appearance deliberately omits its physical source targetId.
export type PerceivedChange =
  | { kind: "motion"; tick: number; targetId: number; x: number; y: number }
  | {
      kind: "resource";
      tick: number;
      foodId: number;
      cue: Cue;
      x: number;
      y: number;
    };
export interface InstrumentalTrace {
  phase:
    | "attempt"
    | "production"
    | "perceived"
    | "transition"
    | "credit"
    | "attribution"
    | "score";
  targetId?: number;
  foodId?: number;
  episodeId?: number;
  situation?: Situation;
  event?:
    | "motion"
    | "resource"
    | "absence"
    | "unobserved"
    | "ambiguous"
    | "resolved"
    | "unattributed"
    | "memory-limit";
  hypotheses?: CreditHypothesis[];
  // Fraction of compatible own actions, not a calibrated causal probability.
  confidence?: number;
  outcome?: "completed" | "terminal-partial";
  probability?: number;
  beforeProbability?: number;
  value?: number;
  beforeValue?: number;
  reward?: number;
  eligibility?: number;
  score?: number;
  learned?: boolean;
}
