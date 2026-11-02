import { CUES, type Brain, type Cue } from "./types";

export function createBrain(): Brain {
  return Object.fromEntries(
    CUES.map((cue) => [cue, { value: 0, meals: 0, lastReward: 0 }]),
  ) as Brain;
}
// Rescorla–Wagner / delta rule. All cues start with the same neutral prior.
export function reinforce(
  brain: Brain,
  cue: Cue,
  reward: number,
  rate: number,
): void {
  const memory = brain[cue];
  memory.value += rate * (reward - memory.value);
  memory.lastReward = reward;
  memory.meals++;
}
