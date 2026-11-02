import { hunger } from "./metabolism";
import {
  clamp,
  DT,
  OBJECT_CUES,
  type Creature,
  type Needs,
  type ObjectBrain,
  type ObjectEffects,
  type InteractiveObject,
} from "./types";

export const INTERACTION_TICKS = 30;
export const OBJECT_COOLDOWN = 80;
export const zeroEffects = (): ObjectEffects => ({
  stimulation: 0,
  fatigue: 0,
  stress: 0,
  energy: 0,
});
export const createNeeds = (): Needs => ({
  stimulation: 40,
  fatigue: 10,
  stress: 5,
});
export function createObjectBrain(): ObjectBrain {
  return Object.fromEntries(
    OBJECT_CUES.map((cue) => [
      cue,
      { value: 0, interactions: 0, lastReward: 0, expected: zeroEffects() },
    ]),
  ) as ObjectBrain;
}

export function motivations(c: Creature): {
  hunger: number;
  curiosity: number;
  rest: number;
  comfort: number;
} {
  return {
    hunger: hunger(c.metabolism),
    curiosity: clamp(
      (1 - c.needs.stimulation / 100) *
        (1 - c.needs.fatigue / 120) *
        (1 - c.needs.stress / 140),
    ),
    rest: c.needs.fatigue / 100,
    comfort: c.needs.stress / 100,
  };
}

export function updateNeeds(c: Creature, moving: boolean): void {
  const resting = c.action.kind === "rest";
  c.needs.stimulation = clamp(
    c.needs.stimulation - (moving ? 0.16 : 0.36) * DT,
    0,
    100,
  );
  c.needs.fatigue = clamp(
    c.needs.fatigue + (moving ? 0.32 : resting ? -0.8 : 0.12) * DT,
    0,
    100,
  );
  c.needs.stress = clamp(c.needs.stress - (resting ? 0.25 : 0.12) * DT, 0, 100);
}

// Apply a physical dose and record measured changes after clamping. No cue is consulted.
export function applyObjectEffects(
  c: Creature,
  object: InteractiveObject,
  changes: ObjectEffects,
): void {
  for (const key of ["stimulation", "fatigue", "stress"] as const) {
    const before = c.needs[key];
    c.needs[key] = clamp(
      before + object.effects[key] / INTERACTION_TICKS,
      0,
      100,
    );
    changes[key] += c.needs[key] - before;
  }
  const beforeEnergy = c.metabolism.energy;
  c.metabolism.energy = clamp(
    beforeEnergy + object.effects.energy / INTERACTION_TICKS,
    0,
    100,
  );
  changes.energy += c.metabolism.energy - beforeEnergy;
}

export function learnInteraction(
  c: Creature,
  cue: InteractiveObject["cue"],
  changes: ObjectEffects,
): number {
  const memory = c.objectBrain[cue];
  const reward = clamp(
    changes.stimulation / 40 -
      changes.fatigue / 30 -
      changes.stress / 30 +
      changes.energy / 25,
    -2,
    2,
  );
  const rate = c.genome.genes.learningRate;
  memory.value += rate * (reward - memory.value);
  for (const key of Object.keys(changes) as (keyof ObjectEffects)[])
    memory.expected[key] += rate * (changes[key] - memory.expected[key]);
  memory.interactions++;
  memory.lastReward = reward;
  return reward;
}
