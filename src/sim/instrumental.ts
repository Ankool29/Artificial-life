import { clamp, type Observation, type World } from "./types";
import {
  EVENT_WINDOW,
  CREDIT_TAU,
  CREDIT_WINDOW,
  MAX_EPISODES,
  MAX_LINKS,
  MAX_TRANSITIONS,
  type ActuatorObservation,
  type InstrumentalTrace,
  type PerceivedChange,
  type PhysicalEvent,
  type Situation,
  type TransitionMemory,
  type GutCredit,
} from "./instrumental-types";

export type InstrumentalObserver = (trace: InstrumentalTrace) => void;
export function perceiveActuators(world: World): ActuatorObservation[] {
  const c = world.creature;
  return (world.instrumental?.devices ?? []).flatMap((d) => {
    const distance = Math.hypot(d.x - c.x, d.y - c.y);
    return distance <= c.genome.genes.vision
      ? [
          {
            id: d.id,
            appearance: d.appearance,
            action: "press" as const,
            x: d.x,
            y: d.y,
            distance,
          },
        ]
      : [];
  });
}
export function perceiveChange(
  world: World,
  event: PhysicalEvent,
): PerceivedChange | undefined {
  const c = world.creature;
  if (Math.hypot(event.x - c.x, event.y - c.y) > c.genome.genes.vision)
    return undefined;
  return event.kind === "motion"
    ? { ...event }
    : {
        kind: "resource",
        tick: event.tick,
        foodId: event.foodId,
        cue: event.cue,
        x: event.x,
        y: event.y,
      };
}
export function newlyPerceivedResources(
  world: World,
  seen: readonly Observation[],
): PerceivedChange[] {
  const s = world.instrumental;
  if (!s) return [];
  const before = new Set(s.seenFoods);
  s.seenFoods = seen.map((food) => food.id);
  return seen
    .filter((food) => !before.has(food.id))
    .map((food) => ({
      kind: "resource",
      tick: world.tick,
      foodId: food.id,
      cue: food.cue,
      x: food.x,
      y: food.y,
    }));
}
export function situationFor(
  target: { x: number; y: number },
  seen: readonly Observation[],
): Situation {
  return seen.some(
    (food) => Math.hypot(food.x - target.x, food.y - target.y) <= 60,
  )
    ? "resource-visible"
    : "clear";
}
export function transitionFor(
  world: World,
  targetId: number,
  situation: Situation,
): TransitionMemory | undefined {
  return world.instrumental?.memories.find(
    (m) => m.targetId === targetId && m.situation === situation,
  );
}
function memory(
  world: World,
  targetId: number,
  situation: Situation,
): TransitionMemory {
  const s = world.instrumental!;
  let m = transitionFor(world, targetId, situation);
  if (!m) {
    if (s.memories.length >= MAX_TRANSITIONS) {
      const protectedKeys = new Set(
        s.episodes.map((e) => `${e.targetId}/${e.situation}`),
      );
      const candidates = s.memories
        .map((m, index) => ({ m, index }))
        .filter(({ m }) => !protectedKeys.has(`${m.targetId}/${m.situation}`));
      const oldest = candidates.reduce((a, b) =>
        a.m.lastTick <= b.m.lastTick ? a : b,
      );
      s.memories.splice(oldest.index, 1);
    }
    m = {
      targetId,
      situation,
      action: "press",
      attempts: 0,
      observations: 0,
      successes: 0,
      probability: 0,
      value: 0,
      outcomes: 0,
      lastReward: 0,
      lastTick: world.tick,
    };
    s.memories.push(m);
  }
  return m;
}
export function actuatorScores(
  world: World,
  actuators: readonly ActuatorObservation[],
  foods: readonly Observation[],
  curiosity: number,
): {
  target: ActuatorObservation;
  situation: Situation;
  score: number;
  probability: number;
  value: number;
  attempts: number;
}[] {
  const s = world.instrumental;
  if (!s) return [];
  return actuators.flatMap((target) => {
    // A pending consequence is an uncertainty window, never a read of physical cooldown.
    if (s.episodes.some((e) => e.targetId === target.id && !e.eventSeen))
      return [];
    if (
      s.links.some(
        (link) =>
          foods.some((f) => f.id === link.foodId) &&
          s.episodes.some(
            (e) => e.id === link.episodeId && e.targetId === target.id,
          ),
      )
    )
      return [];
    const situation = situationFor(target, foods),
      m = transitionFor(world, target.id, situation);
    const attempts = m?.attempts ?? 0,
      probability = m?.probability ?? 0,
      value = m?.value ?? 0;
    const score =
      curiosity * (0.25 + 0.5 / Math.sqrt(1 + attempts)) +
      probability * value -
      (target.distance / world.creature.genome.genes.vision) * 0.16;
    return [{ target, situation, score, probability, value, attempts }];
  });
}
export function beginAction(
  world: World,
  target: ActuatorObservation,
  seen: readonly Observation[],
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental!,
    situation = situationFor(target, seen);
  const m = memory(world, target.id, situation);
  m.attempts++;
  m.lastTick = world.tick;
  if (s.episodes.length >= MAX_EPISODES) {
    const protectedIds = new Set(s.gut.map((g) => g.episodeId));
    const index = s.episodes.findIndex((e) => !protectedIds.has(e.id));
    if (index < 0) return;
    s.episodes.splice(index, 1);
  }
  const e = {
    id: s.nextEpisode++,
    targetId: target.id,
    situation,
    tick: world.tick,
    x: target.x,
    y: target.y,
    covered: true,
    eventSeen: false,
  };
  s.episodes.push(e);
  observe?.({
    phase: "attempt",
    targetId: target.id,
    episodeId: e.id,
    situation,
    learned: s.learning,
  });
}
function updateTransition(
  world: World,
  episode: { targetId: number; situation: Situation; id: number },
  success: boolean,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental!,
    m = memory(world, episode.targetId, episode.situation),
    beforeProbability = m.probability;
  m.observations++;
  if (success) m.successes++;
  if (s.learning)
    m.probability +=
      world.creature.genome.genes.learningRate *
      ((success ? 1 : 0) - m.probability);
  m.lastTick = world.tick;
  observe?.({
    phase: "transition",
    targetId: m.targetId,
    episodeId: episode.id,
    situation: m.situation,
    event: success ? "resource" : "absence",
    beforeProbability,
    probability: m.probability,
    value: m.value,
    learned: s.learning,
  });
}
export function observeChange(
  world: World,
  event: PerceivedChange,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental;
  if (!s) return;
  observe?.({
    phase: "perceived",
    event: event.kind,
    ...(event.kind === "resource"
      ? { foodId: event.foodId }
      : { targetId: event.targetId }),
  });
  if (event.kind !== "resource") return;
  const candidates = s.episodes.filter(
    (e) =>
      !e.eventSeen &&
      event.tick >= e.tick &&
      event.tick - e.tick <= EVENT_WINDOW &&
      Math.hypot(event.x - e.x, event.y - e.y) <= 40,
  );
  if (candidates.length !== 1) {
    if (candidates.length > 1) {
      for (const e of candidates) e.covered = false;
      observe?.({
        phase: "perceived",
        foodId: event.foodId,
        event: "ambiguous",
      });
    }
    return;
  }
  const e = candidates[0]!;
  e.eventSeen = true;
  updateTransition(world, e, true, observe);
  if (s.links.length >= MAX_LINKS) s.links.shift();
  s.links.push({ foodId: event.foodId, episodeId: e.id, tick: world.tick });
}
export function updateEpisodes(
  world: World,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental;
  if (!s) return;
  const c = world.creature;
  const visible = new Set(perceiveActuators(world).map((a) => a.id));
  for (const e of s.episodes) {
    if (
      !e.eventSeen &&
      (!visible.has(e.targetId) ||
        Math.hypot(c.x - e.x, c.y - e.y) + 40 > c.genome.genes.vision)
    )
      e.covered = false;
    if (!e.eventSeen && world.tick - e.tick >= EVENT_WINDOW && e.covered)
      updateTransition(world, e, false, observe);
  }
  s.episodes = s.episodes.filter(
    (e) =>
      (e.eventSeen || world.tick - e.tick < EVENT_WINDOW) &&
      world.tick - e.tick <= CREDIT_WINDOW,
  );
  const ids = new Set(s.episodes.map((e) => e.id));
  for (const credit of s.gut)
    if (credit.episodeId !== null && !ids.has(credit.episodeId))
      credit.episodeId = null;
  s.links = s.links.filter(
    (link) =>
      ids.has(link.episodeId) &&
      world.tick - link.tick <= CREDIT_WINDOW &&
      world.foods.some((f) => f.id === link.foodId),
  );
}
export function registerIngestion(world: World, foodId: number): void {
  const s = world.instrumental;
  if (!s) return;
  const link = s.links.find((link) => link.foodId === foodId);
  s.gut.push({ foodId, episodeId: link?.episodeId ?? null });
}
export function reinforceInstrumental(
  world: World,
  credit: GutCredit | undefined,
  reward: number,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental;
  if (!s || credit?.episodeId == null) return;
  const e = s.episodes.find((e) => e.id === credit.episodeId);
  if (!e || world.tick - e.tick > CREDIT_WINDOW) return;
  const m = memory(world, e.targetId, e.situation),
    beforeValue = m.value;
  const eligibility = Math.exp(-(world.tick - e.tick) / CREDIT_TAU);
  if (s.learning)
    m.value = clamp(
      m.value +
        world.creature.genome.genes.learningRate *
          eligibility *
          (reward - m.value),
      -2,
      2,
    );
  m.outcomes++;
  m.lastReward = reward;
  m.lastTick = world.tick;
  observe?.({
    phase: "credit",
    targetId: e.targetId,
    episodeId: e.id,
    foodId: credit.foodId ?? undefined,
    situation: e.situation,
    reward,
    eligibility,
    beforeValue,
    value: m.value,
    probability: m.probability,
    learned: s.learning,
  });
  s.episodes = s.episodes.filter((episode) => episode.id !== e.id);
  s.links = s.links.filter((link) => link.episodeId !== e.id);
}
