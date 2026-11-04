import { describe, expect, it } from "vitest";
import waitingFixture from "./fixtures/instrumental-v1-waiting.json";
import digestingFixture from "./fixtures/instrumental-v1-digesting.json";
import { createWorld, step, advance, addFood } from "../src/sim/world";
import { addDispenser, pressDevice } from "../src/sim/devices";
import {
  beginAction,
  observeResources,
  newlyPerceivedResources,
  perceiveActuators,
  registerIngestion,
  reinforceInstrumental,
} from "../src/sim/instrumental";
import { ingest } from "../src/sim/metabolism";
import { perceive } from "../src/sim/perception";
import { serialize, deserialize } from "../src/sim/persistence";
import { generateGenome } from "../src/sim/genome";
import {
  createLaboratory,
  serializeLaboratory,
  deserializeLaboratory,
} from "../src/lab/laboratory";
import {
  MAX_EPISODES,
  MAX_HYPOTHESES,
  MAX_LINKS,
  MAX_TRANSITIONS,
  MAX_GUT_CREDITS,
} from "../src/sim/instrumental-types";
import type {
  InstrumentalTrace,
  PerceivedChange,
  GutCredit,
} from "../src/sim/instrumental-types";

function prepared(positions = [260, 300]) {
  const w = createWorld("attribution-controls", generateGenome("hunger-g00"));
  w.foods = [];
  for (const x of positions) addDispenser(w, x, 340);
  w.creature.nextDecision = 100000;
  return w;
}
function act(w: ReturnType<typeof prepared>, index: number) {
  const target = perceiveActuators(w)[index]!;
  beginAction(w, target, []);
  return target;
}
function resource(w: ReturnType<typeof prepared>, x: number): PerceivedChange {
  addFood(w, "amber", x, 340);
  return {
    kind: "resource",
    tick: w.tick,
    foodId: w.foods.at(-1)!.id,
    cue: "amber",
    x,
    y: 340,
  };
}
function consume(w: ReturnType<typeof prepared>, index = 0): GutCredit {
  const f = w.foods[index]!;
  expect(ingest(w.creature.metabolism, f)).toBe(true);
  registerIngestion(w, f.id);
  w.foods.splice(index, 1);
  return w.instrumental!.gut.at(-1)!;
}

describe("durable identity evidence", () => {
  it("credits a normally digested berry after a wait beyond the old 90 s window and a save", () => {
    let w = prepared([335]);
    const target = act(w, 0);
    pressDevice(w, w.instrumental!.devices[0]!);
    advance(w, 1200);
    expect(w.instrumental!.episodes).toHaveLength(0);
    expect(w.instrumental!.links[0]).toMatchObject({ bound: true });
    expect(w.creature.brain.amber.meals).toBe(0);
    w = deserialize(serialize(w));
    const food = w.foods[0]!;
    w.creature.x = food.x;
    w.creature.y = food.y;
    w.creature.action = { kind: "seek", foodId: food.id };
    const credits: InstrumentalTrace[] = [];
    advance(w, 100, (e) => {
      if (e.kind === "instrumental" && e.trace.phase === "credit")
        credits.push(e.trace);
    });
    expect(w.creature.brain.amber.meals).toBe(1);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({
      targetId: target.id,
      outcome: "completed",
    });
    expect(credits[0]!.reward).toBeGreaterThan(0);
    expect(credits[0]!.eligibility).toBeCloseTo(Math.exp(-8 / 300));
    expect(w.instrumental!.links).toEqual([]);
  });

  it("carries evidence with the bolus, independent of pending episode eviction and digestion delay", () => {
    const w = prepared([335]);
    const target = act(w, 0);
    const e = resource(w, 357);
    observeResources(w, [e]);
    const credit = consume(w);
    w.instrumental!.episodes = [];
    w.tick = 10000;
    const events: InstrumentalTrace[] = [];
    reinforceInstrumental(w, credit, -1, (t) => events.push(t));
    reinforceInstrumental(w, credit, -1, (t) => events.push(t));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      phase: "credit",
      targetId: target.id,
      eligibility: 1,
    });
    expect(w.instrumental!.memories[0]!.value).toBeLessThan(0);
  });

  it("recognizes the same berry after it leaves and re-enters vision", () => {
    const w = prepared([335]);
    act(w, 0);
    const e = resource(w, 357);
    expect(newlyPerceivedResources(w, perceive(w.creature, w.foods))).toEqual([
      e,
    ]);
    observeResources(w, [e]);
    w.creature.x = 20;
    w.creature.y = 20;
    expect(newlyPerceivedResources(w, perceive(w.creature, w.foods))).toEqual(
      [],
    );
    w.creature.x = 300;
    w.creature.y = 340;
    expect(newlyPerceivedResources(w, perceive(w.creature, w.foods))).toEqual(
      [],
    );
    expect(w.instrumental!.memories[0]!.successes).toBe(1);
  });
});

describe("conservative ambiguous attribution", () => {
  it("does not manufacture a third attribution by excluding conflicting alternatives", () => {
    const w = prepared();
    act(w, 0);
    act(w, 1);
    observeResources(w, [
      resource(w, 250),
      resource(w, 250),
      resource(w, 282),
      resource(w, 322),
    ]);
    expect(w.instrumental!.links.every((r) => !r.bound)).toBe(true);
    expect(w.instrumental!.memories.every((m) => m.probability === 0)).toBe(
      true,
    );
  });

  it("retains a pending action's conflict after contradictory resource traces disappear", () => {
    const w = prepared([300]);
    act(w, 0);
    observeResources(w, [resource(w, 322), resource(w, 322)]);
    w.foods = [];
    step(w);
    expect(w.instrumental!.links).toHaveLength(0);
    observeResources(w, [resource(w, 322)]);
    expect(w.instrumental!.links[0]).toMatchObject({
      conflicted: true,
      bound: false,
    });
    expect(w.instrumental!.memories[0]!.probability).toBe(0);
  });

  it.each([false, true])(
    "uses the whole observed batch, never nearest-machine distance or array order (reverse=%s)",
    (reverse) => {
      const w = prepared();
      const a = act(w, 0),
        b = act(w, 1);
      // First resource is closer to B, but the second is compatible only with B.
      const ea = resource(w, 282),
        eb = resource(w, 322);
      observeResources(w, reverse ? [eb, ea] : [ea, eb]);
      expect(
        w
          .instrumental!.links.map((l) => [
            l.foodId,
            l.hypotheses![0]!.targetId,
          ])
          .sort(),
      ).toEqual(
        [
          [(ea as { foodId: number }).foodId, a.id],
          [(eb as { foodId: number }).foodId, b.id],
        ].sort(),
      );
      expect(w.instrumental!.links.every((l) => l.bound)).toBe(true);
      expect(
        w.instrumental!.memories.every(
          (m) => m.successes === 1 && m.value === 0,
        ),
      ).toBe(true);
    },
  );

  it("retains both hypotheses for indistinguishable actions, through ingestion and save, without biological blame", () => {
    let w = prepared([300, 300]);
    act(w, 0);
    act(w, 1);
    observeResources(w, [resource(w, 322)]);
    const credit = consume(w);
    expect(credit.bound).toBe(false);
    expect(credit.hypotheses).toHaveLength(2);
    w = deserialize(serialize(w));
    const traces: InstrumentalTrace[] = [];
    reinforceInstrumental(w, w.instrumental!.gut[0], -1, (t) => traces.push(t));
    expect(traces[0]).toMatchObject({
      phase: "attribution",
      event: "unattributed",
      confidence: 0.5,
    });
    expect(w.instrumental!.memories.every((m) => m.value === 0)).toBe(true);
  });

  it.each([false, true])(
    "withholds attribution when two simultaneous resources compete for one action (reverse=%s)",
    (reverse) => {
      const w = prepared([300]);
      act(w, 0);
      const events = [resource(w, 322), resource(w, 322)];
      observeResources(w, reverse ? events.reverse() : events);
      expect(
        w.instrumental!.links.every(
          (l) => l.conflicted && !l.bound && l.episodeId === null,
        ),
      ).toBe(true);
      expect(w.instrumental!.memories[0]!.probability).toBe(0);
      const trace: InstrumentalTrace[] = [];
      reinforceInstrumental(w, consume(w), -2, (t) => trace.push(t));
      expect(trace[0]!.event).toBe("unattributed");
      expect(w.instrumental!.memories[0]!.value).toBe(0);
    },
  );

  it("can resolve an earlier ambiguous food already in the gut when another appearance excludes an alternative", () => {
    const w = prepared();
    const a = act(w, 0);
    act(w, 1);
    observeResources(w, [resource(w, 282)]);
    const credit = consume(w);
    expect(credit.bound).toBe(false);
    w.tick++;
    observeResources(w, [resource(w, 322)]);
    expect(credit).toMatchObject({
      bound: true,
      hypotheses: [{ targetId: a.id }],
    });
    const traces: InstrumentalTrace[] = [];
    reinforceInstrumental(w, credit, -1, (t) => traces.push(t));
    expect(traces[0]!.targetId).toBe(a.id);
  });
});

describe("real partial consequences at termination", () => {
  it("keeps positive and negative partial effects separate when death interrupts two meals", () => {
    const w = prepared([260, 400]);
    const a = act(w, 0),
      b = act(w, 1);
    const ea = resource(w, 282),
      eb = resource(w, 422);
    w.foods[1]!.nutrients = 5;
    w.foods[1]!.toxins = 10;
    observeResources(w, [ea, eb]);
    consume(w);
    consume(w);
    w.creature.metabolism.energy = 30;
    w.creature.metabolism.health = 1;
    const traces: InstrumentalTrace[] = [];
    advance(w, 30, (e) => {
      if (e.kind === "instrumental" && e.trace.phase === "credit")
        traces.push(e.trace);
    });
    expect(w.creature.alive).toBe(false);
    expect(traces).toHaveLength(2);
    expect(traces.find((t) => t.targetId === a.id)!.reward).toBeGreaterThan(0);
    expect(traces.find((t) => t.targetId === b.id)!.reward).toBeLessThan(0);
    expect(traces.every((t) => t.outcome === "terminal-partial")).toBe(true);
    expect(w.creature.brain.amber.meals).toBe(0);
  });

  it.each([true, false])(
    "settles the actual partial bolus once, preserving food learning and control plasticity (learning=%s)",
    (learning) => {
      const w = prepared([335]);
      w.instrumental!.learning = learning;
      w.instrumental!.devices[0]!.recipe = {
        cue: "rose",
        mass: 10,
        nutrients: 5,
        toxins: 10,
      };
      act(w, 0);
      pressDevice(w, w.instrumental!.devices[0]!);
      advance(w, 8);
      const food = w.foods[0]!;
      w.creature.x = food.x;
      w.creature.y = food.y;
      w.creature.action = { kind: "seek", foodId: food.id };
      w.creature.metabolism.health = 1;
      const events: InstrumentalTrace[] = [];
      advance(w, 100, (e) => {
        if (e.kind === "instrumental" && e.trace.phase === "credit")
          events.push(e.trace);
      });
      expect(w.creature.alive).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ outcome: "terminal-partial" });
      expect(events[0]!.reward).toBeCloseTo(
        w.creature.metabolism.gut[0]!.reward,
      );
      expect(events[0]!.reward).toBeLessThan(0);
      expect(w.creature.brain.rose.meals).toBe(0);
      expect(w.creature.brain.rose.value).toBe(0);
      const memory = w.instrumental!.memories[0]!;
      expect(memory.partialOutcomes).toBe(1);
      if (learning) expect(memory.value).toBeLessThan(0);
      else expect([memory.value, memory.probability]).toEqual([0, 0]);
      const saved = serialize(w);
      expect(serialize(deserialize(saved))).toBe(saved);
      step(w);
      expect(serialize(w)).toBe(saved);
    },
  );

  it("does not blame a recent lever for an unlinked toxic bolus", () => {
    const w = prepared([335]);
    addFood(w, "rose", 300, 340);
    consume(w);
    act(w, 0);
    w.creature.metabolism.energy = 30;
    w.creature.metabolism.health = 0.01;
    const traces: InstrumentalTrace[] = [];
    step(w, (e) => {
      if (e.kind === "instrumental") traces.push(e.trace);
    });
    expect(w.creature.alive).toBe(false);
    expect(traces.some((t) => t.phase === "credit")).toBe(false);
    expect(w.instrumental!.memories[0]!.value).toBe(0);
  });

  it("does not count a completed bolus twice when it finishes on the fatal tick", () => {
    const w = prepared([335]);
    act(w, 0);
    const event = resource(w, 357);
    observeResources(w, [event]);
    consume(w);
    const m = w.creature.metabolism;
    Object.assign(m.gut[0]!, { remaining: 0.1, nutrients: 0, toxins: 1 });
    m.stomach = 0.1;
    m.health = 0.1;
    m.energy = 30;
    const traces: InstrumentalTrace[] = [];
    step(w, (e) => {
      if (e.kind === "instrumental" && e.trace.phase === "credit")
        traces.push(e.trace);
    });
    expect(w.creature.alive).toBe(false);
    expect(traces).toHaveLength(1);
    expect(traces[0]!.outcome).toBe("completed");
    expect(w.creature.brain.amber.meals).toBe(1);
    expect(w.instrumental!.memories[0]!.partialOutcomes ?? 0).toBe(0);
  });
});

describe("bounded state and validation", () => {
  it("keeps alternatives uncertain when a resource's trace cannot enter a saturated gut ledger", () => {
    const w = prepared([260, 300, 420]);
    act(w, 0);
    act(w, 1);
    const c = act(w, 2);
    observeResources(w, [resource(w, 282)]);
    const episode = w.instrumental!.episodes.find((e) => e.targetId === c.id)!;
    for (let i = 0; i < MAX_GUT_CREDITS; i++) {
      w.creature.metabolism.gut.push({
        cue: "amber",
        remaining: 0.1,
        nutrients: 0,
        toxins: 0,
        reward: 0,
      });
      w.instrumental!.gut.push({
        foodId: w.nextId++,
        episodeId: null,
        bound: false,
        conflicted: true,
        observedTick: 0,
        hypotheses: [
          {
            episodeId: episode.id,
            targetId: c.id,
            situation: "clear",
            actionTick: 0,
          },
        ],
      });
    }
    w.creature.metabolism.stomach = MAX_GUT_CREDITS * 0.1;
    consume(w);
    observeResources(w, [resource(w, 322)]);
    expect(w.instrumental!.links[0]).toMatchObject({
      bound: false,
      conflicted: true,
    });
    expect(
      w.instrumental!.memories.every(
        (m) => m.probability === 0 && m.value === 0,
      ),
    ).toBe(true);
  });

  it("remembers an unrecorded action under pressure instead of blaming a remaining candidate", () => {
    let w = prepared([300, 310]);
    for (let i = 0; i < MAX_EPISODES; i++) act(w, 0);
    act(w, 1);
    expect(w.instrumental!.uncertainUntil).toBe(50);
    w.instrumental!.episodes.splice(1);
    w = deserialize(serialize(w));
    const traces: InstrumentalTrace[] = [];
    observeResources(w, [resource(w, 322)], (t) => traces.push(t));
    expect(w.instrumental!.links).toHaveLength(0);
    expect(traces.some((t) => t.event === "memory-limit")).toBe(true);
    expect(
      w.instrumental!.memories.every(
        (m) => m.probability === 0 && m.value === 0,
      ),
    ).toBe(true);
    advance(w, 51);
    expect(w.instrumental!.uncertainUntil).toBeUndefined();
  });

  it.each(["waiting", "digesting"])(
    "imports a real old instrumental save (%s) without changing biology or learned values",
    (name) => {
      const old = name === "waiting" ? waitingFixture : digestingFixture;
      const raw = JSON.stringify(old);
      const w = deserialize(raw);
      expect(w.instrumental!.version).toBe(2);
      expect(w.creature).toEqual(old.creature);
      expect(w.instrumental!.memories).toEqual(old.instrumental.memories);
      expect(w.rng).toBe(old.rng);
      const evidence =
        name === "waiting"
          ? w.instrumental!.links[0]!
          : w.instrumental!.gut[0]!;
      expect(evidence.bound).toBe(true);
      expect(evidence.hypotheses).toHaveLength(1);
      if (name === "digesting") expect(evidence.observedTick).toBeNull();
      const copy = deserialize(serialize(w));
      for (let i = 0; i < 200; i++) {
        step(w);
        step(copy);
        expect(serialize(w)).toBe(serialize(copy));
      }
      const lab = createLaboratory(deserialize(raw));
      expect(deserializeLaboratory(serializeLaboratory(lab))).toEqual(lab);
    },
  );

  it("keeps the maximal supported evidence budget below the existing save limit and in laboratory profiles", () => {
    const w = prepared([300, 310, 320, 330]);
    // Worst supported payload: every live food retains four candidate actions.
    w.instrumental!.nextEpisode = MAX_EPISODES + 1;
    for (let i = 0; i < MAX_LINKS; i++) {
      addFood(w, "amber", 300, 340);
      const foodId = w.foods.at(-1)!.id;
      w.instrumental!.links.push({
        foodId,
        episodeId: null,
        tick: 0,
        observedTick: 0,
        bound: false,
        hypotheses: Array.from({ length: MAX_HYPOTHESES }, (_, j) => ({
          episodeId: j + 1,
          targetId: w.instrumental!.devices[j]!.id,
          situation: "clear" as const,
          actionTick: 0,
        })),
      });
    }
    for (let i = 0; i < MAX_EPISODES; i++)
      w.instrumental!.episodes.push({
        id: i + 1,
        targetId: w.instrumental!.devices[i % 4]!.id,
        situation: "clear",
        tick: 0,
        x: 300,
        y: 340,
        covered: false,
        eventSeen: false,
      });
    for (let i = 0; i < MAX_TRANSITIONS; i++)
      w.instrumental!.memories.push({
        targetId: w.nextId++,
        situation: "clear",
        action: "press",
        attempts: 1,
        observations: 1,
        successes: 1,
        probability: 0.5,
        value: 0.1,
        outcomes: 1,
        lastReward: 0.1,
        lastTick: 0,
      });
    for (let i = 0; i < MAX_GUT_CREDITS; i++) {
      w.creature.metabolism.gut.push({
        cue: "amber",
        remaining: 0.5,
        nutrients: 0,
        toxins: 0,
        reward: 0,
      });
      w.instrumental!.gut.push({
        foodId: w.nextId++,
        episodeId: null,
        bound: false,
        observedTick: 0,
        hypotheses: structuredClone(w.instrumental!.links[0]!.hypotheses),
      });
    }
    w.creature.metabolism.stomach = MAX_GUT_CREDITS * 0.5;
    expect(serialize(w).length).toBeLessThan(100000);
    expect(deserialize(serialize(w))).toEqual(w);
    const lab = createLaboratory(w);
    expect(deserializeLaboratory(serializeLaboratory(lab))).toEqual(lab);
  });

  it("withholds extra rich evidence at the budget while preserving a larger biological gut and its save", () => {
    const w = prepared([260, 400]);
    act(w, 0);
    const other = act(w, 1);
    observeResources(w, [resource(w, 282)]);
    const episode = w.instrumental!.episodes.find(
      (e) => e.targetId === other.id,
    )!;
    for (let i = 0; i < MAX_GUT_CREDITS; i++) {
      w.creature.metabolism.gut.push({
        cue: "amber",
        remaining: 0.1,
        nutrients: 0,
        toxins: 0,
        reward: 0,
      });
      w.instrumental!.gut.push({
        foodId: w.nextId++,
        episodeId: null,
        bound: false,
        conflicted: true,
        observedTick: 0,
        hypotheses: [
          {
            episodeId: episode.id,
            targetId: other.id,
            situation: "clear",
            actionTick: 0,
          },
        ],
      });
    }
    w.creature.metabolism.stomach = MAX_GUT_CREDITS * 0.1;
    const food = w.foods[0]!,
      traces: InstrumentalTrace[] = [];
    expect(ingest(w.creature.metabolism, food)).toBe(true);
    registerIngestion(w, food.id, (t) => traces.push(t));
    w.foods = [];
    expect(w.creature.metabolism.gut.length).toBe(MAX_GUT_CREDITS + 1);
    expect(w.instrumental!.gut.at(-1)!.hypotheses).toEqual([]);
    expect(traces[0]!.event).toBe("memory-limit");
    expect(deserialize(serialize(w))).toEqual(w);
  });

  it("withholds rather than selecting a truncated subset when candidate capacity is exceeded", () => {
    const w = prepared([300]);
    for (let i = 0; i < MAX_HYPOTHESES + 1; i++) act(w, 0);
    const traces: InstrumentalTrace[] = [];
    observeResources(w, [resource(w, 322)], (t) => traces.push(t));
    expect(w.instrumental!.links).toHaveLength(0);
    expect(traces.some((t) => t.event === "memory-limit")).toBe(true);
    expect(w.instrumental!.memories[0]!.value).toBe(0);
  });

  it("does not crash or evict protected learned associations when every memory slot is pinned", () => {
    const w = prepared([335]);
    const s = w.instrumental!;
    for (let i = 0; i < MAX_TRANSITIONS; i++) {
      const id = w.nextId++;
      s.memories.push({
        targetId: id,
        action: "press",
        situation: "clear",
        attempts: 1,
        observations: 1,
        successes: 1,
        probability: 0.5,
        value: -0.5,
        outcomes: 1,
        lastReward: -1,
        lastTick: 0,
      });
      s.links.push({
        foodId: w.nextId++,
        episodeId: ++s.nextEpisode - 1,
        tick: 0,
        observedTick: 0,
        bound: true,
        hypotheses: [
          {
            episodeId: s.nextEpisode - 1,
            targetId: id,
            situation: "clear",
            actionTick: 0,
          },
        ],
      });
    }
    const before = structuredClone(s.memories);
    expect(() => act(w, 0)).not.toThrow();
    expect(s.memories).toEqual(before);
    expect(s.episodes).toHaveLength(0);
  });

  it("rejects malformed durable claims and inconsistent chronology", () => {
    const w = prepared([335]);
    act(w, 0);
    observeResources(w, [resource(w, 357)]);
    for (const mutate of [
      (w: ReturnType<typeof prepared>) => {
        w.instrumental!.links[0]!.hypotheses![0]!.actionTick = 1;
      },
      (w: ReturnType<typeof prepared>) => {
        w.instrumental!.links[0]!.episodeId = null;
      },
      (w: ReturnType<typeof prepared>) => {
        w.instrumental!.links[0]!.hypotheses!.push({
          ...w.instrumental!.links[0]!.hypotheses![0]!,
        });
      },
    ]) {
      const copy = structuredClone(w);
      mutate(copy);
      expect(() => deserialize(serialize(copy))).toThrow();
    }
  });
});
