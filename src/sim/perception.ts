import type {
  Creature,
  Food,
  Observation,
  ObjectObservation,
  World,
} from "./types";

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

export function perceiveObjects(world: World): ObjectObservation[] {
  const c = world.creature;
  return world.objects.flatMap((object) => {
    const distance = Math.hypot(object.x - c.x, object.y - c.y);
    return distance <= c.genome.genes.vision && object.availableAt <= world.tick
      ? [
          {
            id: object.id,
            cue: object.cue,
            x: object.x,
            y: object.y,
            distance,
            unknown: c.objectBrain[object.cue].interactions === 0,
          },
        ]
      : [];
  });
}
