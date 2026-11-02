import { createBrain, reinforce } from "./brain";
import { decide } from "./decisions";
import { createGenome } from "./genome";
import { ingest, metabolize } from "./metabolism";
import { perceive } from "./perception";
import { hashSeed, random } from "./random";
import {
  clamp,
  CUES,
  DT,
  MAX_FOODS,
  type Cue,
  type Food,
  type World,
  type WorldEvent,
} from "./types";

export const FOOD_RECIPES: Record<
  Cue,
  { nutrients: number; toxins: number; mass: number }
> = {
  amber: { nutrients: 28, toxins: 0, mass: 10 },
  blue: { nutrients: 15, toxins: 0, mass: 10 },
  rose: { nutrients: 5, toxins: 10, mass: 10 },
};

export function addFood(world: World, cue: Cue, x: number, y: number): boolean {
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

export function createWorld(seed = "luma-01"): World {
  const source = { rng: hashSeed(seed) };
  const genome = createGenome(source);
  const world: World = {
    version: 1,
    seed,
    rng: source.rng,
    tick: 0,
    nextId: 1,
    width: 600,
    height: 680,
    foods: [],
    events: [],
    creature: {
      x: 300,
      y: 340,
      heading: 0,
      genome,
      metabolism: { energy: 52, stomach: 0, toxins: 0, health: 100, gut: [] },
      brain: createBrain(),
      action: { kind: "rest" },
      nextDecision: 0,
      meals: 0,
      alive: true,
    },
  };
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    const radius = 110 + random(world) * 100;
    addFood(
      world,
      CUES[i % CUES.length]!,
      300 + Math.cos(angle) * radius,
      340 + Math.sin(angle) * radius,
    );
  }
  return world;
}

function event(world: World, data: Omit<WorldEvent, "tick">): void {
  world.events.push({ tick: world.tick, ...data });
  if (world.events.length > 32) world.events.shift();
}

// Exactly one 100 ms tick, no clocks, DOM, storage, or Math.random in this module.
export function step(world: World): void {
  const c = world.creature;
  if (!c.alive) return;
  world.tick++;
  if (world.tick >= c.nextDecision) {
    c.action = decide(world, perceive(c, world.foods));
    c.nextDecision = world.tick + 20;
  }
  let target: Food | { x: number; y: number } | undefined;
  if (c.action.kind === "seek") {
    const id = c.action.foodId;
    target = world.foods.find((food) => food.id === id);
    if (!target) c.nextDecision = world.tick;
  } else if (c.action.kind === "wander") target = c.action.target;
  let moving = false;
  if (target) {
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 9) {
      moving = true;
      const stride = Math.min(distance, c.genome.genes.speed * DT);
      c.x += (dx / distance) * stride;
      c.y += (dy / distance) * stride;
      c.heading = Math.atan2(dy, dx);
    } else {
      if ("id" in target && ingest(c.metabolism, target)) {
        world.foods = world.foods.filter((food) => food.id !== target.id);
        c.meals++;
        event(world, { kind: "meal", cue: target.cue });
      }
      c.action = { kind: "rest" };
      c.nextDecision = world.tick + 10;
    }
  }
  for (const outcome of metabolize(c.metabolism, c.genome, moving)) {
    reinforce(
      c.brain,
      outcome.cue,
      outcome.reward,
      c.genome.genes.learningRate,
    );
    event(world, { kind: "learn", cue: outcome.cue, value: outcome.reward });
  }
  if (c.metabolism.health <= 0) {
    c.alive = false;
    c.action = { kind: "rest" };
    event(world, { kind: "death" });
  }
}

export function advance(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(world);
}
