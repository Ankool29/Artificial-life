import { CUES, MAX_FOODS, MAX_OBJECTS, OBJECT_CUES, type World } from "./types";
import { createNeeds, createObjectBrain, INTERACTION_TICKS } from "./curiosity";
import { GENE_RANGES } from "./genome";

const MAX_SAVE_BYTES = 100_000;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const integer = (value: unknown, min: number, max: number): value is number =>
  number(value, min, max) && Number.isInteger(value);
const cue = (value: unknown): boolean =>
  CUES.includes(value as (typeof CUES)[number]);
const point = (value: unknown, width: number, height: number): boolean =>
  isObject(value) && number(value.x, 0, width) && number(value.y, 0, height);

export function serialize(world: World): string {
  return JSON.stringify(world);
}

// Untrusted imports are validated before they can replace a running world.
export function deserialize(json: string): World {
  const invalid = (): never => {
    throw new Error("Sauvegarde invalide ou version incompatible.");
  };
  if (json.length > MAX_SAVE_BYTES) return invalid();
  let w: unknown;
  try {
    w = JSON.parse(json);
  } catch {
    return invalid();
  }
  if (
    !isObject(w) ||
    (w.version !== 1 && w.version !== 2) ||
    typeof w.seed !== "string" ||
    w.seed.length > 80 ||
    !integer(w.rng, 0, 0xffffffff) ||
    !integer(w.tick, 0, 1e10) ||
    !integer(w.nextId, 1, 1e10) ||
    w.width !== 600 ||
    w.height !== 680
  )
    return invalid();
  const nextId = w.nextId;
  const tick = w.tick;
  const legacy = w.version === 1;
  if (
    !Array.isArray(w.foods) ||
    w.foods.length > MAX_FOODS ||
    !w.foods.every(
      (f) =>
        isObject(f) &&
        point(f, 600, 680) &&
        integer(f.id, 1, nextId - 1) &&
        cue(f.cue) &&
        number(f.nutrients, 0, 100) &&
        number(f.toxins, 0, 100) &&
        number(f.mass, 1, 36),
    )
  )
    return invalid();
  if (new Set(w.foods.map((f) => f.id)).size !== w.foods.length)
    return invalid();
  const c = w.creature;
  if (
    !isObject(c) ||
    !point(c, 600, 680) ||
    !number(c.heading, -Math.PI, Math.PI) ||
    !integer(c.nextDecision, 0, 1e10) ||
    !integer(c.meals, 0, 1e10) ||
    typeof c.alive !== "boolean"
  )
    return invalid();
  const g = c.genome;
  if (
    !isObject(g) ||
    (g.version !== 1 && g.version !== 2) ||
    !isObject(g.genes)
  )
    return invalid();
  const ranges: Record<string, [number, number]> = {
    speed: [1, 150],
    vision: [10, 900],
    efficiency: [0.1, 2],
    detox: [0, 5],
    learningRate: [0.01, 1],
    exploration: [0, 1],
  };
  if (
    !Object.entries(ranges).every(([key, [min, max]]) =>
      number((g.genes as Record<string, unknown>)[key], min, max),
    )
  )
    return invalid();
  if (
    g.version === 2 &&
    !Object.entries(GENE_RANGES).every(([key, [min, max]]) =>
      number((g.genes as Record<string, unknown>)[key], min, max),
    )
  )
    return invalid();
  const allowedGenes = g.version === 2 ? GENE_RANGES : ranges;
  if (!Object.keys(g.genes).every((key) => Object.hasOwn(allowedGenes, key)))
    return invalid();
  const m = c.metabolism;
  if (
    !isObject(m) ||
    !number(m.health, 0, 100) ||
    !["energy", "toxins"].every((key) => number(m[key], 0, 100)) ||
    !number(m.stomach, 0, 36.000001) ||
    !Array.isArray(m.gut) ||
    m.gut.length > 4
  )
    return invalid();
  if (
    !m.gut.every(
      (b) =>
        isObject(b) &&
        cue(b.cue) &&
        number(b.remaining, 1e-8, 36) &&
        number(b.nutrients, 0, 100) &&
        number(b.toxins, 0, 100) &&
        number(b.reward, -20, 20),
    )
  )
    return invalid();
  if (
    Math.abs(m.gut.reduce((sum, b) => sum + b.remaining, 0) - m.stomach) >
      1e-6 ||
    c.alive !== m.health > 0
  )
    return invalid();
  const b = c.brain;
  if (
    !isObject(b) ||
    !CUES.every(
      (key) =>
        isObject(b[key]) &&
        number(b[key].value, -2, 2) &&
        number(b[key].lastReward, -2, 2) &&
        integer(b[key].meals, 0, 1e10),
    )
  )
    return invalid();
  const a = c.action;
  if (
    !isObject(a) ||
    !(
      a.kind === "rest" ||
      (a.kind === "wander" && point(a.target, 600, 680)) ||
      (a.kind === "seek" && integer(a.foodId, 1, w.nextId - 1)) ||
      (!legacy && a.kind === "inspect" && integer(a.objectId, 1, nextId - 1)) ||
      (!legacy &&
        a.kind === "interact" &&
        integer(a.objectId, 1, nextId - 1) &&
        OBJECT_CUES.includes(a.cue as (typeof OBJECT_CUES)[number]) &&
        integer(a.remaining, 1, INTERACTION_TICKS) &&
        validEffects(a.changes))
    )
  )
    return invalid();
  if (
    !Array.isArray(w.events) ||
    w.events.length > 32 ||
    !w.events.every(
      (e) =>
        isObject(e) &&
        integer(e.tick, 0, tick) &&
        ((["meal", "learn", "death"].includes(e.kind as string) &&
          (e.kind === "death" || cue(e.cue)) &&
          (e.kind !== "learn" || number(e.value, -2, 2))) ||
          (!legacy &&
            e.kind === "interaction" &&
            OBJECT_CUES.includes(e.objectCue as (typeof OBJECT_CUES)[number]) &&
            number(e.value, -2, 2))),
    )
  )
    return invalid();
  if (legacy) {
    // No new random draws; retain every old biological value and action.
    w.version = 2;
    w.objects = [];
    c.needs = createNeeds();
    c.objectBrain = createObjectBrain();
  } else {
    if (
      !isObject(c.needs) ||
      !["stimulation", "fatigue", "stress"].every((key) =>
        number((c.needs as Record<string, unknown>)[key], 0, 100),
      )
    )
      return invalid();
    const memories = c.objectBrain;
    if (
      !isObject(memories) ||
      !OBJECT_CUES.every((key) => {
        const memory = memories[key];
        return (
          isObject(memory) &&
          number(memory.value, -2, 2) &&
          number(memory.lastReward, -2, 2) &&
          integer(memory.interactions, 0, 1e10) &&
          validEffects(memory.expected)
        );
      })
    )
      return invalid();
    if (
      !Array.isArray(w.objects) ||
      w.objects.length > MAX_OBJECTS ||
      !w.objects.every(
        (object) =>
          isObject(object) &&
          point(object, 600, 680) &&
          integer(object.id, 1, nextId - 1) &&
          OBJECT_CUES.includes(object.cue as (typeof OBJECT_CUES)[number]) &&
          integer(object.availableAt, 0, 1e10) &&
          validEffects(object.effects),
      )
    )
      return invalid();
    const ids = [
      ...w.foods.map((food) => food.id),
      ...w.objects.map((object) => object.id),
    ];
    if (new Set(ids).size !== ids.length) return invalid();
    if (a.kind === "interact") {
      const target = w.objects.find((object) => object.id === a.objectId);
      if (target && target.cue !== a.cue) return invalid();
    }
  }
  return w as unknown as World;
}

function validEffects(value: unknown): boolean {
  return (
    isObject(value) &&
    Object.keys(value).length === 4 &&
    ["stimulation", "fatigue", "stress", "energy"].every((key) =>
      number(value[key], -100, 100),
    )
  );
}
