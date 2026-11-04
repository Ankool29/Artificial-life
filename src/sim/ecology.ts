import { clamp, CUES, type Cue } from "./types";
import { hashSeed, random } from "./random";
import { addFood, FOOD_RECIPES } from "./food";
import {
  ECOLOGY_INTERVAL,
  MAX_PLANTS,
  SOIL_CELLS,
  SOIL_SIDE,
  type EcologySettings,
  type EcologyState,
  type EcologyWorld,
  type Plant,
  type SoilCell,
} from "./ecology-types";

export const ECOLOGY_DEFAULTS: EcologySettings = {
  light: 1,
  waterInput: 0.14,
  mineralInput: 0.0015,
};
export const SEED = { energy: 4, minerals: 0.2, water: 0.25 } as const;
export const FRUIT_SECONDS = 20;
export const FRUIT_LIFETIME = 180;
export const FRUITS_PER_PLANT = 2;
export const MAX_LITTER_ENERGY = 1000;
export const MAX_LITTER_MINERALS = 100;

export function soilIndex(x: number, y: number): number {
  return (
    Math.max(0, Math.min(SOIL_SIDE - 1, Math.floor((y / 680) * SOIL_SIDE))) *
      SOIL_SIDE +
    Math.max(0, Math.min(SOIL_SIDE - 1, Math.floor((x / 600) * SOIL_SIDE)))
  );
}
function addWater(e: EcologyState, cell: SoilCell, amount: number): void {
  const overflow = Math.max(0, cell.water + amount - 100);
  cell.water = Math.min(100, cell.water + amount);
  e.budgets.water.output += overflow;
}
function addMinerals(e: EcologyState, cell: SoilCell, amount: number): void {
  const overflow = Math.max(0, cell.minerals + amount - 40);
  cell.minerals = Math.min(40, cell.minerals + amount);
  e.budgets.minerals.output += overflow;
}
function litter(
  e: EcologyState,
  cell: SoilCell,
  energy: number,
  minerals: number,
): void {
  e.budgets.energy.output += Math.max(
    0,
    cell.litterEnergy + energy - MAX_LITTER_ENERGY,
  );
  e.budgets.minerals.output += Math.max(
    0,
    cell.litterMinerals + minerals - MAX_LITTER_MINERALS,
  );
  cell.litterEnergy = Math.min(MAX_LITTER_ENERGY, cell.litterEnergy + energy);
  cell.litterMinerals = Math.min(
    MAX_LITTER_MINERALS,
    cell.litterMinerals + minerals,
  );
}
export function enableEcology(
  world: EcologyWorld,
  options: Partial<EcologySettings> & {
    founders?: boolean;
    water?: number;
    minerals?: number;
    creaturePresent?: boolean;
  } = {},
): EcologyState {
  if (world.ecology) return world.ecology;
  const water = clamp(options.water ?? 60, 0, 100),
    minerals = clamp(options.minerals ?? 18, 0, 40);
  const e: EcologyState = {
    version: 1,
    rng: hashSeed(`ecology-v1:${world.seed}`),
    phase: 0,
    time: 0,
    creaturePresent: options.creaturePresent ?? true,
    settings: {
      light: clamp(options.light ?? ECOLOGY_DEFAULTS.light, 0, 1.5),
      waterInput: clamp(
        options.waterInput ?? ECOLOGY_DEFAULTS.waterInput,
        0,
        0.5,
      ),
      mineralInput: clamp(
        options.mineralInput ?? ECOLOGY_DEFAULTS.mineralInput,
        0,
        0.05,
      ),
    },
    soil: Array.from({ length: SOIL_CELLS }, () => ({
      water,
      minerals,
      litterEnergy: 0,
      litterMinerals: 0,
    })),
    plants: [],
    fruits: [],
    budgets: {
      water: { initial: water * SOIL_CELLS, input: 0, output: 0 },
      minerals: { initial: minerals * SOIL_CELLS, input: 0, output: 0 },
      energy: { initial: 0, input: 0, output: 0 },
    },
    counters: {
      planted: 0,
      germinated: 0,
      born: 0,
      died: 0,
      produced: 0,
      consumed: 0,
      decayed: 0,
      removedFruits: 0,
      uprooted: 0,
    },
  };
  world.ecology = e;
  if (options.founders !== false)
    for (let i = 0; i < 9; i++) {
      plantSeed(
        world,
        CUES[i % 3]!,
        170 + (i % 3) * 130 + (random(e) - 0.5) * 24,
        210 + Math.floor(i / 3) * 130 + (random(e) - 0.5) * 24,
      );
    }
  return e;
}
function seed(world: EcologyWorld, variety: Cue, x: number, y: number): Plant {
  const e = world.ecology!;
  const p: Plant = {
    id: world.nextId++,
    variety,
    x: clamp(x, 30, 570),
    y: clamp(y, 30, 650),
    age: 0,
    stage: "seed",
    stageAge: 0,
    development: 0,
    energy: SEED.energy,
    biomass: 0,
    water: SEED.water,
    minerals: SEED.minerals,
    health: 100,
    longevity: 720 + Math.floor(random(e) * 361),
    seedTimer: 120,
    bud: null,
    fruitsProduced: 0,
    seedsProduced: 0,
  };
  e.plants.push(p);
  return p;
}
export function plantSeed(
  world: EcologyWorld,
  variety: Cue,
  x: number,
  y: number,
): boolean {
  const e = world.ecology;
  if (
    !e ||
    !CUES.includes(variety) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    e.plants.length >= MAX_PLANTS
  )
    return false;
  seed(world, variety, x, y);
  e.budgets.energy.input += SEED.energy;
  e.budgets.minerals.input += SEED.minerals;
  e.budgets.water.input += SEED.water;
  e.counters.planted++;
  return true;
}
export function uprootPlant(world: EcologyWorld, id: number): boolean {
  const e = world.ecology,
    p = e?.plants.find((p) => p.id === id);
  if (!e || !p) return false;
  e.budgets.energy.output += p.energy + p.biomass + (p.bud?.energy ?? 0);
  e.budgets.minerals.output += p.minerals + (p.bud?.minerals ?? 0);
  e.budgets.water.output += p.water + (p.bud?.water ?? 0);
  e.plants = e.plants.filter((p) => p.id !== id);
  e.counters.uprooted++;
  return true;
}
export function amendSoil(
  world: EcologyWorld,
  index: number,
  water = 0,
  minerals = 0,
): boolean {
  const e = world.ecology,
    cell = e?.soil[index];
  if (
    !e ||
    !cell ||
    !Number.isInteger(index) ||
    !Number.isFinite(water) ||
    !Number.isFinite(minerals) ||
    water < 0 ||
    minerals < 0 ||
    water > 100 ||
    minerals > 40
  )
    return false;
  e.budgets.water.input += water;
  e.budgets.minerals.input += minerals;
  addWater(e, cell, water);
  addMinerals(e, cell, minerals);
  return true;
}
export function configureEcology(
  world: EcologyWorld,
  changes: Partial<EcologySettings>,
): boolean {
  const e = world.ecology;
  if (!e) return false;
  const next = { ...e.settings, ...changes };
  if (
    !Number.isFinite(next.light) ||
    next.light < 0 ||
    next.light > 1.5 ||
    !Number.isFinite(next.waterInput) ||
    next.waterInput < 0 ||
    next.waterInput > 0.5 ||
    !Number.isFinite(next.mineralInput) ||
    next.mineralInput < 0 ||
    next.mineralInput > 0.05
  )
    return false;
  e.settings = next;
  return true;
}
export function recordFruitIngestion(
  world: EcologyWorld,
  foodId: number,
): void {
  const e = world.ecology,
    f = e?.fruits.find((f) => f.foodId === foodId);
  if (!e || !f) return;
  e.budgets.energy.output += f.energy;
  e.budgets.minerals.output += f.minerals;
  e.budgets.water.output += f.water;
  e.fruits = e.fruits.filter((f) => f.foodId !== foodId);
  e.counters.consumed++;
}
function stage(p: Plant, next: Plant["stage"]): void {
  if (p.stage !== next) {
    p.stage = next;
    p.stageAge = 0;
  }
}
function die(e: EcologyState, p: Plant): void {
  const cell = e.soil[soilIndex(p.x, p.y)]!;
  litter(
    e,
    cell,
    p.energy + p.biomass + (p.bud?.energy ?? 0),
    p.minerals + (p.bud?.minerals ?? 0),
  );
  addWater(e, cell, p.water + (p.bud?.water ?? 0));
  p.energy = p.biomass = p.minerals = p.water = p.health = 0;
  p.bud = null;
  stage(p, "dead");
  e.counters.died++;
}

// This physical boundary has no Creature, brain, hunger, genes or action input.
// The ecological RNG is separate; all fluxes below use one second per update.
export function updateEcology(world: EcologyWorld): void {
  const e = world.ecology;
  if (!e || ++e.phase < ECOLOGY_INTERVAL) return;
  e.phase = 0;
  e.time++;
  const liveFoods = new Set(world.foods.map((f) => f.id));
  const retained = [];
  for (const f of e.fruits) {
    if (!liveFoods.has(f.foodId)) {
      // Non-ingestion external removal: exported, never counted as consumption.
      e.budgets.energy.output += f.energy;
      e.budgets.minerals.output += f.minerals;
      e.budgets.water.output += f.water;
      e.counters.removedFruits++;
      continue;
    }
    if (e.time >= f.expiresAt) {
      world.foods = world.foods.filter((food) => food.id !== f.foodId);
      litter(e, e.soil[f.cell]!, f.energy, f.minerals);
      addWater(e, e.soil[f.cell]!, f.water);
      e.counters.decayed++;
      continue;
    }
    retained.push(f);
  }
  e.fruits = retained;
  for (const cell of e.soil) {
    e.budgets.water.input += e.settings.waterInput;
    e.budgets.minerals.input += e.settings.mineralInput;
    addWater(e, cell, e.settings.waterInput);
    addMinerals(e, cell, e.settings.mineralInput);
    const evaporation = Math.min(
      cell.water,
      (0.018 * e.settings.light * cell.water) / 100,
    );
    cell.water -= evaporation;
    e.budgets.water.output += evaporation;
    const decay = cell.litterEnergy * 0.01;
    cell.litterEnergy -= decay;
    e.budgets.energy.output += decay;
    const mineralized = Math.min(cell.litterMinerals, 0.02);
    cell.litterMinerals -= mineralized;
    addMinerals(e, cell, mineralized);
  }
  const active = e.plants.filter((p) => p.stage !== "dead");
  const groups = Array.from({ length: SOIL_CELLS }, () => [] as Plant[]);
  for (const p of active) groups[soilIndex(p.x, p.y)]!.push(p);
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!,
      cell = e.soil[i]!;
    const water = group.map((p) =>
      Math.max(0, Math.min(8 - p.water, 0.16 + p.biomass * 0.003)),
    );
    const minerals = group.map((p) =>
      Math.max(
        0,
        Math.min(
          0.04 * (0.25 + (0.75 * p.biomass) / 40),
          0.8 + p.biomass * 0.06 - p.minerals,
        ),
      ),
    );
    const totalW = water.reduce((a, b) => a + b, 0),
      totalM = minerals.reduce((a, b) => a + b, 0);
    const fractionW = totalW > 0 ? Math.min(1, cell.water / totalW) : 0;
    const fractionM = totalM > 0 ? Math.min(1, cell.minerals / totalM) : 0;
    group.forEach((p, j) => {
      const w = water[j]! * fractionW,
        n = minerals[j]! * fractionM;
      p.water += w;
      p.minerals += n;
      cell.water -= w;
      cell.minerals -= n;
    });
    // Only cancellation-level errors are snapped to zero; conservation tolerance is tested.
    cell.water = Math.max(0, cell.water);
    cell.minerals = Math.max(0, cell.minerals);
  }
  const canopy = groups.map((g) => g.reduce((n, p) => n + p.biomass / 40, 0));
  for (const p of [...e.plants]) {
    p.age++;
    p.stageAge++;
    if (p.stage === "dead") continue;
    const index = soilIndex(p.x, p.y);
    const light =
      e.settings.light /
      (1 + 0.3 * Math.max(0, canopy[index]! - p.biomass / 40));
    const hydration = clamp(p.water / 2),
      nutrition = clamp(p.minerals / (0.2 + 0.06 * p.biomass));
    const conditions = Math.min(1, light) * hydration * nutrition;
    const old = p.age >= p.longevity * 0.8;
    const leafy = p.stage !== "seed" && p.stage !== "germinating";
    const waterLoss = Math.min(
      p.water,
      leafy
        ? (0.012 + p.biomass * 0.0025) * (0.6 + 0.4 * e.settings.light)
        : 0.001,
    );
    p.water -= waterLoss;
    e.budgets.water.output += waterLoss;
    if (leafy) {
      const gain = Math.min(
        80 - p.energy,
        ((1.8 *
          (0.12 + p.biomass / 40) *
          light *
          hydration *
          nutrition *
          p.health) /
          100) *
          (old ? 0.55 : 1),
      );
      p.energy += gain;
      e.budgets.energy.input += gain;
    }
    const respiration = Math.min(
      p.energy,
      (leafy ? 0.015 + p.biomass * 0.004 : 0.004) * (old ? 1.3 : 1),
    );
    p.energy -= respiration;
    e.budgets.energy.output += respiration;
    const dormant = p.stage === "seed";
    const damage =
      (dormant
        ? p.age > 240
          ? 2
          : 0
        : (p.water < 0.5 ? 0.8 : 0) +
          (p.energy < 0.2 ? 0.7 : 0) +
          (nutrition < 0.15 ? 0.25 : 0)) + (p.age > p.longevity ? 2 : 0);
    p.health = clamp(
      p.health -
        damage +
        (!damage && leafy && conditions > 0.6 && p.energy > 5 ? 0.12 : 0),
      0,
      100,
    );
    if (p.health <= 0) {
      die(e, p);
      continue;
    }
    if (p.stage === "seed" && p.age >= 8 && p.water >= 1.2 && light >= 0.18)
      stage(p, "germinating");
    if (p.stage === "germinating") {
      const neighbors = active.filter(
        (other) =>
          other.id !== p.id && Math.hypot(other.x - p.x, other.y - p.y) < 22,
      ).length;
      p.development = Math.min(
        1,
        p.development + conditions / (20 * (1 + neighbors)),
      );
      if (p.development >= 1 && p.energy >= 1.5) {
        p.energy -= 1.5;
        p.biomass += 1.5;
        stage(p, "growing");
        e.counters.germinated++;
      }
    }
    if (leafy) {
      const growth = Math.max(
        0,
        Math.min(
          40 - p.biomass,
          p.energy - 3,
          (0.45 * conditions * p.health) / 100,
        ),
      );
      p.energy -= growth;
      p.biomass += growth;
      if (p.stage === "growing" && p.biomass >= 28 && p.age >= 80)
        stage(p, "mature");
    }
    const adult = p.biomass >= 28;
    if (!adult) continue;
    if (old) stage(p, "senescent");
    const groundCount = e.fruits.filter((f) => f.plantId === p.id).length;
    if (p.bud) {
      p.bud.remaining = Math.max(
        0,
        p.bud.remaining - (conditions * p.health) / 100,
      );
      if (p.bud.remaining === 0 && groundCount < FRUITS_PER_PLANT) {
        const angle = p.fruitsProduced * 2.399963 + p.x * 0.01 + p.y * 0.02;
        if (
          addFood(
            world,
            p.variety,
            p.x + Math.cos(angle) * 27,
            p.y + Math.sin(angle) * 27,
          )
        ) {
          e.fruits.push({
            foodId: world.foods.at(-1)!.id,
            plantId: p.id,
            cell: index,
            expiresAt: e.time + FRUIT_LIFETIME,
            energy: p.bud.energy,
            minerals: p.bud.minerals,
            water: p.bud.water,
          });
          p.bud = null;
          p.fruitsProduced++;
          e.counters.produced++;
          if (!old) stage(p, "mature");
        }
      }
    } else if (
      !old &&
      p.health >= 55 &&
      conditions >= 0.6 &&
      groundCount < FRUITS_PER_PLANT
    ) {
      const recipe = FOOD_RECIPES[p.variety],
        overhead = 5 + recipe.toxins * 0.8,
        cost = recipe.nutrients + overhead;
      if (p.energy >= cost + 3 && p.minerals >= 0.4 && p.water >= 1) {
        p.energy -= cost;
        p.minerals -= 0.4;
        p.water -= 0.6;
        e.budgets.energy.output += overhead;
        p.bud = {
          remaining: FRUIT_SECONDS,
          energy: recipe.nutrients,
          minerals: 0.4,
          water: 0.6,
        };
        stage(p, "fruiting");
      }
    }
    p.seedTimer = Math.max(0, p.seedTimer - 1);
    if (
      !old &&
      p.seedTimer === 0 &&
      p.health >= 65 &&
      conditions >= 0.6 &&
      p.energy >= 10 &&
      p.minerals >= 0.4 &&
      p.water >= 1 &&
      e.plants.length < MAX_PLANTS
    ) {
      const angle = random(e) * Math.PI * 2,
        radius = 20 + random(e) * 55;
      seed(
        world,
        p.variety,
        p.x + Math.cos(angle) * radius,
        p.y + Math.sin(angle) * radius,
      );
      p.energy -= SEED.energy + 1;
      p.minerals -= SEED.minerals;
      p.water -= SEED.water;
      e.budgets.energy.output++;
      p.seedsProduced++;
      p.seedTimer = 120;
      e.counters.born++;
    }
  }
  e.plants = e.plants.filter((p) => p.stage !== "dead" || p.stageAge < 45);
}

export function ecologicalStocks(e: EcologyState): {
  water: number;
  minerals: number;
  energy: number;
} {
  return {
    water:
      e.soil.reduce((n, c) => n + c.water, 0) +
      e.plants.reduce((n, p) => n + p.water + (p.bud?.water ?? 0), 0) +
      e.fruits.reduce((n, f) => n + f.water, 0),
    minerals:
      e.soil.reduce((n, c) => n + c.minerals + c.litterMinerals, 0) +
      e.plants.reduce((n, p) => n + p.minerals + (p.bud?.minerals ?? 0), 0) +
      e.fruits.reduce((n, f) => n + f.minerals, 0),
    energy:
      e.soil.reduce((n, c) => n + c.litterEnergy, 0) +
      e.plants.reduce(
        (n, p) => n + p.energy + p.biomass + (p.bud?.energy ?? 0),
        0,
      ) +
      e.fruits.reduce((n, f) => n + f.energy, 0),
  };
}
export function ecologySummary(world: EcologyWorld) {
  const e = world.ecology;
  if (!e) return null;
  const stocks = ecologicalStocks(e);
  return {
    time: e.time,
    population: e.plants.filter((p) => p.stage !== "dead").length,
    stages: Object.fromEntries(
      [
        "seed",
        "germinating",
        "growing",
        "mature",
        "fruiting",
        "senescent",
        "dead",
      ].map((s) => [s, e.plants.filter((p) => p.stage === s).length]),
    ),
    food: world.foods.length,
    plantFruits: e.fruits.length,
    soilWater: e.soil.reduce((n, c) => n + c.water, 0),
    soilMinerals: e.soil.reduce((n, c) => n + c.minerals, 0),
    stocks,
    residuals: Object.fromEntries(
      Object.entries(stocks).map(([key, value]) => {
        const b = e.budgets[key as keyof typeof stocks];
        return [key, b.initial + b.input - b.output - value];
      }),
    ),
    counters: { ...e.counters },
  };
}
