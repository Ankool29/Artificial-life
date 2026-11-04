import { CUES, MAX_FOODS, type World } from "./types";
import { FOOD_RECIPES } from "./food";
import {
  ecologicalStocks,
  FRUIT_LIFETIME,
  MAX_LITTER_ENERGY,
  MAX_LITTER_MINERALS,
} from "./ecology";
import {
  MAX_PLANTS,
  PLANT_STAGES,
  SOIL_CELLS,
  ECOLOGY_INTERVAL,
  type EcologyState,
} from "./ecology-types";
const obj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const n = (x: unknown, a: number, b: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= a && x <= b;
const int = (x: unknown, a: number, b: number): x is number =>
  n(x, a, b) && Number.isInteger(x);
const array = (x: unknown, max: number): x is unknown[] =>
  Array.isArray(x) && x.length <= max;

export function validEcology(raw: unknown, world: World): boolean {
  if (
    !obj(raw) ||
    raw.version !== 1 ||
    !int(raw.rng, 0, 0xffffffff) ||
    !int(raw.phase, 0, ECOLOGY_INTERVAL - 1) ||
    !int(raw.time, 0, 1e10) ||
    typeof raw.creaturePresent !== "boolean" ||
    !obj(raw.settings) ||
    !n(raw.settings.light, 0, 1.5) ||
    !n(raw.settings.waterInput, 0, 0.5) ||
    !n(raw.settings.mineralInput, 0, 0.05) ||
    !array(raw.soil, SOIL_CELLS) ||
    raw.soil.length !== SOIL_CELLS ||
    !array(raw.plants, MAX_PLANTS) ||
    !array(raw.fruits, MAX_FOODS) ||
    !obj(raw.budgets) ||
    !obj(raw.counters)
  )
    return false;
  if (
    !raw.soil.every(
      (c) =>
        obj(c) &&
        n(c.water, 0, 100) &&
        n(c.minerals, 0, 40) &&
        n(c.litterEnergy, 0, MAX_LITTER_ENERGY) &&
        n(c.litterMinerals, 0, MAX_LITTER_MINERALS),
    )
  )
    return false;
  const id = (x: unknown): x is number => int(x, 1, world.nextId - 1);
  if (
    !raw.plants.every((p) => {
      if (
        !obj(p) ||
        !id(p.id) ||
        !CUES.includes(p.variety as (typeof CUES)[number]) ||
        !n(p.x, 30, 570) ||
        !n(p.y, 30, 650) ||
        !int(p.age, 0, raw.time as number) ||
        !int(p.stageAge, 0, p.age) ||
        !PLANT_STAGES.includes(p.stage as (typeof PLANT_STAGES)[number]) ||
        !n(p.development, 0, 1) ||
        !n(p.energy, 0, 80.00000001) ||
        !n(p.biomass, 0, 40.00000001) ||
        !n(p.water, 0, 8.00000001) ||
        !n(p.minerals, 0, 4) ||
        !n(p.health, 0, 100) ||
        !int(p.longevity, 720, 1080) ||
        !int(p.seedTimer, 0, 120) ||
        !int(p.fruitsProduced, 0, 1e10) ||
        !int(p.seedsProduced, 0, 1e10)
      )
        return false;
      if (p.stage === "dead")
        return (
          p.health === 0 &&
          p.energy === 0 &&
          p.biomass === 0 &&
          p.water === 0 &&
          p.minerals === 0 &&
          p.bud === null &&
          p.stageAge < 45
        );
      if (p.health === 0) return false;
      if (
        (p.stage === "seed" || p.stage === "germinating") &&
        (p.biomass !== 0 || p.bud !== null)
      )
        return false;
      if (
        ["mature", "fruiting", "senescent"].includes(p.stage as string) &&
        (p.biomass as number) < 28
      )
        return false;
      if (p.bud !== null) {
        const recipe = FOOD_RECIPES[p.variety as keyof typeof FOOD_RECIPES];
        if (
          !obj(p.bud) ||
          !n(p.bud.remaining, 0, 20) ||
          p.bud.energy !== recipe.nutrients ||
          p.bud.minerals !== 0.4 ||
          p.bud.water !== 0.6 ||
          (p.stage !== "fruiting" && p.stage !== "senescent")
        )
          return false;
      } else if (p.stage === "fruiting") return false;
      return true;
    })
  )
    return false;
  const ids = [
    ...world.foods.map((f) => f.id),
    ...world.objects.map((o) => o.id),
    ...(world.instrumental?.devices.map((d) => d.id) ?? []),
    ...raw.plants.map((p) => (p as { id: number }).id),
  ];
  if (new Set(ids).size !== ids.length) return false;
  if (
    !raw.fruits.every((f) => {
      if (
        !obj(f) ||
        !id(f.foodId) ||
        !id(f.plantId) ||
        !int(f.cell, 0, SOIL_CELLS - 1) ||
        !int(
          f.expiresAt,
          (raw.time as number) + 1,
          (raw.time as number) + FRUIT_LIFETIME,
        ) ||
        !n(f.energy, 0, 100) ||
        f.minerals !== 0.4 ||
        f.water !== 0.6
      )
        return false;
      const food = world.foods.find((food) => food.id === f.foodId);
      if (!food) return false;
      const recipe = FOOD_RECIPES[food.cue];
      return (
        food.mass === recipe.mass &&
        food.nutrients === recipe.nutrients &&
        food.toxins === recipe.toxins &&
        f.energy === food.nutrients
      );
    })
  )
    return false;
  if (
    new Set(raw.fruits.map((f) => (f as { foodId: number }).foodId)).size !==
    raw.fruits.length
  )
    return false;
  for (const key of ["water", "minerals", "energy"]) {
    const b = raw.budgets[key];
    if (!obj(b) || ![b.initial, b.input, b.output].every((v) => n(v, 0, 1e12)))
      return false;
  }
  for (const key of [
    "planted",
    "germinated",
    "born",
    "died",
    "produced",
    "consumed",
    "decayed",
    "removedFruits",
    "uprooted",
  ])
    if (!int(raw.counters[key], 0, 1e10)) return false;
  if (
    raw.counters.produced !==
    raw.fruits.length +
      (raw.counters.consumed as number) +
      (raw.counters.decayed as number) +
      (raw.counters.removedFruits as number)
  )
    return false;
  const e = raw as unknown as EcologyState,
    stocks = ecologicalStocks(e);
  for (const key of ["water", "minerals", "energy"] as const) {
    const b = e.budgets[key];
    if (
      Math.abs(b.initial + b.input - b.output - stocks[key]) >
      1e-4 + 1e-12 * (b.initial + b.input + b.output)
    )
      return false;
  }
  return true;
}
