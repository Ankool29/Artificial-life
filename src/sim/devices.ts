import { clamp, MAX_FOODS, type Cue, type World } from "./types";
import {
  MAX_DEVICES,
  type Device,
  type PhysicalEvent,
  type InstrumentalState,
} from "./instrumental-types";

export function createInstrumentalState(
  world: World,
  learning = true,
): InstrumentalState {
  return {
    version: 1,
    learning,
    devices: [],
    memories: [],
    episodes: [],
    links: [],
    gut: world.creature.metabolism.gut.map(() => ({
      episodeId: null,
      foodId: null,
    })),
    seenFoods: world.foods
      .filter(
        (f) =>
          Math.hypot(f.x - world.creature.x, f.y - world.creature.y) <=
          world.creature.genome.genes.vision,
      )
      .map((f) => f.id),
    nextEpisode: 1,
  };
}
export function addDispenser(
  world: World,
  x: number,
  y: number,
  cue: Cue = "amber",
): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    (world.instrumental?.devices.length ?? 0) >= MAX_DEVICES
  )
    return false;
  world.instrumental ??= createInstrumentalState(world);
  world.instrumental.devices.push({
    id: world.nextId++,
    kind: "dispenser",
    appearance: "lever",
    x: clamp(x, 45, world.width - 45),
    y: clamp(y, 45, world.height - 45),
    stock: 12,
    capacity: 12,
    readyAt: 0,
    rechargeTicks: 80,
    delayTicks: 8,
    pressedUntil: 0,
    pendingAt: null,
    recipe: {
      cue,
      mass: 10,
      nutrients: cue === "amber" ? 28 : cue === "blue" ? 15 : 5,
      toxins: cue === "rose" ? 10 : 0,
    },
  });
  return true;
}
// Pure world physics. No reinforcement, memory inspection or random draws.
export function pressDevice(world: World, device: Device): PhysicalEvent {
  device.pressedUntil = world.tick + 3;
  if (
    device.stock > 0 &&
    world.tick >= device.readyAt &&
    device.pendingAt === null
  ) {
    device.stock--;
    device.pendingAt = world.tick + device.delayTicks;
    device.readyAt = world.tick + device.rechargeTicks;
  }
  return {
    kind: "motion",
    tick: world.tick,
    targetId: device.id,
    x: device.x,
    y: device.y,
  };
}
export function updateDevices(world: World): PhysicalEvent[] {
  const events: PhysicalEvent[] = [];
  for (const d of world.instrumental?.devices ?? []) {
    if (
      d.pendingAt === null ||
      d.pendingAt > world.tick ||
      world.foods.length >= MAX_FOODS
    )
      continue;
    const food = {
      id: world.nextId++,
      x: clamp(d.x + 22, 22, world.width - 22),
      y: d.y,
      ...d.recipe,
    };
    world.foods.push(food);
    d.pendingAt = null;
    events.push({
      kind: "resource",
      tick: world.tick,
      targetId: d.id,
      foodId: food.id,
      cue: food.cue,
      x: food.x,
      y: food.y,
    });
  }
  return events;
}
export function refillDevice(world: World, id: number): boolean {
  const d = world.instrumental?.devices.find((d) => d.id === id);
  if (!d) return false;
  d.stock = d.capacity;
  return true;
}
export function removeDevice(world: World, id: number): boolean {
  const s = world.instrumental;
  if (!s) return false;
  const i = s.devices.findIndex((d) => d.id === id);
  if (i < 0) return false;
  s.devices.splice(i, 1);
  return true;
}
