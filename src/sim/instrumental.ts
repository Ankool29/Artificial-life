import { clamp, type Observation, type World } from "./types";
import {
  EVENT_WINDOW,
  CREDIT_TAU,
  CREDIT_WINDOW,
  MAX_EPISODES,
  MAX_LINKS,
  MAX_HYPOTHESES,
  MAX_GUT_CREDITS,
  type Attribution,
  type CreditHypothesis,
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
  // Recognition is persistent while the resource exists. Leaving vision is not
  // a new appearance. This garbage collection inspects identity, never provenance.
  const live = new Set(world.foods.map((food) => food.id));
  s.seenFoods = [
    ...new Set([
      ...s.seenFoods.filter((id) => live.has(id)),
      ...seen.map((food) => food.id),
    ]),
  ];
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
): TransitionMemory | undefined {
  const s = world.instrumental!;
  let m = transitionFor(world, targetId, situation);
  if (!m) {
    if (s.memories.length >= MAX_TRANSITIONS) {
      const protectedKeys = new Set([
        ...s.episodes.map((e) => `${e.targetId}/${e.situation}`),
        ...[...s.links, ...s.gut].flatMap((r) =>
          (r.hypotheses ?? []).map((h) => `${h.targetId}/${h.situation}`),
        ),
      ]);
      const candidates = s.memories
        .map((m, index) => ({ m, index }))
        .filter(({ m }) => !protectedKeys.has(`${m.targetId}/${m.situation}`));
      if (!candidates.length) return undefined;
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
  const visibleFoodIds = new Set(foods.map((f) => f.id));
  return actuators.flatMap((target) => {
    // A pending consequence is an uncertainty window, never a read of physical cooldown.
    if (s.episodes.some((e) => e.targetId === target.id && !e.eventSeen))
      return [];
    if (
      s.links.some(
        (link) =>
          world.tick - link.tick <= CREDIT_WINDOW &&
          visibleFoodIds.has(link.foodId) &&
          link.bound &&
          link.hypotheses?.[0]?.targetId === target.id,
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
  if (!m) {
    s.uncertainUntil = world.tick + EVENT_WINDOW;
    for (const e of s.episodes) {
      e.covered = false;
      e.conflicted = true;
    }
    observe?.({
      phase: "attempt",
      targetId: target.id,
      situation,
      event: "memory-limit",
      learned: s.learning,
    });
    return;
  }
  m.attempts++;
  m.lastTick = world.tick;
  if (s.episodes.length >= MAX_EPISODES) {
    // Durable evidence no longer depends on this short pending-action buffer.
    const index = s.episodes.findIndex(
      (e) => e.eventSeen || world.tick - e.tick >= EVENT_WINDOW,
    );
    if (index < 0) {
      s.uncertainUntil = world.tick + EVENT_WINDOW;
      for (const e of s.episodes) {
        e.covered = false;
        e.conflicted = true;
      }
      observe?.({
        phase: "attempt",
        targetId: target.id,
        situation,
        event: "memory-limit",
        learned: s.learning,
      });
      return;
    }
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
    m = memory(world, episode.targetId, episode.situation);
  if (!m) return;
  const beforeProbability = m.probability;
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
function evidenceTrace(
  record: Attribution,
): Pick<InstrumentalTrace, "hypotheses" | "confidence"> {
  const hypotheses = record.hypotheses ?? [];
  return {
    hypotheses: hypotheses.map((h) => ({ ...h })),
    confidence:
      hypotheses.length && !record.conflicted ? 1 / hypotheses.length : 0,
  };
}

// Constraint propagation only: one own action can explain at most one appearance.
// No nearest-machine guess, physical source ID, learned recipe or hidden timer.
function resolveAttributions(
  world: World,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental!;
  const records = [...s.links, ...s.gut];
  let changed = true;
  while (changed) {
    changed = false;
    const claimed = new Set(
      records.filter((r) => r.bound).map((r) => r.hypotheses![0]!.episodeId),
    );
    for (const r of records.filter((r) => !r.bound && !r.conflicted)) {
      const before = r.hypotheses?.length ?? 0;
      r.hypotheses = (r.hypotheses ?? []).filter(
        (h) => !claimed.has(h.episodeId),
      );
      if (r.hypotheses.length !== before) changed = true;
    }
    const singles = records.filter(
      (r) => !r.bound && !r.conflicted && r.hypotheses?.length === 1,
    );
    // Two simultaneous resources for one possible action are underdetermined.
    // Do not let array order create a confident attribution.
    for (const r of singles) {
      const h = r.hypotheses![0]!;
      if (
        singles.filter(
          (other) => other.hypotheses![0]!.episodeId === h.episodeId,
        ).length > 1
      ) {
        r.conflicted = true;
        observe?.({
          phase: "attribution",
          event: "ambiguous",
          foodId: r.foodId ?? undefined,
          ...evidenceTrace(r),
        });
      }
    }
    // A resource in conflict is still an alternative explanation. Removing it
    // from the candidate graph (or digesting it) must not manufacture certainty
    // for a third resource. Retain the conflict in the short action buffer too.
    let spread = true;
    while (spread) {
      spread = false;
      const blocked = new Set([
        ...records
          .filter((r) => r.conflicted)
          .flatMap((r) => (r.hypotheses ?? []).map((h) => h.episodeId)),
        ...s.episodes.filter((e) => e.conflicted).map((e) => e.id),
      ]);
      for (const r of records.filter((r) => !r.bound && !r.conflicted)) {
        if (r.hypotheses?.some((h) => blocked.has(h.episodeId))) {
          r.conflicted = true;
          spread = true;
        }
      }
      for (const e of s.episodes)
        if (blocked.has(e.id)) {
          e.conflicted = true;
          e.covered = false;
        }
    }
    for (const r of singles.filter((r) => !r.conflicted)) {
      const h = r.hypotheses![0]!;
      r.bound = true;
      r.episodeId = h.episodeId;
      const pending = s.episodes.find((e) => e.id === h.episodeId);
      if (pending) pending.eventSeen = true;
      updateTransition(
        world,
        { id: h.episodeId, targetId: h.targetId, situation: h.situation },
        true,
        observe,
      );
      observe?.({
        phase: "attribution",
        event: "resolved",
        foodId: r.foodId ?? undefined,
        targetId: h.targetId,
        episodeId: h.episodeId,
        situation: h.situation,
        ...evidenceTrace(r),
      });
      changed = true;
    }
  }
}

export function observeResources(
  world: World,
  events: readonly PerceivedChange[],
  observe?: InstrumentalObserver,
): void {
  if (!events.length) return;
  for (const event of events) observeChange(world, event, observe, true);
  if (world.instrumental) resolveAttributions(world, observe);
}

export function observeChange(
  world: World,
  event: PerceivedChange,
  observe?: InstrumentalObserver,
  deferResolution = false,
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
  if (
    event.kind !== "resource" ||
    s.links.some((r) => r.foodId === event.foodId) ||
    s.gut.some((r) => r.foodId === event.foodId)
  )
    return;
  if (world.tick <= (s.uncertainUntil ?? -1)) {
    observe?.({
      phase: "attribution",
      event: "memory-limit",
      foodId: event.foodId,
    });
    return; // An unrecorded own action remains a possible cause, not certainty elsewhere.
  }
  const candidates = s.episodes.filter(
    (e) =>
      !e.eventSeen &&
      event.tick >= e.tick &&
      event.tick - e.tick <= EVENT_WINDOW &&
      Math.hypot(event.x - e.x, event.y - e.y) <= 40,
  );
  if (!candidates.length) return;
  if (candidates.length > MAX_HYPOTHESES) {
    for (const e of candidates) {
      e.covered = false;
      e.conflicted = true;
    }
    observe?.({
      phase: "attribution",
      event: "memory-limit",
      foodId: event.foodId,
    });
    return; // Withhold instead of truncating alternatives into false certainty.
  }
  const hypotheses: CreditHypothesis[] = candidates.map((e) => ({
    episodeId: e.id,
    targetId: e.targetId,
    situation: e.situation,
    actionTick: e.tick,
  }));
  if (s.links.length >= MAX_LINKS) {
    // Free only disappeared resources. Discarding a still-live alternative could
    // manufacture a unique attribution for another resource.
    const live = new Set(world.foods.map((f) => f.id));
    s.links = s.links.filter((r) => live.has(r.foodId));
  }
  if (s.links.length >= MAX_LINKS) {
    observe?.({
      phase: "attribution",
      event: "memory-limit",
      foodId: event.foodId,
    });
    for (const e of candidates) {
      e.covered = false;
      e.conflicted = true;
    }
    return;
  }
  const link = {
    foodId: event.foodId,
    episodeId: null,
    tick: event.tick,
    observedTick: event.tick,
    hypotheses,
    bound: false,
    ...(candidates.some((e) => e.conflicted) ? { conflicted: true } : {}),
  };
  s.links.push(link);
  if (candidates.length > 1 || link.conflicted) {
    for (const e of candidates) e.covered = false;
    observe?.({
      phase: "perceived",
      foodId: event.foodId,
      event: "ambiguous",
      ...evidenceTrace(link),
    });
  }
  if (!deferResolution) resolveAttributions(world, observe);
}
export function updateEpisodes(
  world: World,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental;
  if (!s) return;
  const c = world.creature;
  if (s.uncertainUntil !== undefined && s.uncertainUntil < world.tick)
    delete s.uncertainUntil;
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
  // Pending actions retain the original 5 s observation window. The independent
  // resource/gut snapshots keep their identity chain for the resource's lifetime.
  s.episodes = s.episodes.filter((e) => world.tick - e.tick < EVENT_WINDOW);
  const live = new Set(world.foods.map((f) => f.id));
  s.links = s.links.filter((link) => live.has(link.foodId));
}
export function registerIngestion(
  world: World,
  foodId: number,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental;
  if (!s) return;
  const link = s.links.find((link) => link.foodId === foodId);
  const hasBudget =
    s.gut.filter((g) => g.hypotheses?.length).length < MAX_GUT_CREDITS;
  if (link?.hypotheses?.length && !hasBudget)
    observe?.({
      phase: "attribution",
      event: "memory-limit",
      foodId,
    });
  if (link?.hypotheses?.length && !hasBudget && !link.bound) {
    // A discarded uncertain appearance still competed for these own actions.
    // Propagate that uncertainty before releasing its full identity trace.
    link.conflicted = true;
    resolveAttributions(world, observe);
  }
  s.gut.push(
    link && hasBudget
      ? {
          foodId,
          episodeId: link.episodeId,
          hypotheses: link.hypotheses?.map((h) => ({ ...h })),
          observedTick: link.observedTick,
          bound: link.bound,
          conflicted: link.conflicted,
        }
      : {
          foodId,
          episodeId: null,
          hypotheses: [],
          observedTick: null,
          bound: false,
        },
  );
  s.links = s.links.filter((link) => link.foodId !== foodId);
}
export function reinforceInstrumental(
  world: World,
  credit: GutCredit | undefined,
  reward: number,
  observe?: InstrumentalObserver,
  outcome: "completed" | "terminal-partial" = "completed",
): void {
  const s = world.instrumental;
  if (!s || !credit || credit.settled) return;
  credit.settled = true;
  const h = credit.bound ? credit.hypotheses?.[0] : undefined;
  if (!h) {
    observe?.({
      phase: "attribution",
      event: "unattributed",
      foodId: credit.foodId ?? undefined,
      reward,
      outcome,
      ...evidenceTrace(credit),
    });
    return;
  }
  const m = memory(world, h.targetId, h.situation);
  if (!m) {
    observe?.({
      phase: "attribution",
      event: "memory-limit",
      foodId: credit.foodId ?? undefined,
    });
    return;
  }
  const beforeValue = m.value;
  // Identity carries the consequence across waiting and digestion. Temporal
  // attenuation measures uncertainty at appearance, not the meal's residence time.
  const delay =
    credit.observedTick === null || credit.observedTick === undefined
      ? EVENT_WINDOW
      : credit.observedTick - h.actionTick;
  const eligibility = Math.exp(-delay / CREDIT_TAU);
  reward = clamp(reward, -2, 2);
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
  if (outcome === "terminal-partial")
    m.partialOutcomes = (m.partialOutcomes ?? 0) + 1;
  m.lastReward = reward;
  m.lastTick = world.tick;
  observe?.({
    phase: "credit",
    targetId: h.targetId,
    episodeId: h.episodeId,
    foodId: credit.foodId ?? undefined,
    situation: h.situation,
    reward,
    outcome,
    eligibility,
    beforeValue,
    value: m.value,
    probability: m.probability,
    learned: s.learning,
    ...evidenceTrace(credit),
  });
}

export function settleTerminalCredits(
  world: World,
  observe?: InstrumentalObserver,
): void {
  const s = world.instrumental;
  if (!s) return;
  // Only absorption changes already accumulated in this bolus. No death penalty,
  // hidden toxin lookup, extra food experience, or guessed cause of death.
  world.creature.metabolism.gut.forEach((bolus, slot) =>
    reinforceInstrumental(
      world,
      s.gut[slot],
      bolus.reward,
      observe,
      "terminal-partial",
    ),
  );
}
