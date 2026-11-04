import { describe, expect, it } from "vitest";
import {
  createWorld,
  createLivingWorld,
  advance,
  step,
  setCreaturePresence,
  addFood,
} from "../src/sim/world";
import {
  enableEcology,
  ecologySummary,
  ecologicalStocks,
  configureEcology,
  plantSeed,
  amendSoil,
  uprootPlant,
  soilIndex,
} from "../src/sim/ecology";
import { MAX_PLANTS, PLANT_STAGES } from "../src/sim/ecology-types";
import { deserialize, serialize } from "../src/sim/persistence";
import {
  createLaboratory,
  captureEnvironment,
  createTrial,
  deserializeLaboratory,
  serializeLaboratory,
} from "../src/lab/laboratory";
import { generateGenome } from "../src/sim/genome";
import { perceive } from "../src/sim/perception";
import { LearningObservatory } from "../src/observatory/recorder";
import { addDispenser } from "../src/sim/devices";
import { addObject } from "../src/sim/objects";
import {
  MAX_LINKS,
  MAX_EPISODES,
  MAX_TRANSITIONS,
  MAX_GUT_CREDITS,
  MAX_HYPOTHESES,
} from "../src/sim/instrumental-types";

function garden(seed = "ecology-test", founders = true) {
  const w = createWorld(seed);
  w.foods = [];
  enableEcology(w, { creaturePresent: false, founders });
  return w;
}
function conserved(w: ReturnType<typeof garden>) {
  const e = w.ecology!,
    stocks = ecologicalStocks(e);
  for (const key of ["water", "minerals", "energy"] as const) {
    const b = e.budgets[key];
    expect(b.initial + b.input - b.output).toBeCloseTo(stocks[key], 5);
  }
}
describe("independent plant physics and resource accounting", () => {
  it("germinates, grows, fruits and reproduces without a creature", () => {
    const w = garden();
    const seen = new Set<string>();
    for (let t = 0; t < 18000; t++) {
      step(w);
      if (t % 100 === 0) {
        w.ecology!.plants.forEach((p) => seen.add(p.stage));
        conserved(w);
      }
    }
    const e = w.ecology!;
    expect(e.counters.germinated).toBeGreaterThan(0);
    expect(e.counters.produced).toBeGreaterThan(0);
    expect(e.counters.born).toBeGreaterThan(0);
    expect(e.counters.died).toBeGreaterThan(0);
    for (const s of [
      "seed",
      "germinating",
      "growing",
      "mature",
      "fruiting",
      "senescent",
      "dead",
    ])
      expect(seen.has(s)).toBe(true);
    expect(w.creature.meals).toBe(0);
  });
  it("accounts for founder imports, external amendments, uprooting, decomposition and runoff", () => {
    const w = garden("flows", false);
    const e = w.ecology!;
    plantSeed(w, "amber", 300, 340);
    amendSoil(w, soilIndex(300, 340), 100, 40);
    conserved(w);
    expect(e.budgets.water.output).toBeGreaterThan(0);
    advance(w, 2200);
    conserved(w);
    expect(uprootPlant(w, e.plants[0]!.id)).toBe(true);
    conserved(w);
    expect(uprootPlant(w, 999)).toBe(false);
    expect(plantSeed(w, "blue", NaN, 300)).toBe(false);
    expect(configureEcology(w, { light: NaN })).toBe(false);
  });
  it("allows local extinction without spontaneous replacement", () => {
    const w = createWorld("barren");
    w.foods = [];
    const e = enableEcology(w, {
      creaturePresent: false,
      water: 0,
      minerals: 0,
      light: 0,
      waterInput: 0,
      mineralInput: 0,
    });
    advance(w, 12000);
    expect(e.counters.died).toBe(9);
    expect(e.plants).toHaveLength(0);
    expect(e.counters.born).toBe(0);
    const born = e.counters.born;
    advance(w, 12000);
    expect(e.counters.born).toBe(born);
    conserved(w);
  });
  it("shares finite local resources proportionally and makes germination slower under crowding", () => {
    const isolated = garden("spacing", false),
      crowded = garden("spacing", false);
    plantSeed(isolated, "amber", 300, 340);
    for (let i = 0; i < 12; i++) plantSeed(crowded, "amber", 300, 340);
    advance(isolated, 800);
    advance(crowded, 800);
    expect(isolated.ecology!.counters.germinated).toBe(1);
    expect(crowded.ecology!.counters.germinated).toBe(0);
    const waters = crowded.ecology!.plants.map((p) => p.water);
    expect(Math.max(...waters) - Math.min(...waters)).toBeLessThan(1e-9);
    conserved(crowded);
  });
  it("bounds plants, live foods and corpses over a prolonged deterministic run", () => {
    const w = garden("bounded");
    for (let i = 0; i < 36000; i++) {
      step(w);
      if (i % 1000 === 0) {
        expect(w.ecology!.plants.length).toBeLessThanOrEqual(MAX_PLANTS);
        expect(w.foods.length).toBeLessThanOrEqual(48);
        conserved(w);
        expect(deserialize(serialize(w))).toEqual(w);
      }
    }
    expect(serialize(w).length).toBeLessThan(100000);
    expect(w.ecology!.counters.decayed).toBeGreaterThan(0);
  });
  it.each(["light", "water", "minerals"] as const)(
    "limits growth when %s alone is unavailable",
    (resource) => {
      const good = garden("isolated-deficit"),
        bad = createWorld("isolated-deficit");
      bad.foods = [];
      enableEcology(bad, {
        creaturePresent: false,
        ...(resource === "light" ? { light: 0 } : {}),
        ...(resource === "water" ? { water: 0, waterInput: 0 } : {}),
        ...(resource === "minerals" ? { minerals: 0, mineralInput: 0 } : {}),
      });
      advance(good, 4000);
      advance(bad, 4000);
      expect(good.ecology!.counters.produced).toBeGreaterThan(0);
      expect(bad.ecology!.counters.produced).toBeLessThan(
        good.ecology!.counters.produced,
      );
      expect(
        bad.ecology!.plants.reduce((sum, p) => sum + p.biomass, 0),
      ).toBeLessThan(
        good.ecology!.plants.reduce((sum, p) => sum + p.biomass, 0),
      );
      conserved(good);
      conserved(bad);
    },
  );
  it("retains a paid fruit bud at the shared food cap and releases it when space opens", () => {
    const w = garden("full-world");
    while (w.foods.length < 48) addFood(w, "blue", 50, 50);
    advance(w, 2600);
    const e = w.ecology!;
    expect(e.counters.produced).toBe(0);
    expect(e.plants.some((p) => p.bud?.remaining === 0)).toBe(true);
    conserved(w);
    expect(deserialize(serialize(w))).toEqual(w);
    w.foods.pop(); // Explicit external removal of a non-ecological food.
    advance(w, 10);
    expect(w.foods).toHaveLength(48);
    expect(e.counters.produced).toBe(1);
    expect(e.fruits).toHaveLength(1);
    conserved(w);
  });
});

describe("creature integration without new cognitive rules", () => {
  it("does not consult the creature's needs, health, genes, action RNG or learned values", () => {
    const a = garden("autonomy"),
      b = structuredClone(a);
    b.creature.genome = generateGenome("other-genome");
    b.creature.metabolism.energy = 0;
    b.creature.metabolism.health = 0;
    b.creature.alive = false;
    b.creature.brain.amber.value = -2;
    b.rng = 4;
    advance(a, 8000);
    advance(b, 8000);
    expect(a.ecology).toEqual(b.ecology);
    expect(a.foods).toEqual(b.foods);
    expect(a.creature.metabolism.energy).toBe(52);
    expect(b.rng).toBe(4);
  });
  it("keeps the world growing after death while preserving the classical dead-world path", () => {
    const w = createLivingWorld("death-world");
    w.creature.metabolism.health = 0;
    w.creature.alive = false;
    const body = structuredClone(w.creature);
    advance(w, 400);
    expect(w.tick).toBe(400);
    expect(w.ecology!.time).toBe(40);
    expect(w.creature).toEqual(body);
    const old = createWorld();
    old.creature.alive = false;
    old.creature.metabolism.health = 0;
    advance(old, 100);
    expect(old.tick).toBe(0);
  });
  it("uses ordinary food perception and digestion, with no producer or hidden quality in perception", () => {
    const w = garden("eat-fruit");
    while (!w.ecology!.fruits.length && w.tick < 5000) step(w);
    expect(w.ecology!.fruits.length).toBeGreaterThan(0);
    const id = w.ecology!.fruits[0]!.foodId,
      food = w.foods.find((f) => f.id === id)!;
    w.creature.x = food.x;
    w.creature.y = food.y;
    w.creature.metabolism.energy = 20;
    const observation = perceive(w.creature, w.foods).find((o) => o.id === id)!;
    expect(observation).not.toHaveProperty("plantId");
    expect(observation).not.toHaveProperty("nutrients");
    expect(observation).not.toHaveProperty("toxins");
    setCreaturePresence(w, true);
    w.creature.action = { kind: "seek", foodId: id };
    w.creature.nextDecision = w.tick + 20;
    step(w);
    expect(w.ecology!.counters.consumed).toBe(1);
    expect(w.creature.metabolism.gut.length).toBeGreaterThan(0);
    conserved(w);
    setCreaturePresence(w, false);
    const body = structuredClone(w.creature);
    advance(w, 100);
    expect(w.creature).toEqual(body);
  });
  it("produces no direct reward at appearance and preserves machine and object mechanics", () => {
    const w = garden("coexist");
    addDispenser(w, 335, 340);
    addObject(w, "chime", 300, 340);
    advance(w, 5000);
    expect(w.ecology!.counters.produced).toBeGreaterThan(0);
    expect(w.creature.brain.amber.meals).toBe(0);
    expect(w.instrumental!.memories).toEqual([]);
    expect(w.instrumental!.devices[0]!.stock).toBe(12);
  });
});

describe("ecological saves, profiles and deterministic observation", () => {
  it("replays the complete trajectory across a non-second save and observatory interruptions", () => {
    const a = createLivingWorld("same-ecology"),
      o = new LearningObservatory();
    advance(a, 377);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 3000; i++) {
      if (i % 100 === 0) o.setEnabled(i % 300 !== 100);
      step(a);
      step(b, o.observerFor(b));
      if (i % 100 === 0) expect(serialize(a)).toBe(serialize(b));
    }
    conserved(a);
  });
  it("captures ecological time, resources and RNG for matched fresh laboratory trials", () => {
    const w = garden("eco-terrain");
    advance(w, 2537);
    const lab = createLaboratory(w);
    lab.environment = captureEnvironment(w);
    const a = createTrial(lab, lab.activeId),
      b = createTrial(lab, lab.activeId);
    expect(a.world.ecology).toEqual(w.ecology);
    expect(a.world.ecology).not.toBe(w.ecology);
    advance(a.world, 1000);
    advance(b.world, 1000);
    expect(a.world).toEqual(b.world);
    expect(deserializeLaboratory(serializeLaboratory(lab))).toEqual(lab);
  });
  it("rejects corrupted accounting, dangling fruit references, duplicate identities and invalid stages", () => {
    const w = garden("invalid-eco");
    advance(w, 2200);
    expect(w.ecology!.fruits.length).toBeGreaterThan(0);
    for (const mutate of [
      (w: ReturnType<typeof garden>) => {
        w.ecology!.budgets.energy.input += 1;
      },
      (w: ReturnType<typeof garden>) => {
        w.ecology!.fruits[0]!.foodId = w.nextId;
      },
      (w: ReturnType<typeof garden>) => {
        w.ecology!.plants[0]!.id = w.foods[0]!.id;
      },
      (w: ReturnType<typeof garden>) => {
        w.ecology!.plants[0]!.stage = "bad" as (typeof PLANT_STAGES)[number];
      },
    ]) {
      const b = structuredClone(w);
      mutate(b);
      expect(() => deserialize(serialize(b))).toThrow();
    }
  });
  it("does not change old-world genomes, memories or RNG when ecology is introduced", () => {
    const w = createWorld("existing");
    addFood(w, "amber", 300, 340);
    advance(w, 40);
    const c = structuredClone(w.creature),
      rng = w.rng;
    enableEcology(w);
    expect(w.creature).toEqual(c);
    expect(w.rng).toBe(rng);
    expect(ecologySummary(w)!.residuals.energy).toBeCloseTo(0);
  });
});

// Exercise both extensions at their supported cardinality budgets together.
it("keeps a full plant population and maximal instrumental evidence importable together", () => {
  const w = createWorld("combined-budget");
  w.foods = [];
  for (const x of [260, 280, 320, 340]) addDispenser(w, x, 340);
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

  enableEcology(w, { founders: false });
  for (let i = 0; i < MAX_PLANTS; i++)
    plantSeed(w, "amber", 60 + (i % 6) * 96, 60 + Math.floor(i / 6) * 112);
  expect(serialize(w).length).toBeLessThan(100000);
  expect(deserialize(serialize(w))).toEqual(w);
  const lab = createLaboratory(w);
  expect(deserializeLaboratory(serializeLaboratory(lab))).toEqual(lab);
});
