import type { EcologyState } from "./ecology-types";
import type { InstrumentalState } from "./instrumental-types";
export type Cue = "amber" | "blue" | "rose";
export const CUES: readonly Cue[] = ["amber", "blue", "rose"];
export interface Point {
  x: number;
  y: number;
}
export interface BaseGenes {
  speed: number;
  vision: number;
  efficiency: number;
  detox: number;
  learningRate: number;
  exploration: number;
}
export interface PhysiologyGenes {
  metabolicRate: number;
  digestionRate: number;
  toxinSensitivity: number;
  stimulusGain: number;
  stressSensitivity: number;
  recoveryRate: number;
  stimulationDecay: number;
}
export type Genome =
  | { version: 1; genes: BaseGenes }
  | { version: 2; genes: BaseGenes & PhysiologyGenes };
export type ModernGenome = Extract<Genome, { version: 2 }>;
export interface Food extends Point {
  id: number;
  cue: Cue;
  nutrients: number;
  toxins: number;
  mass: number;
}
export interface Bolus {
  cue: Cue;
  remaining: number;
  nutrients: number;
  toxins: number;
  reward: number;
}
export interface Metabolism {
  energy: number;
  stomach: number;
  toxins: number;
  health: number;
  gut: Bolus[];
}
export interface Association {
  value: number;
  meals: number;
  lastReward: number;
}
export type Brain = Record<Cue, Association>;
export const OBJECT_CUES = ["chime", "moss", "prism"] as const;
export type ObjectCue = (typeof OBJECT_CUES)[number];
export interface Needs {
  stimulation: number;
  fatigue: number;
  stress: number;
}
export interface ObjectEffects {
  stimulation: number;
  fatigue: number;
  stress: number;
  energy: number;
}
export interface ObjectAssociation {
  value: number;
  interactions: number;
  lastReward: number;
  expected: ObjectEffects;
}
export type ObjectBrain = Record<ObjectCue, ObjectAssociation>;
export interface InteractiveObject extends Point {
  id: number;
  cue: ObjectCue;
  effects: ObjectEffects;
  availableAt: number;
}
export interface ObjectObservation extends Point {
  id: number;
  cue: ObjectCue;
  distance: number;
  unknown: boolean;
}
export type Action =
  | { kind: "wander"; target: Point }
  | { kind: "seek"; foodId: number }
  | { kind: "inspect"; objectId: number }
  | { kind: "use"; targetId: number }
  | {
      kind: "interact";
      objectId: number;
      cue: ObjectCue;
      remaining: number;
      changes: ObjectEffects;
    }
  | { kind: "rest" };
export interface Creature extends Point {
  genome: Genome;
  metabolism: Metabolism;
  brain: Brain;
  needs: Needs;
  objectBrain: ObjectBrain;
  action: Action;
  heading: number;
  nextDecision: number;
  meals: number;
  alive: boolean;
}
export interface WorldEvent {
  tick: number;
  kind: "meal" | "learn" | "death" | "interaction";
  cue?: Cue;
  objectCue?: ObjectCue;
  value?: number;
}
export interface World {
  version: 2;
  seed: string;
  rng: number;
  tick: number;
  nextId: number;
  width: number;
  height: number;
  creature: Creature;
  foods: Food[];
  objects: InteractiveObject[];
  events: WorldEvent[];
  instrumental?: InstrumentalState;
  ecology?: EcologyState;
}
export interface Observation {
  id: number;
  cue: Cue;
  distance: number;
  x: number;
  y: number;
}
export const DT = 0.1;
export const MAX_FOODS = 48;
export const MAX_OBJECTS = 12;
export const clamp = (n: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, n));
