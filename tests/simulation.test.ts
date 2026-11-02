import { describe, expect, it } from "vitest";
import { createBrain, reinforce } from "../src/sim/brain";
import { decide } from "../src/sim/decisions";
import { hunger, ingest, metabolize } from "../src/sim/metabolism";
import { perceive } from "../src/sim/perception";
import { deserialize, serialize } from "../src/sim/persistence";
import {
  CUES,
  MAX_FOODS,
  type Cue,
  type Food,
  type World,
} from "../src/sim/types";
import {
  addFood,
  advance,
  createWorld,
  FOOD_RECIPES,
  step,
} from "../src/sim/world";

const food = (cue: Cue, id = 1): Food => ({
  id,
  cue,
  x: 300,
  y: 340,
  ...FOOD_RECIPES[cue],
});

// A controlled feeding experiment, driving the real digestive/learning pipeline.
function teach(
  world: World,
  cue: Cue,
  nutrients: number,
  toxins: number,
): number[] {
  const rewards: number[] = [];
  for (let meal = 0; meal < 6; meal++) {
    const c = world.creature;
    c.metabolism.energy = 30;
    c.metabolism.health = 100;
    expect(ingest(c.metabolism, { ...food(cue), nutrients, toxins })).toBe(
      true,
    );
    for (let tick = 0; tick < 50; tick++) {
      for (const outcome of metabolize(c.metabolism, c.genome, false)) {
        rewards.push(outcome.reward);
        reinforce(
          c.brain,
          outcome.cue,
          outcome.reward,
          c.genome.genes.learningRate,
        );
      }
    }
  }
  return rewards;
}

describe("reproducibility", () => {
  it("reproduces genomes and the entire trajectory from the seed and commands", () => {
    const a = createWorld("repeat"),
      b = createWorld("repeat");
    for (let i = 0; i < 6000; i++) {
      if (i % 300 === 0) {
        addFood(a, "amber", 200, 300);
        addFood(b, "amber", 200, 300);
      }
      step(a);
      step(b);
    }
    expect(serialize(a)).toBe(serialize(b));
  });
  it("varies genotypes and initial states across seeds", () => {
    expect(createWorld("a").creature.genome).not.toEqual(
      createWorld("b").creature.genome,
    );
  });
  it("continues bit for bit after a mid-digestion save", () => {
    const a = createWorld("checkpoint");
    advance(a, 37);
    ingest(a.creature.metabolism, food("rose"));
    advance(a, 15);
    expect(a.creature.metabolism.gut.length).toBeGreaterThan(0);
    const b = deserialize(serialize(a));
    advance(a, 7000);
    advance(b, 7000);
    expect(b).toEqual(a);
  });
});

describe("biology and perception", () => {
  it("exposes cues and positions without exposing hidden food chemistry", () => {
    const w = createWorld();
    const observations = perceive(w.creature, [
      food("amber"),
      { ...food("rose", 2), x: 599, y: 679 },
    ]);
    expect(observations).toHaveLength(1);
    expect(observations[0]).not.toHaveProperty("toxins");
    expect(observations[0]).not.toHaveProperty("nutrients");
  });
  it("spends energy and becomes hungry without food", () => {
    const w = createWorld();
    w.foods = [];
    const initial = hunger(w.creature.metabolism);
    advance(w, 1000);
    expect(hunger(w.creature.metabolism)).toBeGreaterThan(initial);
  });
  it("consumes exactly one food, fills its gut and digests over time", () => {
    const w = createWorld();
    w.foods = [food("amber")];
    const before = w.creature.metabolism.energy;
    step(w);
    expect(w.foods).toHaveLength(0);
    expect(w.creature.meals).toBe(1);
    expect(w.creature.metabolism.stomach).toBeGreaterThan(9);
    expect(w.creature.brain.amber.meals).toBe(0);
    advance(w, 60);
    expect(w.creature.metabolism.energy).toBeGreaterThan(before);
    expect(w.creature.metabolism.stomach).toBe(0);
    expect(w.creature.brain.amber.meals).toBe(1);
  });
  it("applies finite capacity and does not overfill the stomach", () => {
    const m = createWorld().creature.metabolism;
    expect(ingest(m, food("amber"))).toBe(true);
    ingest(m, food("amber"));
    ingest(m, food("amber"));
    expect(ingest(m, food("amber"))).toBe(false);
    expect(m.stomach).toBe(30);
  });
  it("reduces hunger after beneficial absorption and harms health after toxins", () => {
    const w = createWorld(),
      m = w.creature.metabolism;
    const before = hunger(m);
    ingest(m, food("amber"));
    for (let i = 0; i < 50; i++) metabolize(m, w.creature.genome, false);
    expect(hunger(m)).toBeLessThan(before);
    ingest(m, food("rose"));
    for (let i = 0; i < 50; i++) metabolize(m, w.creature.genome, false);
    expect(m.health).toBeLessThan(90);
    expect(m.toxins).toBeGreaterThan(0);
  });
  it("uses genes to change nutrient assimilation", () => {
    const a = createWorld(),
      b = createWorld();
    a.creature.genome.genes.efficiency = 0.5;
    b.creature.genome.genes.efficiency = 1;
    for (const w of [a, b]) {
      ingest(w.creature.metabolism, food("amber"));
      for (let i = 0; i < 50; i++)
        metabolize(w.creature.metabolism, w.creature.genome, false);
    }
    expect(
      b.creature.metabolism.energy - a.creature.metabolism.energy,
    ).toBeCloseTo(14);
  });
  it("moves autonomously within world bounds", () => {
    const w = createWorld();
    const position = { x: w.creature.x, y: w.creature.y };
    advance(w, 100);
    expect({ x: w.creature.x, y: w.creature.y }).not.toEqual(position);
    expect(w.creature.x).toBeGreaterThanOrEqual(0);
    expect(w.creature.x).toBeLessThanOrEqual(w.width);
    expect(w.creature.y).toBeGreaterThanOrEqual(0);
    expect(w.creature.y).toBeLessThanOrEqual(w.height);
  });
});

describe("associative learning", () => {
  it("starts with identical neutral priors for every cue", () => {
    const brain = createBrain();
    for (const cue of CUES)
      expect(brain[cue]).toEqual({ value: 0, meals: 0, lastReward: 0 });
  });
  it("progressively learns positive and negative effects through digestion", () => {
    const w = createWorld();
    const rewards = teach(w, "amber", 28, 0);
    teach(w, "rose", 5, 10);
    expect(rewards).toHaveLength(6);
    expect(w.creature.brain.amber.value).toBeGreaterThan(0.7);
    expect(w.creature.brain.rose.value).toBeLessThan(-0.7);
  });
  it("reverses preferences when chemistry is swapped: no food-type shortcut", () => {
    const w = createWorld();
    teach(w, "amber", 5, 10);
    teach(w, "rose", 28, 0);
    w.creature.genome.genes.exploration = 0;
    w.creature.metabolism.energy = 40;
    const observations = [
      { id: 1, cue: "amber" as const, x: 301, y: 340, distance: 1 },
      { id: 2, cue: "rose" as const, x: 350, y: 340, distance: 50 },
    ];
    expect(decide(w, observations)).toEqual({ kind: "seek", foodId: 2 });
  });
  it("can unlearn an association when effects change", () => {
    const w = createWorld();
    teach(w, "blue", 28, 0);
    expect(w.creature.brain.blue.value).toBeGreaterThan(0);
    teach(w, "blue", 5, 10);
    expect(w.creature.brain.blue.value).toBeLessThan(-0.5);
  });
  it("avoids a learned harmful cue even when it is the closest food", () => {
    const w = createWorld();
    teach(w, "amber", 28, 0);
    teach(w, "rose", 5, 10);
    w.creature.genome.genes.exploration = 0;
    w.creature.metabolism.energy = 40;
    expect(
      decide(w, [
        { id: 1, cue: "rose", distance: 1, x: 301, y: 340 },
        { id: 2, cue: "amber", distance: 100, x: 400, y: 340 },
      ]),
    ).toEqual({ kind: "seek", foodId: 2 });
  });
});

describe("saves and stability", () => {
  it("rejects invalid, oversized and incompatible saves", () => {
    for (const input of [
      "{",
      "{}",
      "null",
      "x".repeat(100001),
      JSON.stringify({ ...createWorld(), version: 2 }),
    ])
      expect(() => deserialize(input)).toThrow();
  });
  it.each(["rng", "tick", "width", "creature"])(
    "rejects a corrupted %s field",
    (key) => {
      const save = { ...createWorld(), [key]: -1 };
      expect(() => deserialize(JSON.stringify(save))).toThrow();
    },
  );
  it("rejects corrupt nested state and duplicate food identities", () => {
    const w = createWorld();
    w.creature.metabolism.gut = [
      { cue: "amber", remaining: 10, nutrients: 2, toxins: 0, reward: 0 },
    ];
    expect(() => deserialize(serialize(w))).toThrow();
    const b = createWorld();
    b.foods[1]!.id = b.foods[0]!.id;
    expect(() => deserialize(serialize(b))).toThrow();
    const c = createWorld();
    c.creature.brain.blue.value = NaN;
    expect(() => deserialize(serialize(c))).toThrow();
  });
  it("caps foods, clamps coordinates and rejects non-finite input", () => {
    const w = createWorld();
    expect(addFood(w, "amber", NaN, 10)).toBe(false);
    addFood(w, "amber", -1, 5000);
    expect(w.foods.at(-1)).toMatchObject({ x: 22, y: 658 });
    for (let i = 0; i < 100; i++) addFood(w, "blue", 100, 100);
    expect(w.foods).toHaveLength(MAX_FOODS);
  });
  it("keeps every state finite and serializable over 20,000 ticks with feeding", () => {
    for (const seed of ["a", "b", "c"]) {
      const w = createWorld(seed);
      for (let i = 0; i < 20_000; i++) {
        if (i % 100 === 0) addFood(w, CUES[(i / 100) % 3]!, 260, 300);
        step(w);
        if (i % 1000 === 0) expect(deserialize(serialize(w))).toEqual(w);
      }
      expect(w.events.length).toBeLessThanOrEqual(32);
    }
  });
  it("starvation ends life and freezes the simulation until restart", () => {
    const w = createWorld();
    w.foods = [];
    advance(w, 10000);
    expect(w.creature.alive).toBe(false);
    expect(w.creature.metabolism.health).toBe(0);
    const end = serialize(w);
    advance(w, 1000);
    expect(serialize(w)).toBe(end);
    expect(deserialize(end)).toEqual(w);
  });
});
