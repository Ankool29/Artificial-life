import legacy from "./fixtures/world-v1.json";
import { describe, expect, it } from "vitest";
import {
  createNeeds,
  INTERACTION_TICKS,
  motivations,
} from "../src/sim/curiosity";
import { decide } from "../src/sim/decisions";
import { addObject, OBJECT_RECIPES, removeObject } from "../src/sim/objects";
import { perceiveObjects } from "../src/sim/perception";
import { deserialize, serialize } from "../src/sim/persistence";
import {
  MAX_OBJECTS,
  OBJECT_CUES,
  type ObjectCue,
  type ObjectEffects,
  type World,
} from "../src/sim/types";
import { addFood, advance, createWorld, step } from "../src/sim/world";

const legacyJSON = JSON.stringify(legacy);

function experiment(
  w: World,
  cue: ObjectCue,
  effects: ObjectEffects,
  repeats = 5,
): void {
  let object = w.objects.find((item) => item.cue === cue);
  if (!object) {
    addObject(w, cue, 300, 340);
    object = w.objects.at(-1)!;
  }
  object.effects = { ...effects };
  for (let i = 0; i < repeats; i++) {
    Object.assign(w.creature, {
      x: object.x,
      y: object.y,
      action: { kind: "inspect", objectId: object.id },
      nextDecision: w.tick + 100,
    });
    w.creature.metabolism.energy = 85;
    w.creature.needs = { stimulation: 20, fatigue: 60, stress: 45 };
    object.availableAt = 0;
    advance(w, INTERACTION_TICKS);
  }
}

function normalizeChoice(w: World): void {
  w.creature.needs = { stimulation: 20, fatigue: 30, stress: 25 };
  w.creature.metabolism.energy = 90;
  w.creature.action = { kind: "rest" };
  for (const object of w.objects) {
    object.availableAt = 0;
    object.x = 330;
    object.y = 340;
  }
}

describe("stimulation, perception and motivation", () => {
  it("starts every object association neutral without innate preferences", () => {
    const w = createWorld();
    for (const cue of OBJECT_CUES)
      expect(w.creature.objectBrain[cue]).toEqual({
        value: 0,
        interactions: 0,
        lastReward: 0,
        expected: { stimulation: 0, fatigue: 0, stress: 0, energy: 0 },
      });
  });
  it("loses stimulation and grows curious over time; rest relieves fatigue and stress", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.action = { kind: "rest" };
    w.creature.nextDecision = 10000;
    w.creature.needs = { stimulation: 50, fatigue: 60, stress: 50 };
    const before = motivations(w.creature);
    advance(w, 200);
    expect(w.creature.needs.stimulation).toBeLessThan(50);
    expect(w.creature.needs.fatigue).toBeLessThan(60);
    expect(w.creature.needs.stress).toBeLessThan(50);
    expect(motivations(w.creature).curiosity).toBeGreaterThan(before.curiosity);
  });
  it("perceives unknown visible objects without revealing effects or distant objects", () => {
    const w = createWorld();
    addObject(w, "chime", 320, 340);
    addObject(w, "prism", 30, 30);
    const seen = perceiveObjects(w);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ cue: "chime", unknown: true });
    expect(seen[0]).not.toHaveProperty("effects");
    experiment(w, "chime", OBJECT_RECIPES.chime, 1);
    w.objects[0]!.availableAt = 0;
    expect(perceiveObjects(w)[0]!.unknown).toBe(false);
  });
  it("autonomously approaches, interacts, changes internal state and learns", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.metabolism.energy = 95;
    w.creature.needs = { stimulation: 0, fatigue: 15, stress: 20 };
    addObject(w, "chime", 355, 340);
    step(w);
    expect(w.creature.action.kind).toBe("inspect");
    advance(w, 55);
    expect(w.creature.objectBrain.chime.interactions).toBe(1);
    expect(w.creature.needs.stimulation).toBeGreaterThan(20);
    expect(w.creature.objectBrain.chime.value).toBeGreaterThan(0);
    expect(w.objects[0]!.availableAt).toBeGreaterThan(w.tick);
    expect(w.events.some((e) => e.kind === "interaction")).toBe(true);
  });
  it("lets urgent hunger beat curiosity without erasing learned food preference", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.metabolism.energy = 5;
    w.creature.needs = { stimulation: 0, fatigue: 10, stress: 0 };
    w.creature.genome.genes.exploration = 0;
    w.creature.brain.amber = { value: 0.8, meals: 5, lastReward: 0.9 };
    w.creature.brain.rose = { value: -0.8, meals: 5, lastReward: -0.9 };
    addObject(w, "chime", 300, 340);
    expect(
      decide(
        w,
        [
          { id: 80, cue: "rose", x: 300, y: 340, distance: 0 },
          { id: 81, cue: "amber", x: 390, y: 340, distance: 90 },
        ],
        perceiveObjects(w),
      ),
    ).toEqual({ kind: "seek", foodId: 81 });
    expect(w.creature.brain.amber.value).toBe(0.8);
  });
  it("rests when exhausted and explores when unstimulated", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.metabolism.energy = 95;
    w.creature.needs = { stimulation: 0, fatigue: 98, stress: 60 };
    addObject(w, "chime", 310, 340);
    expect(decide(w, [], perceiveObjects(w))).toEqual({ kind: "rest" });
    w.creature.needs = { stimulation: 0, fatigue: 0, stress: 0 };
    expect(decide(w, [], perceiveObjects(w))).toMatchObject({
      kind: "inspect",
    });
    w.objects = [];
    expect(decide(w, [], [])).toMatchObject({ kind: "wander" });
  });
});

describe("consequence-based object learning", () => {
  it("preserves exploratory food tasting after a negative association", () => {
    const w = createWorld();
    w.creature.genome.genes.exploration = 1;
    w.creature.metabolism.energy = 40;
    w.creature.needs = { stimulation: 100, fatigue: 0, stress: 0 };
    w.creature.brain.rose.value = -1.5;
    expect(
      decide(w, [{ id: 1, cue: "rose", x: 300, y: 340, distance: 0 }]),
    ).toEqual({ kind: "seek", foodId: 1 });
  });
  it("identical cues acquire opposite preferences with different histories and choices reverse", () => {
    const a = createWorld("history"),
      b = createWorld("history");
    a.foods = [];
    b.foods = [];
    const foodMemory = structuredClone(a.creature.brain);
    experiment(a, "chime", OBJECT_RECIPES.chime);
    experiment(a, "moss", OBJECT_RECIPES.prism);
    experiment(b, "chime", OBJECT_RECIPES.prism);
    experiment(b, "moss", OBJECT_RECIPES.chime);
    normalizeChoice(a);
    normalizeChoice(b);
    expect(a.creature.objectBrain.chime.value).toBeGreaterThan(0.5);
    expect(b.creature.objectBrain.chime.value).toBeLessThan(-0.5);
    const actionA = decide(a, [], perceiveObjects(a)),
      actionB = decide(b, [], perceiveObjects(b));
    expect(actionA).toEqual({
      kind: "inspect",
      objectId: a.objects.find((o) => o.cue === "chime")!.id,
    });
    expect(actionB).toEqual({
      kind: "inspect",
      objectId: b.objects.find((o) => o.cue === "moss")!.id,
    });
    expect(a.creature.brain).toEqual(foodMemory);
    expect(b.creature.brain).toEqual(foodMemory);
  });
  it("relearns consequences after an object changes effects", () => {
    const w = createWorld();
    w.foods = [];
    experiment(w, "chime", OBJECT_RECIPES.chime);
    expect(w.creature.objectBrain.chime.value).toBeGreaterThan(0);
    experiment(w, "chime", OBJECT_RECIPES.prism, 8);
    expect(w.creature.objectBrain.chime.value).toBeLessThan(-0.5);
  });
  it("uses the same learned effects differently when needs change", () => {
    const w = createWorld();
    w.foods = [];
    experiment(w, "chime", OBJECT_RECIPES.chime);
    experiment(w, "moss", OBJECT_RECIPES.moss);
    normalizeChoice(w);
    w.creature.needs = { stimulation: 0, fatigue: 0, stress: 0 };
    expect(decide(w, [], perceiveObjects(w))).toEqual({
      kind: "inspect",
      objectId: w.objects.find((o) => o.cue === "chime")!.id,
    });
    w.creature.needs = { stimulation: 90, fatigue: 70, stress: 60 };
    expect(decide(w, [], perceiveObjects(w))).toEqual({
      kind: "inspect",
      objectId: w.objects.find((o) => o.cue === "moss")!.id,
    });
  });
  it("does not learn when an object is merely drawn or approached", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.metabolism.energy = 95;
    addObject(w, "chime", 450, 340);
    advance(w, 5);
    expect(w.creature.objectBrain.chime.interactions).toBe(0);
    expect(w.creature.needs.stimulation).toBeLessThan(
      createNeeds().stimulation,
    );
  });
  it("waits for the interaction to finish before updating an association", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.metabolism.energy = 95;
    addObject(w, "chime", 300, 340);
    step(w);
    expect(w.creature.action.kind).toBe("interact");
    expect(w.creature.objectBrain.chime.interactions).toBe(0);
    advance(w, INTERACTION_TICKS - 1);
    expect(w.creature.objectBrain.chime.interactions).toBe(1);
  });
  it("cannot endlessly harvest interactions during cooldown", () => {
    const w = createWorld();
    w.foods = [];
    experiment(w, "chime", OBJECT_RECIPES.chime, 1);
    expect(perceiveObjects(w)).toHaveLength(0);
    advance(w, 50);
    expect(w.creature.objectBrain.chime.interactions).toBe(1);
  });
});

describe("migration, interruption and reproducibility", () => {
  it("loads a real v1 checkpoint preserving genome, food memory, gut, action, time and RNG", () => {
    const old = JSON.parse(legacyJSON);
    const w = deserialize(legacyJSON);
    expect(w.version).toBe(2);
    expect(w.objects).toEqual([]);
    for (const key of [
      "tick",
      "nextId",
      "rng",
      "seed",
      "foods",
      "events",
    ] as const)
      expect(w[key]).toEqual(old[key]);
    for (const key of [
      "brain",
      "genome",
      "metabolism",
      "action",
      "nextDecision",
      "meals",
      "alive",
      "x",
      "y",
      "heading",
    ] as const)
      expect(w.creature[key]).toEqual(old.creature[key]);
    expect(w.creature.metabolism.gut.length).toBeGreaterThan(0);
    advance(w, 60);
    expect(w.creature.brain.blue.meals).toBeGreaterThan(
      old.creature.brain.blue.meals,
    );
    expect(deserialize(serialize(w))).toEqual(w);
  });
  it("continues exactly after saving in the middle of an object interaction", () => {
    const a = createWorld();
    a.foods = [];
    a.creature.metabolism.energy = 95;
    addObject(a, "prism", 300, 340);
    advance(a, 12);
    expect(a.creature.action.kind).toBe("interact");
    const b = deserialize(serialize(a));
    advance(a, 3000);
    advance(b, 3000);
    expect(b).toEqual(a);
  });
  it("handles deletion of a target and credits only effects already experienced", () => {
    const w = createWorld();
    w.foods = [];
    w.creature.metabolism.energy = 95;
    addObject(w, "chime", 300, 340);
    advance(w, 8);
    const before = w.creature.needs.stimulation;
    expect(removeObject(w, w.objects[0]!.id)).toBe(true);
    const b = deserialize(serialize(w));
    step(w);
    step(b);
    expect(w).toEqual(b);
    expect(w.creature.action.kind).toBe("rest");
    expect(w.creature.objectBrain.chime.interactions).toBe(1);
    expect(w.creature.needs.stimulation).toBeLessThan(before);
  });
  it("bounds object count and shares unique IDs with food", () => {
    const w = createWorld();
    expect(addObject(w, "chime", NaN, 0)).toBe(false);
    for (let i = 0; i < 30; i++) addObject(w, "moss", 300, 340);
    expect(w.objects).toHaveLength(MAX_OBJECTS);
    expect(new Set([...w.objects, ...w.foods].map((o) => o.id)).size).toBe(
      w.objects.length + w.foods.length,
    );
  });
  it("rejects corrupt new states and unknown versions without relaxing legacy validation", () => {
    for (const mutate of [
      (w: World) => {
        w.creature.needs.stress = NaN;
      },
      (w: World) => {
        delete (w as Partial<World>).objects;
      },
      (w: World) => {
        w.objects[0]!.id = w.foods[0]!.id;
      },
      (w: World) => {
        w.objects[0]!.effects.energy = Infinity;
      },
      (w: World) => {
        w.creature.objectBrain.chime.expected.fatigue = -101;
      },
      (w: World) => {
        w.creature.action = {
          kind: "interact",
          objectId: w.objects[0]!.id,
          cue: "moss",
          remaining: 5,
          changes: { stimulation: 0, fatigue: 0, stress: 0, energy: 0 },
        };
      },
    ]) {
      const w = createWorld();
      addObject(w, "chime", 300, 340);
      mutate(w);
      expect(() => deserialize(serialize(w))).toThrow();
    }
    const old = JSON.parse(legacyJSON);
    old.creature.metabolism.energy = -1;
    expect(() => deserialize(JSON.stringify(old))).toThrow();
  });
  it("remains reproducible and bounded with food and objects over 20,000 ticks", () => {
    const a = createWorld("mixed"),
      b = createWorld("mixed");
    for (const w of [a, b])
      for (const [i, cue] of OBJECT_CUES.entries())
        addObject(w, cue, 240 + i * 60, 330);
    for (let i = 0; i < 20000; i++) {
      for (const w of [a, b]) {
        if (i % 120 === 0) addFood(w, "amber", 300, 340);
        step(w);
      }
      if (i % 1000 === 0) expect(deserialize(serialize(a))).toEqual(a);
    }
    expect(a).toEqual(b);
    expect(
      OBJECT_CUES.reduce(
        (sum, cue) => sum + a.creature.objectBrain[cue].interactions,
        0,
      ),
    ).toBeGreaterThan(5);
    expect(a.creature.brain.amber.meals).toBeGreaterThan(5);
    expect(a.creature.objectBrain.prism.value).toBeLessThan(0);
    expect(a.creature.objectBrain.moss.interactions).toBeGreaterThan(
      a.creature.objectBrain.prism.interactions,
    );
  });
});
