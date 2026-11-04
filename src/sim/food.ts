import { clamp, MAX_FOODS, type Cue } from "./types";
import type { EcologyWorld } from "./ecology-types";

export const FOOD_RECIPES: Record<
  Cue,
  { nutrients: number; toxins: number; mass: number }
> = {
  amber: { nutrients: 28, toxins: 0, mass: 10 },
  blue: { nutrients: 15, toxins: 0, mass: 10 },
  rose: { nutrients: 5, toxins: 10, mass: 10 },
};

export function addFood(
  world: EcologyWorld,
  cue: Cue,
  x: number,
  y: number,
): boolean {
  if (
    world.foods.length >= MAX_FOODS ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return false;
  world.foods.push({
    id: world.nextId++,
    cue,
    x: clamp(x, 22, world.width - 22),
    y: clamp(y, 22, world.height - 22),
    ...FOOD_RECIPES[cue],
  });
  return true;
}
