import { createBrain, reinforce } from "./brain";
import { decide } from "./decisions";
import { createGenome } from "./genome";
import { ingest, metabolize } from "./metabolism";
import { perceive, perceiveObjects } from "./perception";
import {
  applyObjectEffects,
  createNeeds,
  createObjectBrain,
  INTERACTION_TICKS,
  learnInteraction,
  OBJECT_COOLDOWN,
  updateNeeds,
  zeroEffects,
} from "./curiosity";
import { hashSeed, random } from "./random";
import {
  clamp,
  CUES,
  DT,
  MAX_FOODS,
  type Cue,
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
    version: 2,
    seed,
    rng: source.rng,
    tick: 0,
    nextId: 1,
    width: 600,
    height: 680,
    foods: [],
    objects: [],
    events: [],
    creature: {
      x: 300,
      y: 340,
      heading: 0,
      genome,
      metabolism: { energy: 52, stomach: 0, toxins: 0, health: 100, gut: [] },
      brain: createBrain(),
      needs: createNeeds(),
      objectBrain: createObjectBrain(),
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
  if (world.tick >= c.nextDecision && c.action.kind !== "interact") {
    c.action = decide(world, perceive(c, world.foods), perceiveObjects(world));
    c.nextDecision = world.tick + 20;
  }
  let target: { x: number; y: number } | undefined;
  if (c.action.kind === "seek") {
    const id = c.action.foodId;
    target = world.foods.find((food) => food.id === id);
    if (!target) c.nextDecision = world.tick;
  } else if (c.action.kind === "inspect") {
    const id = c.action.objectId;
    target = world.objects.find(
      (object) => object.id === id && object.availableAt <= world.tick,
    );
    if (!target) {
      c.action = { kind: "rest" };
      c.nextDecision = world.tick;
    }
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
      if (c.action.kind === "seek") {
        const id = c.action.foodId;
        const food = world.foods.find((item) => item.id === id);
        if (food && ingest(c.metabolism, food)) {
          world.foods = world.foods.filter((item) => item.id !== id);
          c.meals++;
          event(world, { kind: "meal", cue: food.cue });
        }
      }
      if (c.action.kind === "inspect") {
        const id = c.action.objectId;
        const object = world.objects.find((item) => item.id === id)!;
        c.action = {
          kind: "interact",
          objectId: id,
          cue: object.cue,
          remaining: INTERACTION_TICKS,
          changes: zeroEffects(),
        };
      } else {
        c.action = { kind: "rest" };
        c.nextDecision = world.tick + 10;
      }
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
  updateNeeds(c, moving);
  if (c.action.kind === "interact") {
    const action = c.action;
    const object = world.objects.find((item) => item.id === action.objectId);
    if (object) {
      applyObjectEffects(c, object, action.changes);
      action.remaining--;
    }
    if (!object || action.remaining <= 0 || c.metabolism.health <= 0) {
      if (action.remaining < INTERACTION_TICKS) {
        const reward = learnInteraction(c, action.cue, action.changes);
        event(world, {
          kind: "interaction",
          objectCue: action.cue,
          value: reward,
        });
      }
      if (object) object.availableAt = world.tick + OBJECT_COOLDOWN;
      c.action = { kind: "rest" };
      c.nextDecision = world.tick + 10;
    }
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
