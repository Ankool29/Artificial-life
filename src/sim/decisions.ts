import { hunger } from "./metabolism";
import { random } from "./random";
import type { Action, Observation, World } from "./types";

export function decide(world: World, seen: readonly Observation[]): Action {
  const c = world.creature;
  const drive = hunger(c.metabolism);
  if (drive > 0.18 && c.metabolism.stomach < 25 && seen.length > 0) {
    const explore = random(world) < c.genome.genes.exploration;
    if (explore)
      return {
        kind: "seek",
        foodId: seen[Math.floor(random(world) * seen.length)]!.id,
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
    if (best) return { kind: "seek", foodId: best.id };
  }
  if (drive < 0.15 || (c.metabolism.stomach > 8 && random(world) < 0.7))
    return { kind: "rest" };
  return {
    kind: "wander",
    target: {
      x: 30 + random(world) * (world.width - 60),
      y: 35 + random(world) * (world.height - 70),
    },
  };
}
