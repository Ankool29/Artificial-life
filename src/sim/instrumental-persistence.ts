import { CUES, MAX_FOODS, type World } from "./types";
import {
  MAX_DEVICES,
  MAX_EPISODES,
  MAX_LINKS,
  MAX_TRANSITIONS,
  MAX_HYPOTHESES,
  MAX_GUT_CREDITS,
  EVENT_WINDOW,
} from "./instrumental-types";

const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const n = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
const int = (x: unknown, lo: number, hi: number): x is number =>
  n(x, lo, hi) && Number.isInteger(x);
const array = (x: unknown, max: number): x is unknown[] =>
  Array.isArray(x) && x.length <= max;
const situation = (x: unknown): boolean =>
  x === "clear" || x === "resource-visible";
const point = (x: Record<string, unknown>): boolean =>
  n(x.x, 0, 600) && n(x.y, 0, 680);

export function validInstrumental(raw: unknown, world: World): boolean {
  if (
    !object(raw) ||
    (raw.version !== 1 && raw.version !== 2) ||
    typeof raw.learning !== "boolean" ||
    !int(raw.nextEpisode, 1, 1e10) ||
    (raw.uncertainUntil !== undefined &&
      !int(raw.uncertainUntil, 0, world.tick + EVENT_WINDOW)) ||
    !array(raw.devices, MAX_DEVICES) ||
    !array(raw.memories, MAX_TRANSITIONS) ||
    !array(raw.episodes, MAX_EPISODES) ||
    !array(raw.links, raw.version === 1 ? 24 : MAX_LINKS) ||
    !array(raw.gut, world.creature.metabolism.gut.length) ||
    !array(raw.seenFoods, MAX_FOODS) ||
    raw.gut.length !== world.creature.metabolism.gut.length
  )
    return false;
  const id = (x: unknown): x is number => int(x, 1, world.nextId - 1);
  if (
    !raw.devices.every(
      (d) =>
        object(d) &&
        point(d) &&
        id(d.id) &&
        d.kind === "dispenser" &&
        d.appearance === "lever" &&
        int(d.capacity, 1, 1000) &&
        int(d.stock, 0, d.capacity) &&
        int(d.readyAt, 0, 1e10) &&
        int(d.pressedUntil, 0, 1e10) &&
        int(d.rechargeTicks, 1, 6000) &&
        int(d.delayTicks, 1, 600) &&
        (d.pendingAt === null || int(d.pendingAt, 0, 1e10)) &&
        object(d.recipe) &&
        CUES.includes(d.recipe.cue as (typeof CUES)[number]) &&
        n(d.recipe.mass, 1, 36) &&
        n(d.recipe.nutrients, 0, 100) &&
        n(d.recipe.toxins, 0, 100),
    )
  )
    return false;
  const ids = [
    ...world.foods.map((f) => f.id),
    ...world.objects.map((o) => o.id),
    ...raw.devices.map((d) => (d as { id: number }).id),
  ];
  if (new Set(ids).size !== ids.length) return false;
  if (
    !raw.memories.every(
      (m) =>
        object(m) &&
        id(m.targetId) &&
        m.action === "press" &&
        situation(m.situation) &&
        [m.attempts, m.observations, m.successes, m.outcomes].every((count) =>
          int(count, 0, 1e10),
        ) &&
        n(m.probability, 0, 1) &&
        n(m.value, -2, 2) &&
        n(m.lastReward, -2, 2) &&
        int(m.lastTick, 0, world.tick),
    )
  )
    return false;
  if (
    !raw.memories.every(
      (m) =>
        object(m) &&
        (m.partialOutcomes === undefined ||
          int(m.partialOutcomes, 0, m.outcomes as number)),
    )
  )
    return false;
  if (
    new Set(
      raw.memories.map(
        (m) =>
          `${(m as Record<string, unknown>).targetId}/${(m as Record<string, unknown>).situation}`,
      ),
    ).size !== raw.memories.length
  )
    return false;
  if (
    !raw.episodes.every(
      (e) =>
        object(e) &&
        point(e) &&
        int(e.id, 1, (raw.nextEpisode as number) - 1) &&
        id(e.targetId) &&
        situation(e.situation) &&
        int(e.tick, 0, world.tick) &&
        typeof e.covered === "boolean" &&
        typeof e.eventSeen === "boolean" &&
        (e.conflicted === undefined || typeof e.conflicted === "boolean"),
    )
  )
    return false;
  const episodes = new Set(raw.episodes.map((e) => (e as { id: number }).id));
  if (episodes.size !== raw.episodes.length) return false;
  const attribution = (r: Record<string, unknown>): boolean => {
    if (
      !array(r.hypotheses, MAX_HYPOTHESES) ||
      typeof r.bound !== "boolean" ||
      (r.observedTick !== null && !int(r.observedTick, 0, world.tick)) ||
      (r.conflicted !== undefined && typeof r.conflicted !== "boolean") ||
      (r.settled !== undefined &&
        (typeof r.settled !== "boolean" || (r.settled && world.creature.alive)))
    )
      return false;
    const hs = r.hypotheses;
    if (
      !hs.every(
        (h) =>
          object(h) &&
          id(h.targetId) &&
          int(h.episodeId, 1, (raw.nextEpisode as number) - 1) &&
          situation(h.situation) &&
          int(h.actionTick, 0, (r.observedTick ?? world.tick) as number),
      )
    )
      return false;
    if (
      new Set(hs.map((h) => (h as { episodeId: number }).episodeId)).size !==
      hs.length
    )
      return false;
    return r.bound
      ? hs.length === 1 &&
          !r.conflicted &&
          r.episodeId === (hs[0] as { episodeId: number }).episodeId
      : r.episodeId === null;
  };
  if (
    !raw.links.every(
      (link) =>
        object(link) &&
        id(link.foodId) &&
        (raw.version === 1
          ? int(link.episodeId, 1, (raw.nextEpisode as number) - 1) &&
            episodes.has(link.episodeId)
          : attribution(link) && link.observedTick === link.tick) &&
        int(link.tick, 0, world.tick),
    )
  )
    return false;
  if (
    new Set(raw.links.map((link) => (link as { foodId: number }).foodId))
      .size !== raw.links.length
  )
    return false;
  if (
    !raw.gut.every(
      (g) =>
        object(g) &&
        (g.foodId === null || id(g.foodId)) &&
        (raw.version === 2
          ? attribution(g)
          : g.episodeId === null ||
            (int(g.episodeId, 1, (raw.nextEpisode as number) - 1) &&
              episodes.has(g.episodeId))),
    )
  )
    return false;
  if (raw.version === 2) {
    if (
      (raw.gut as Record<string, unknown>[]).filter(
        (r) => (r.hypotheses as unknown[]).length > 0,
      ).length > MAX_GUT_CREDITS
    )
      return false;
    const identities = new Map<number, string>();
    for (const e of raw.episodes as Record<string, unknown>[]) {
      identities.set(e.id as number, `${e.targetId}/${e.situation}/${e.tick}`);
    }
    const claimed = new Set<number>(),
      foods = new Set<number>();
    for (const r of [...raw.links, ...raw.gut] as Record<string, unknown>[]) {
      if (r.foodId !== null) {
        if (foods.has(r.foodId as number)) return false;
        foods.add(r.foodId as number);
      }
      for (const h of r.hypotheses as Record<string, unknown>[]) {
        const key = `${h.targetId}/${h.situation}/${h.actionTick}`;
        const before = identities.get(h.episodeId as number);
        if (before !== undefined && before !== key) return false;
        identities.set(h.episodeId as number, key);
      }
      if (r.bound) {
        if (claimed.has(r.episodeId as number)) return false;
        claimed.add(r.episodeId as number);
      }
    }
  }
  return (
    raw.seenFoods.every(id) &&
    new Set(raw.seenFoods).size === raw.seenFoods.length
  );
}
