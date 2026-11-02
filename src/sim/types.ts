export type Cue = "amber" | "blue" | "rose";
export const CUES: readonly Cue[] = ["amber", "blue", "rose"];
export interface Point {
  x: number;
  y: number;
}
export interface Genome {
  version: 1;
  genes: {
    speed: number;
    vision: number;
    efficiency: number;
    detox: number;
    learningRate: number;
    exploration: number;
  };
}
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
export type Action =
  | { kind: "wander"; target: Point }
  | { kind: "seek"; foodId: number }
  | { kind: "rest" };
export interface Creature extends Point {
  genome: Genome;
  metabolism: Metabolism;
  brain: Brain;
  action: Action;
  heading: number;
  nextDecision: number;
  meals: number;
  alive: boolean;
}
export interface WorldEvent {
  tick: number;
  kind: "meal" | "learn" | "death";
  cue?: Cue;
  value?: number;
}
export interface World {
  version: 1;
  seed: string;
  rng: number;
  tick: number;
  nextId: number;
  width: number;
  height: number;
  creature: Creature;
  foods: Food[];
  events: WorldEvent[];
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
export const clamp = (n: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, n));
