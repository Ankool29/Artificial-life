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
  motivations,
  OBJECT_COOLDOWN,
  updateNeeds,
  zeroEffects,
} from "./curiosity";
import { hashSeed, random } from "./random";
import { bodyState, type SimulationObserver } from "./diagnostics";
import { pressDevice, updateDevices } from "./devices";
import {
  beginAction,
  newlyPerceivedResources,
  observeChange,
  observeResources,
  settleTerminalCredits,
  perceiveActuators,
  perceiveChange,
  registerIngestion,
  reinforceInstrumental,
  updateEpisodes,
} from "./instrumental";
import type { GutCredit, InstrumentalTrace } from "./instrumental-types";
import { migrateInstrumental } from "./instrumental-migration";
import { enableEcology, updateEcology, recordFruitIngestion } from "./ecology";
import { CUES, DT, type Genome, type World, type WorldEvent } from "./types";

export { addFood, FOOD_RECIPES } from "./food";
import { addFood } from "./food";

export function createWorld(
  seed = "luma-01",
  individualGenome?: Genome,
): World {
  const source = { rng: hashSeed(seed) };
  // Retain the old environment RNG sequence even when the genome is supplied.
  const legacyGenome = createGenome(source);
  const genome = individualGenome
    ? structuredClone(individualGenome)
    : legacyGenome;
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

export function createLivingWorld(seed = "luma-01", genome?: Genome): World {
  const world = createWorld(seed, genome);
  enableEcology(world);
  return world;
}

export function setCreaturePresence(world: World, present: boolean): boolean {
  if (!world.ecology) return false;
  world.ecology.creaturePresent = present;
  // Observation was interrupted. Do not mistake the absence for a continuously
  // covered action window when this preserved individual returns to the garden.
  if (!present)
    for (const e of world.instrumental?.episodes ?? []) e.covered = false;
  return true;
}

// Exactly one 100 ms tick, no clocks, DOM, storage, or Math.random in this module.
export function step(world: World, observe?: SimulationObserver): void {
  const c = world.creature;
  if (!c.alive && !world.ecology) return;
  migrateInstrumental(world);
  world.tick++;
  updateEcology(
    world,
    observe
      ? (trace) => observe({ kind: "ecology", tick: world.tick, trace })
      : undefined,
  );
  const instrumentalObserver = observe
    ? (trace: InstrumentalTrace) =>
        observe({ kind: "instrumental", tick: world.tick, trace })
    : undefined;
  for (const physical of updateDevices(world)) {
    if (physical.kind === "resource")
      instrumentalObserver?.({
        phase: "production",
        targetId: physical.targetId,
        foodId: physical.foodId,
        event: "resource",
      });
  }
  if (!c.alive || world.ecology?.creaturePresent === false) return;
  if (world.instrumental) {
    observeResources(
      world,
      newlyPerceivedResources(world, perceive(c, world.foods)),
      instrumentalObserver,
    );
  }
  if (world.tick >= c.nextDecision && c.action.kind !== "interact") {
    c.action = decide(
      world,
      perceive(c, world.foods),
      perceiveObjects(world),
      observe
        ? (trace) => {
            observe({ kind: "decision", tick: world.tick, trace });
            for (const candidate of trace.candidates)
              if (candidate.instrumental)
                instrumentalObserver?.({
                  phase: "score",
                  ...candidate.instrumental,
                  score: candidate.score,
                });
          }
        : undefined,
      perceiveActuators(world),
    );
    c.nextDecision = world.tick + 20;
  }
  const execution = observe
    ? { action: structuredClone(c.action), x: c.x, y: c.y }
    : undefined;
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
  } else if (c.action.kind === "use") {
    const targetId = c.action.targetId;
    target = world.instrumental?.devices.find((d) => d.id === targetId);
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
          recordFruitIngestion(world, food.id);
          registerIngestion(world, food.id, instrumentalObserver);
          event(world, { kind: "meal", cue: food.cue });
          observe?.({ kind: "ingestion", tick: world.tick, food: { ...food } });
        }
      }
      if (c.action.kind === "use") {
        const targetId = c.action.targetId;
        const d = world.instrumental!.devices.find((d) => d.id === targetId)!;
        const perceived = perceiveActuators(world).find((a) => a.id === d.id);
        if (perceived)
          beginAction(
            world,
            perceived,
            perceive(c, world.foods),
            instrumentalObserver,
          );
        const change = perceiveChange(world, pressDevice(world, d));
        if (change) observeChange(world, change, instrumentalObserver);
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
        observe?.({
          kind: "interaction-start",
          tick: world.tick,
          objectId: id,
          cue: object.cue,
        });
      } else {
        c.action = { kind: "rest" };
        c.nextDecision = world.tick + 10;
      }
    }
  }
  if (execution)
    observe?.({
      kind: "execution",
      tick: world.tick,
      action: execution.action,
      moving,
      distance: Math.hypot(c.x - execution.x, c.y - execution.y),
    });
  const completedSlots: number[] = [];
  const completedCredits: (GutCredit | undefined)[] = [];
  for (const outcome of metabolize(
    c.metabolism,
    c.genome,
    moving,
    observe || world.instrumental
      ? (trace) => {
          observe?.({
            kind: "absorption",
            tick: world.tick,
            trace: { ...trace },
          });
          if (trace.completed && world.instrumental) {
            completedSlots.push(trace.slot);
            completedCredits.push(world.instrumental.gut[trace.slot]);
          }
        }
      : undefined,
    observe
      ? (trace) => observe({ kind: "physiology", tick: world.tick, trace })
      : undefined,
  )) {
    const before = observe ? { ...c.brain[outcome.cue] } : undefined;
    reinforce(
      c.brain,
      outcome.cue,
      outcome.reward,
      c.genome.genes.learningRate,
    );
    event(world, { kind: "learn", cue: outcome.cue, value: outcome.reward });
    reinforceInstrumental(
      world,
      completedCredits.shift(),
      outcome.reward,
      instrumentalObserver,
    );
    if (observe && before)
      observe({
        kind: "food-learning",
        tick: world.tick,
        cue: outcome.cue,
        before,
        after: { ...c.brain[outcome.cue] },
        reward: outcome.reward,
        rate: c.genome.genes.learningRate,
      });
  }
  if (world.instrumental)
    world.instrumental.gut = world.instrumental.gut.filter(
      (_, slot) => !completedSlots.includes(slot),
    );
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
        const before = observe
          ? structuredClone(c.objectBrain[action.cue])
          : undefined;
        const reward = learnInteraction(c, action.cue, action.changes);
        event(world, {
          kind: "interaction",
          objectCue: action.cue,
          value: reward,
        });
        if (observe && before)
          observe({
            kind: "object-learning",
            tick: world.tick,
            objectId: action.objectId,
            cue: action.cue,
            changes: { ...action.changes },
            before,
            after: structuredClone(c.objectBrain[action.cue]),
            reward,
            rate: c.genome.genes.learningRate,
          });
      }
      if (object) object.availableAt = world.tick + OBJECT_COOLDOWN;
      c.action = { kind: "rest" };
      c.nextDecision = world.tick + 10;
    }
  }
  if (c.metabolism.health <= 0) {
    settleTerminalCredits(world, instrumentalObserver);
    c.alive = false;
    c.action = { kind: "rest" };
    event(world, { kind: "death" });
  }
  updateEpisodes(world, instrumentalObserver);
  observe?.({
    kind: "state",
    tick: world.tick,
    body: bodyState(c),
    drives: motivations(c),
    action: structuredClone(c.action),
    alive: c.alive,
  });
}

export function advance(
  world: World,
  ticks: number,
  observe?: SimulationObserver,
): void {
  for (let i = 0; i < ticks; i++) step(world, observe);
}
