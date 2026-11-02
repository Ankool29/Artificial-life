import { hunger } from "./metabolism";
import { random } from "./random";
import { motivations } from "./curiosity";
import {
  clamp,
  type Action,
  type Observation,
  type ObjectObservation,
  type World,
} from "./types";

// Food selection and its learned values remain the original policy.
function decideFood(
  world: World,
  seen: readonly Observation[],
): { action: Extract<Action, { kind: "seek" }>; score: number } | undefined {
  const c = world.creature;
  const drive = hunger(c.metabolism);
  if (drive > 0.18 && c.metabolism.stomach < 25 && seen.length > 0) {
    const explore = random(world) < c.genome.genes.exploration;
    if (explore)
      return {
        action: {
          kind: "seek",
          foodId: seen[Math.floor(random(world) * seen.length)]!.id,
        },
        // A deliberate taste must remain possible even for a negative association.
        score: drive * 1.25,
      };
    let best: Observation | undefined;
    // Same evaluation for every cue. A negative learned value can outweigh hunger.
    let bestScore = 0;
    for (const food of seen) {
      const score =
        drive * 1.25 +
        c.brain[food.cue].value -
        (food.distance / c.genome.genes.vision) * 0.22;
      if (score > bestScore) {
        best = food;
        bestScore = score;
      }
    }
    if (best)
      return { action: { kind: "seek", foodId: best.id }, score: bestScore };
  }
  return undefined;
}

export function decide(
  world: World,
  seen: readonly Observation[],
  objects: readonly ObjectObservation[] = [],
): Action {
  const c = world.creature;
  const drives = motivations(c);
  const food = decideFood(world, seen);
  // Emergency hunger keeps the learned food choice; curiosity cannot displace it.
  if (food && drives.hunger > 0.65) return food.action;
  const restScore = drives.rest * 0.8 + drives.comfort * 0.65;
  let best: Action = { kind: "rest" };
  let bestScore = restScore;
  if (food) {
    // At ordinary fatigue, preserve feeding rather than compete with idle rest.
    if (food.score > bestScore) {
      bestScore = food.score;
      best = food.action;
    }
  }
  for (const object of objects) {
    const memory = c.objectBrain[object.cue];
    // Predict only changes the current internal state can actually accommodate.
    const e = {
      stimulation:
        clamp(c.needs.stimulation + memory.expected.stimulation, 0, 100) -
        c.needs.stimulation,
      fatigue:
        clamp(c.needs.fatigue + memory.expected.fatigue, 0, 100) -
        c.needs.fatigue,
      stress:
        clamp(c.needs.stress + memory.expected.stress, 0, 100) - c.needs.stress,
      energy:
        clamp(c.metabolism.energy + memory.expected.energy, 0, 100) -
        c.metabolism.energy,
    };
    const novelty = 1 / Math.sqrt(1 + memory.interactions);
    const score =
      drives.curiosity * (0.25 + novelty * 0.5) +
      (drives.curiosity * e.stimulation) / 40 -
      ((0.25 + drives.rest) * e.fatigue) / 30 -
      ((0.3 + drives.comfort) * e.stress) / 30 +
      (drives.hunger * e.energy) / 25 +
      memory.value * 0.15 * drives.curiosity -
      (object.distance / c.genome.genes.vision) * 0.16;
    if (score > bestScore) {
      bestScore = score;
      best = { kind: "inspect", objectId: object.id };
    }
  }
  if (best.kind !== "rest") return best;
  if (
    drives.curiosity < 0.25 ||
    drives.rest > 0.6 ||
    drives.comfort > 0.6 ||
    c.metabolism.stomach > 8
  )
    return best;
  return {
    kind: "wander",
    target: {
      x: 30 + random(world) * (world.width - 60),
      y: 35 + random(world) * (world.height - 70),
    },
  };
}
