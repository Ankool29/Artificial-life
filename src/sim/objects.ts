import {
  clamp,
  MAX_OBJECTS,
  type InteractiveObject,
  type ObjectCue,
  type ObjectEffects,
  type World,
} from "./types";

// These are world physics, never innate preferences. Decisions cannot read them.
export const OBJECT_RECIPES: Record<ObjectCue, ObjectEffects> = {
  chime: { stimulation: 32, fatigue: 8, stress: -6, energy: -1 },
  moss: { stimulation: 8, fatigue: -30, stress: -22, energy: 0 },
  prism: { stimulation: 36, fatigue: 18, stress: 28, energy: -3 },
};

export function addObject(
  world: World,
  cue: ObjectCue,
  x: number,
  y: number,
): boolean {
  if (
    world.objects.length >= MAX_OBJECTS ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return false;
  world.objects.push({
    id: world.nextId++,
    cue,
    x: clamp(x, 28, world.width - 28),
    y: clamp(y, 28, world.height - 28),
    effects: { ...OBJECT_RECIPES[cue] },
    availableAt: 0,
  });
  return true;
}

// A removed target is safely resolved on the next tick, including partial learning.
export function removeObject(
  world: World,
  id: InteractiveObject["id"],
): boolean {
  const index = world.objects.findIndex((object) => object.id === id);
  if (index < 0) return false;
  world.objects.splice(index, 1);
  return true;
}
