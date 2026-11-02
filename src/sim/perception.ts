import type { Creature, Food, Observation } from "./types";

// Deliberately excludes nutrients/toxins: the decision system cannot cheat.
export function perceive(
  creature: Creature,
  foods: readonly Food[],
): Observation[] {
  const observations: Observation[] = [];
  const radius = creature.genome.genes.vision;
  for (const food of foods) {
    const distance = Math.hypot(food.x - creature.x, food.y - creature.y);
    if (distance <= radius)
      observations.push({
        id: food.id,
        cue: food.cue,
        distance,
        x: food.x,
        y: food.y,
      });
  }
  return observations;
}
