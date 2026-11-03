import { describe, expect, it } from "vitest";
import {
  LearningObservatory,
  HISTORY_LIMIT,
  POINT_LIMIT,
  SAMPLE_LIMIT,
} from "../src/observatory/recorder";
import { runLearningExperiment } from "../src/observatory/experiments";
import {
  createLaboratory,
  addIndividual,
  activeProfile,
  activateProfile,
  advanceActive,
  serializeLaboratory,
  deserializeLaboratory,
} from "../src/lab/laboratory";
import { generateGenome } from "../src/sim/genome";
import { createWorld, step, advance, addFood } from "../src/sim/world";
import { addObject } from "../src/sim/objects";
import { decide } from "../src/sim/decisions";
import { perceive, perceiveObjects } from "../src/sim/perception";
import { ingest } from "../src/sim/metabolism";
import { deserialize, serialize } from "../src/sim/persistence";
import type { DecisionTrace } from "../src/sim/diagnostics";
import type { World } from "../src/sim/types";
import oldWorld from "./fixtures/world-v1.json";
import v2World from "./fixtures/world-v2.json";

describe("observatory non-interference", () => {
  it.each(["legacy", "alpha", "beta", "gamma", "delta", "epsilon"])(
    "preserves every tick, RNG and save byte with toggles: %s",
    (seed) => {
      const a = createWorld(
        `parity-${seed}`,
        seed === "legacy" ? undefined : generateGenome(seed),
      );
      addObject(a, "chime", 320, 340);
      addObject(a, "prism", 250, 340);
      const b = deserialize(serialize(a)),
        recorder = new LearningObservatory();
      for (let i = 0; i < 1200; i++) {
        if (i % 100 === 0) recorder.setEnabled(i % 300 !== 100);
        if (i % 150 === 0)
          for (const w of [a, b])
            addFood(w, i % 300 ? "rose" : "amber", w.creature.x, w.creature.y);
        step(a);
        step(b, recorder.observerFor(b));
        recorder.capture(b);
        recorder.inspect(b);
        expect(serialize(b)).toBe(serialize(a));
      }
      expect(recorder.inspect(b)!.history.length).toBeGreaterThan(0);
    },
  );
  it.each([oldWorld, v2World])(
    "keeps legacy saves equivalent across capture and reload",
    (fixture) => {
      const a = deserialize(JSON.stringify(fixture)),
        b = deserialize(JSON.stringify(fixture));
      const recorder = new LearningObservatory();
      recorder.setEnabled(true);
      advance(a, 300);
      advance(b, 300, recorder.observerFor(b));
      expect(serialize(b)).toBe(serialize(a));
      const restored = deserialize(serialize(b));
      advance(restored, 300, recorder.observerFor(restored));
      advance(a, 300);
      expect(restored).toEqual(a);
    },
  );
  it("does not leak mutable world references through diagnostic payloads", () => {
    const a = createWorld("detached");
    addObject(a, "chime", 300, 340);
    const b = deserialize(serialize(a));
    advance(a, 500);
    advance(b, 500, (e) => {
      if (e.kind === "decision") {
        e.trace.chosen.kind = "rest";
        e.trace.needs.stress = 100;
        e.trace.foods.length = 0;
        e.trace.candidates.length = 0;
      } else if (e.kind === "state") {
        e.body.energy = 0;
        e.action.kind = "rest";
      } else if (e.kind === "ingestion") e.food.toxins = 100;
      else if (e.kind === "object-learning") e.after.expected.energy = -100;
      else if (e.kind === "food-learning") e.after.value = -100;
    });
    expect(b).toEqual(a);
  });
  it("retains independent profiles and byte-identical laboratory archives", () => {
    const a = createLaboratory(createWorld("lab-parity"));
    const p = addIndividual(a, {
      name: "Other",
      geneticSeed: "other",
      environmentSeed: "same",
    });
    const b = structuredClone(a);
    const recorder = new LearningObservatory();
    recorder.setEnabled(true);
    for (const id of [a.activeId, p.id, a.activeId]) {
      activateProfile(a, id);
      activateProfile(b, id);
      advanceActive(a, 300);
      advanceActive(b, 300, recorder.observerFor(activeProfile(b).world));
      expect(serializeLaboratory(b)).toBe(serializeLaboratory(a));
      expect(deserializeLaboratory(serializeLaboratory(b))).toEqual(a);
    }
    expect(recorder.inspect(b.profiles[0]!.world)).not.toBe(
      recorder.inspect(b.profiles[1]!.world),
    );
  });
});

describe("data captured at the executed branch", () => {
  function decision(w: World): DecisionTrace {
    let result: DecisionTrace | undefined;
    const plain = structuredClone(w);
    const expected = decide(
      plain,
      perceive(plain.creature, plain.foods),
      perceiveObjects(plain),
    );
    const action = decide(
      w,
      perceive(w.creature, w.foods),
      perceiveObjects(w),
      (trace) => {
        result = trace;
      },
    );
    expect(action).toEqual(expected);
    expect(w.rng).toBe(plain.rng);
    expect(result!.chosen).toEqual(action);
    return result!;
  }
  it("captures actual food scores and associations, without hidden composition", () => {
    const w = createWorld("scores");
    w.foods = [];
    Object.assign(w.creature.genome.genes, { exploration: 0, vision: 200 });
    w.creature.metabolism.energy = 40;
    w.creature.brain.amber = { value: 0.4, meals: 3, lastReward: 0.6 };
    w.creature.brain.rose.value = -0.2;
    addFood(w, "amber", 300, 340);
    addFood(w, "rose", 400, 340);
    const d = decision(w),
      food = d.candidates.filter((c) => c.stage === "food");
    expect(food[0]!.score).toBeCloseTo(1.15, 14);
    expect(food[1]!.score).toBeCloseTo(0.44, 14);
    expect(food[0]!.association).toEqual({
      cue: "amber",
      value: 0.4,
      experiences: 3,
    });
    expect(d.foods[0]).not.toHaveProperty("nutrients");
    expect(d.foods[0]).not.toHaveProperty("toxins");
  });
  it("does not invent rest/object scores after urgent hunger returns early", () => {
    const w = createWorld("urgent");
    w.creature.metabolism.energy = 5;
    addObject(w, "chime", 300, 340);
    const d = decision(w);
    expect(d.branch).toBe("urgent-food");
    expect(d.objects).toHaveLength(1);
    expect(
      d.candidates.some(
        (c) => c.action.kind === "rest" || c.action.kind === "inspect",
      ),
    ).toBe(false);
  });
  it("does not score every food in random exploration or invent a wander score", () => {
    const w = createWorld("explore");
    w.creature.genome.genes.exploration = 1;
    const d = decision(w);
    expect(d.foodPolicy).toBe("exploration");
    expect(d.candidates.filter((c) => c.stage === "food")).toEqual([]);
    expect(d.candidates[0]!.association).toBeUndefined();
    w.foods = [];
    w.creature.needs = { stimulation: 0, fatigue: 0, stress: 0 };
    expect(decision(w).branch).toBe("wander");
    expect(decision(w).candidates.some((c) => c.action.kind === "wander")).toBe(
      false,
    );
  });
});

describe("measurement, identity and bounds", () => {
  function meal(w: World, nutrients: number, toxins = 0, mass = 1): number {
    addFood(w, "amber", w.creature.x, w.creature.y);
    const food = w.foods.at(-1)!;
    Object.assign(food, { nutrients, toxins, mass });
    w.creature.action = { kind: "seek", foodId: food.id };
    w.creature.nextDecision = w.tick + 100;
    return food.id;
  }
  it("distinguishes an unknown association from experienced neutrality", () => {
    const w = createWorld("neutral");
    w.foods = [];
    const recorder = new LearningObservatory();
    recorder.setEnabled(true);
    const observe = recorder.observerFor(w);
    meal(w, 0);
    advance(w, 10, observe);
    const points = recorder.inspect(w)!.points;
    expect(
      points.find((p) => p.cue === "amber" && p.reward === undefined)?.count,
    ).toBe(0);
    expect(
      points.find((p) => p.cue === "amber" && p.reward === 0),
    ).toMatchObject({ after: 0, count: 1 });
    expect(w.creature.brain.blue.meals).toBe(0);
  });
  it("links overlapping same-cue digestions by slot, not temporal proximity", () => {
    const w = createWorld("overlap");
    w.foods = [];
    w.creature.metabolism.energy = 20;
    const recorder = new LearningObservatory();
    recorder.setEnabled(true);
    const observe = recorder.observerFor(w);
    const a = meal(w, 10);
    step(w, observe);
    const b = meal(w, 20, 2);
    step(w, observe);
    advance(w, 20, observe);
    const s = recorder.inspect(w)!,
      consequences = s.history.filter((e) => e.kind === "consequence");
    expect(consequences).toHaveLength(2);
    expect(consequences[0]!.refs).toContain(`aliment #${a}`);
    expect(consequences[1]!.refs).toContain(`aliment #${b}`);
    const learned = s.history.filter((e) => e.kind === "association");
    expect(learned.map((e) => e.refs)).toEqual(consequences.map((e) => e.refs));
    expect(s.foodEffects.amber!.energy).toBeCloseTo(
      20 * w.creature.genome.genes.efficiency,
    );
    expect(s.foodEffects.amber!.health).toBeCloseTo(-3.6);
  });
  it("marks resumed boluses partial instead of fabricating an ingestion ID", () => {
    const w = createWorld("old-bolus");
    w.foods = [];
    ingest(w.creature.metabolism, {
      id: 900,
      cue: "amber",
      x: 0,
      y: 0,
      mass: 1,
      nutrients: 10,
      toxins: 0,
    });
    const recorder = new LearningObservatory();
    recorder.setEnabled(true);
    advance(w, 10, recorder.observerFor(w));
    const s = recorder.inspect(w)!;
    expect(s.foodEffects.amber!.partial).toBe(true);
    expect(s.history.find((e) => e.kind === "consequence")!.refs).not.toContain(
      "aliment #900",
    );
  });
  it("captures the actual object effect accumulator and learned expectations", () => {
    const w = createWorld("object-measurement");
    w.foods = [];
    w.creature.metabolism.energy = 95;
    w.creature.needs = { stimulation: 0, fatigue: 30, stress: 40 };
    addObject(w, "chime", w.creature.x, w.creature.y);
    const id = w.objects[0]!.id;
    w.creature.action = { kind: "inspect", objectId: id };
    w.creature.nextDecision = 1000;
    const recorder = new LearningObservatory();
    recorder.setEnabled(true);
    const collect = recorder.observerFor(w)!;
    let changes: unknown;
    advance(w, 30, (event) => {
      collect(event);
      if (event.kind === "object-learning") {
        changes = event.changes;
        expect(event.after).toEqual(w.creature.objectBrain.chime);
        expect(event.before.interactions).toBe(0);
      }
    });
    const s = recorder.inspect(w)!;
    expect(s.objectEffects.chime).toEqual(changes);
    expect(s.points.at(-1)).toMatchObject({
      domain: "object",
      cue: "chime",
      count: 1,
      after: w.creature.objectBrain.chime.value,
      reward: w.creature.objectBrain.chime.lastReward,
    });
    expect(
      s.history
        .filter(
          (entry) =>
            entry.kind === "consequence" || entry.kind === "association",
        )
        .every((entry) => entry.refs.includes(`objet #${id}`)),
    ).toBe(true);
  });
  it("separates capture gaps and keeps all data structures bounded", () => {
    const w = createWorld("bounds");
    w.foods = [];
    const recorder = new LearningObservatory();
    recorder.setEnabled(true);
    for (let i = 0; i < 250; i++) {
      if (i === 120) {
        recorder.setEnabled(false);
        advance(w, 3);
        recorder.setEnabled(true);
      }
      w.creature.metabolism.energy = 20;
      w.creature.alive = true;
      meal(w, 1, 0, 0.1);
      step(w, recorder.observerFor(w));
    }
    advance(w, 1500, recorder.observerFor(w));
    const s = recorder.inspect(w)!;
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.dropped).toBeGreaterThan(0);
    expect(s.points).toHaveLength(POINT_LIMIT);
    expect(s.samples).toHaveLength(SAMPLE_LIMIT);
    expect(s.segment).toBe(2);
    expect(serialize(w)).not.toContain('"history"');
    expect(serialize(w)).not.toContain('"points"');
  });
});

describe("reproducible controlled experiments", () => {
  const lab = createLaboratory(createWorld("source"));
  it("measures progressive positive learning, aversion and reversal", () => {
    const profile = activeProfile(lab),
      snapshot = serializeLaboratory(lab);
    const positive = runLearningExperiment(profile, "preference");
    const aversion = runLearningExperiment(profile, "aversion");
    const reversal = runLearningExperiment(profile, "reversal");
    const points = positive.session.points.filter(
      (p) => p.cue === "amber" && p.reward !== undefined,
    );
    expect(points).toHaveLength(8);
    expect(points[0]!.after).toBeGreaterThan(0);
    expect(points.at(-1)!.after).toBeGreaterThan(points[0]!.after);
    expect(aversion.finalValue).toBeLessThan(0);
    const switched = reversal.session.points.filter(
      (p) => p.cue === "amber" && p.reward !== undefined,
    );
    expect(switched[3]!.after).toBeGreaterThan(0);
    expect(switched.at(-1)!.after).toBeLessThan(0);
    expect(positive.ticks).toBe(1440);
    expect(aversion.ticks).toBe(1440);
    expect(reversal.ticks).toBe(1440);
    expect(runLearningExperiment(profile, "reversal")).toEqual(reversal);
    expect(serializeLaboratory(lab)).toBe(snapshot);
  });
  it("allows opposite learned consequences from physiology alone with identical protocols", () => {
    const low = structuredClone(activeProfile(lab)),
      high = structuredClone(low);
    const genes = generateGenome("controlled");
    low.world.creature.genome = structuredClone(genes);
    high.world.creature.genome = structuredClone(genes);
    low.world.creature.genome.genes.toxinSensitivity = 0.12;
    high.world.creature.genome.genes.toxinSensitivity = 1.8;
    const a = runLearningExperiment(low, "diversity"),
      b = runLearningExperiment(high, "diversity");
    expect(a.finalValue).toBeGreaterThan(0);
    expect(b.finalValue).toBeLessThan(0);
    expect(a.ticks).toBe(b.ticks);
    expect(a.completed).toBe(8);
    expect(b.completed).toBe(8);
  });
});
