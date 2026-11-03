import type { Cue, Point } from "./types";

export const MAX_DEVICES = 4;
export const MAX_TRANSITIONS = 16;
export const MAX_EPISODES = 12;
export const MAX_LINKS = 24;
export const EVENT_WINDOW = 50;
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
}
export interface ActionEpisode extends Point {
  id: number;
  targetId: number;
  situation: Situation;
  tick: number;
  covered: boolean;
  eventSeen: boolean;
}
export interface ResourceLink {
  foodId: number;
  episodeId: number;
  tick: number;
}
export interface GutCredit {
  episodeId: number | null;
  foodId: number | null;
}
export interface InstrumentalState {
  version: 1;
  learning: boolean;
  devices: Device[];
  memories: TransitionMemory[];
  episodes: ActionEpisode[];
  links: ResourceLink[];
  gut: GutCredit[];
  seenFoods: number[];
  nextEpisode: number;
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
    | "score";
  targetId?: number;
  foodId?: number;
  episodeId?: number;
  situation?: Situation;
  event?: "motion" | "resource" | "absence" | "unobserved" | "ambiguous";
  probability?: number;
  beforeProbability?: number;
  value?: number;
  beforeValue?: number;
  reward?: number;
  eligibility?: number;
  score?: number;
  learned?: boolean;
}
