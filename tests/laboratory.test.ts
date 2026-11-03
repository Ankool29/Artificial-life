import { describe, expect, it } from "vitest";
import {
  activeProfile,
  activateProfile,
  addIndividual,
  advanceActive,
  captureEnvironment,
  createLaboratory,
  createTrial,
  deserializeLaboratory,
  MAX_LAB_BYTES,
  MAX_PROFILES,
  replaceActiveWorld,
  serializeLaboratory,
} from "../src/lab/laboratory";
import {
  GENE_RANGES,
  generateGenome,
  inheritGenome,
  physiology,
} from "../src/sim/genome";
import { createWorld, advance, step } from "../src/sim/world";
import {
  applyObjectEffects,
  INTERACTION_TICKS,
  learnInteraction,
  updateNeeds,
  zeroEffects,
} from "../src/sim/curiosity";
import { ingest, metabolize } from "../src/sim/metabolism";
import { reinforce } from "../src/sim/brain";
import { decide } from "../src/sim/decisions";
import { deserialize, serialize } from "../src/sim/persistence";
import { addObject } from "../src/sim/objects";
import type { Food, Genome } from "../src/sim/types";
import legacyV1 from "./fixtures/world-v1.json";
import legacyV2 from "./fixtures/world-v2.json";
import referenceV2 from "./fixtures/world-v2-after-300.json";

const options = (seed = "alpha") => ({
  name: seed,
  geneticSeed: seed,
  environmentSeed: "common-terrain",
});

function foodExperience(genome: Genome, recipe = { nutrients: 5, toxins: 10 }) {
  const w = createWorld("food-experiment", genome);
  const food: Food = {
    id: 1,
    cue: "rose",
    x: 300,
    y: 340,
    mass: 10,
    ...recipe,
  };
  for (let meal = 0; meal < 5; meal++) {
    w.creature.metabolism.energy = 30;
    w.creature.metabolism.health = 100;
    ingest(w.creature.metabolism, food);
    for (let i = 0; i < 80; i++)
      for (const outcome of metabolize(
        w.creature.metabolism,
        w.creature.genome,
        false,
      ))
        reinforce(
          w.creature.brain,
          outcome.cue,
          outcome.reward,
          w.creature.genome.genes.learningRate,
        );
  }
  return w;
}

describe("genetic reproducibility and inheritance", () => {
  it("separates genetic randomness from the environment and action RNG", () => {
    const a = createWorld("common", generateGenome("alpha")),
      b = createWorld("common", generateGenome("beta"));
    expect(a.foods).toEqual(b.foods);
    expect(a.rng).toBe(b.rng);
    expect(a.creature.genome).not.toEqual(b.creature.genome);
    expect(generateGenome("alpha")).toEqual(generateGenome("alpha"));
    expect(
      createWorld("other", generateGenome("alpha")).creature.genome,
    ).toEqual(a.creature.genome);
  });
  it("varies every locus including exploration within physical ranges", () => {
    const genomes = Array.from({ length: 64 }, (_, i) =>
      generateGenome(`individual-${i}`),
    );
    for (const [key, [min, max]] of Object.entries(GENE_RANGES)) {
      const values = genomes.map((g) => g.genes[key as keyof typeof g.genes]);
      expect(new Set(values).size).toBeGreaterThan(40);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(min);
      expect(Math.max(...values)).toBeLessThanOrEqual(max);
    }
  });
  it("inherits genes with bounded deterministic mutation, without sharing references", () => {
    const parent = generateGenome("parent");
    const children = Array.from({ length: 20 }, (_, i) =>
      inheritGenome(parent, `child-${i}`),
    );
    expect(inheritGenome(parent, "same")).toEqual(
      inheritGenome(parent, "same"),
    );
    expect(
      children.some(
        (child) => JSON.stringify(child) !== JSON.stringify(parent),
      ),
    ).toBe(true);
    for (const child of children)
      for (const key of Object.keys(
        GENE_RANGES,
      ) as (keyof typeof parent.genes)[]) {
        const [min, max] = GENE_RANGES[key];
        expect(
          Math.abs(child.genes[key] - parent.genes[key]),
        ).toBeLessThanOrEqual((max - min) * 0.05 + 1e-12);
      }
    children[0]!.genes.speed = 28;
    expect(parent.genes.speed).not.toBe(28);
  });
  it("does not inherit learned preferences or body state and retains the parent genome snapshot", () => {
    const lab = createLaboratory(createWorld());
    const parent = addIndividual(lab, options("parent"));
    parent.world.creature.brain.rose.value = -1;
    parent.world.creature.needs.stress = 80;
    const child = addIndividual(lab, {
      ...options("child"),
      parentId: parent.id,
    });
    expect(child.parentGenome).toEqual(parent.world.creature.genome);
    expect(child.world.creature.brain.rose.value).toBe(0);
    expect(child.world.creature.needs.stress).toBe(5);
    activateProfile(lab, parent.id);
    replaceActiveWorld(lab, createWorld("replacement"));
    expect(child.parentGenome).not.toEqual(parent.world.creature.genome);
    expect(
      deserializeLaboratory(serializeLaboratory(lab)).profiles.at(-1)!
        .parentGenome,
    ).toEqual(child.parentGenome);
  });
  it("does not turn profile labels into personalities", () => {
    const lab = createLaboratory(createWorld());
    const a = addIndividual(lab, { ...options("same"), name: "Calme" }),
      b = addIndividual(lab, { ...options("same"), name: "Intrépide" });
    expect(a.world).toEqual(b.world);
    advance(a.world, 500);
    advance(b.world, 500);
    expect(a.world).toEqual(b.world);
  });
});

describe("causal physiological differences", () => {
  it("produces opposite learned food values from actual generated genetic seeds", () => {
    const tolerant = foodExperience(generateGenome("population-98"));
    const sensitive = foodExperience(generateGenome("population-424"));
    expect(tolerant.creature.brain.rose.value).toBeGreaterThan(0.02);
    expect(sensitive.creature.brain.rose.value).toBeLessThan(-1);
  });
  it("produces opposite object effects from actual generated genetic seeds", () => {
    const rewards = ["population-121", "population-442"].map((seed) => {
      const w = createWorld("common", generateGenome(seed));
      addObject(w, "prism", 300, 340);
      w.creature.needs = { stimulation: 0, fatigue: 20, stress: 20 };
      w.creature.metabolism.energy = 80;
      const changes = zeroEffects();
      for (let i = 0; i < INTERACTION_TICKS; i++)
        applyObjectEffects(w.creature, w.objects[0]!, changes);
      return learnInteraction(w.creature, "prism", changes);
    });
    expect(rewards[0]).toBeGreaterThan(0.2);
    expect(rewards[1]).toBeLessThan(-1);
  });
  it("uses metabolic rate and digestive throughput in real internal processes", () => {
    const slow = generateGenome("same"),
      fast = generateGenome("same");
    slow.genes.metabolicRate = 0.75;
    fast.genes.metabolicRate = 1.25;
    slow.genes.digestionRate = 0.7;
    fast.genes.digestionRate = 1.3;
    const a = createWorld("same", slow),
      b = createWorld("same", fast);
    for (const w of [a, b])
      for (let i = 0; i < 20; i++)
        metabolize(w.creature.metabolism, w.creature.genome, false);
    expect(a.creature.metabolism.energy).toBeGreaterThan(
      b.creature.metabolism.energy,
    );
    const food: Food = {
      id: 1,
      cue: "blue",
      x: 0,
      y: 0,
      mass: 10,
      nutrients: 15,
      toxins: 0,
    };
    for (const w of [a, b]) {
      ingest(w.creature.metabolism, food);
      for (let i = 0; i < 10; i++)
        metabolize(w.creature.metabolism, w.creature.genome, false);
    }
    expect(a.creature.metabolism.stomach).toBeGreaterThan(
      b.creature.metabolism.stomach,
    );
  });
  it("learns opposite food consequences from toxin sensitivity, with identical experiences", () => {
    const tolerant = generateGenome("same"),
      sensitive = generateGenome("same");
    tolerant.genes.efficiency = sensitive.genes.efficiency = 1;
    tolerant.genes.toxinSensitivity = 0.12;
    sensitive.genes.toxinSensitivity = 1.8;
    const a = foodExperience(tolerant),
      b = foodExperience(sensitive);
    expect(a.creature.brain.rose.value).toBeGreaterThan(0.02);
    expect(b.creature.brain.rose.value).toBeLessThan(-1);
    for (const w of [a, b]) {
      w.creature.metabolism.energy = 40;
      w.creature.genome.genes.exploration = 0;
      w.creature.needs = { stimulation: 100, fatigue: 0, stress: 0 };
    }
    const seen = [
      { id: 1, cue: "rose" as const, x: 300, y: 340, distance: 0 },
      { id: 2, cue: "blue" as const, x: 300, y: 340, distance: 0 },
    ];
    expect(decide(a, seen)).toEqual({ kind: "seek", foodId: 1 });
    expect(decide(b, seen)).toEqual({ kind: "seek", foodId: 2 });
  });
  it("learns opposite object reactions from stimulus and stress physiology", () => {
    const low = generateGenome("same"),
      high = generateGenome("same");
    low.genes.stimulusGain = 1.45;
    low.genes.stressSensitivity = 0.3;
    high.genes.stimulusGain = 0.65;
    high.genes.stressSensitivity = 1.6;
    const values = [low, high].map((genome) => {
      const w = createWorld("object-experiment", genome);
      addObject(w, "prism", 300, 340);
      for (let trial = 0; trial < 5; trial++) {
        w.creature.needs = { stimulation: 0, fatigue: 20, stress: 20 };
        w.creature.metabolism.energy = 80;
        const changes = zeroEffects();
        for (let tick = 0; tick < INTERACTION_TICKS; tick++)
          applyObjectEffects(w.creature, w.objects[0]!, changes);
        learnInteraction(w.creature, "prism", changes);
      }
      return w.creature.objectBrain.prism.value;
    });
    expect(values[0]).toBeGreaterThan(0.15);
    expect(values[1]).toBeLessThan(-0.8);
  });
  it("also changes preferences with experience when the genome is identical", () => {
    const genome = generateGenome("same");
    const helpful = foodExperience(genome, { nutrients: 20, toxins: 0 }),
      harmful = foodExperience(genome, { nutrients: 2, toxins: 10 });
    expect(helpful.creature.genome).toEqual(harmful.creature.genome);
    expect(helpful.creature.brain.rose.value).toBeGreaterThan(0);
    expect(harmful.creature.brain.rose.value).toBeLessThan(0);
  });
  it("uses recovery and stimulation decay to produce different needs", () => {
    const a = createWorld("same", generateGenome("same")),
      b = createWorld("same", generateGenome("same"));
    if (a.creature.genome.version !== 2 || b.creature.genome.version !== 2)
      throw Error();
    a.creature.genome.genes.recoveryRate = 0.7;
    b.creature.genome.genes.recoveryRate = 1.3;
    a.creature.genome.genes.stimulationDecay = 0.7;
    b.creature.genome.genes.stimulationDecay = 1.3;
    for (const w of [a, b]) {
      w.creature.needs = { stimulation: 80, fatigue: 70, stress: 60 };
      for (let i = 0; i < 100; i++) updateNeeds(w.creature, false);
    }
    expect(a.creature.needs.fatigue).toBeGreaterThan(b.creature.needs.fatigue);
    expect(a.creature.needs.stimulation).toBeGreaterThan(
      b.creature.needs.stimulation,
    );
  });
});

describe("one active world and fair comparative trials", () => {
  it("freezes inactive individuals and resumes their exact state after switching", () => {
    const lab = createLaboratory(createWorld());
    const a = addIndividual(lab, options("a")),
      b = addIndividual(lab, options("b"));
    activateProfile(lab, a.id);
    advanceActive(lab, 17);
    const checkpoint = serialize(a.world);
    const control = deserialize(checkpoint);
    activateProfile(lab, b.id);
    advanceActive(lab, 200);
    expect(serialize(a.world)).toBe(checkpoint);
    activateProfile(lab, a.id);
    advanceActive(lab, 200);
    advance(control, 200);
    expect(a.world).toEqual(control);
    expect(activeProfile(lab).id).toBe(a.id);
  });
  it("creates fresh trials on identical captured physical environments without erasing originals", () => {
    const lab = createLaboratory(createWorld());
    addObject(activeProfile(lab).world, "prism", 300, 340);
    const a = addIndividual(lab, options("a")),
      b = addIndividual(lab, options("b"));
    a.world.creature.brain.amber.value = 0.9;
    a.world.creature.metabolism.energy = 20;
    const before = serialize(a.world);
    lab.environment = captureEnvironment(activeProfile(lab).world);
    const trialA = createTrial(lab, a.id),
      trialB = createTrial(lab, b.id);
    expect(trialA.world.foods).toEqual(trialB.world.foods);
    expect(trialA.world.objects).toEqual(trialB.world.objects);
    expect(trialA.world.rng).toBe(trialB.world.rng);
    expect(trialA.trial!.environment).toEqual(trialB.trial!.environment);
    expect(trialA.world.creature.metabolism).toEqual(
      trialB.world.creature.metabolism,
    );
    expect(trialA.world.creature.needs).toEqual(trialB.world.creature.needs);
    expect(trialA.world.creature.brain.amber.value).toBe(0);
    expect(trialA.world.tick).toBe(0);
    expect(serialize(a.world)).toBe(before);
    trialA.world.foods[0]!.nutrients = 0;
    expect(trialB.world.foods[0]!.nutrients).not.toBe(0);
  });
  it("replays a genotype identically from the same trial baseline and tick count", () => {
    const lab = createLaboratory(createWorld());
    const source = addIndividual(lab, options("repeat"));
    lab.environment = captureEnvironment(activeProfile(lab).world);
    const a = createTrial(lab, source.id),
      b = createTrial(lab, source.id);
    activateProfile(lab, a.id);
    advanceActive(lab, 300);
    activateProfile(lab, b.id);
    advanceActive(lab, 300);
    expect(a.world).toEqual(b.world);
    expect(source.world.tick).toBe(0);
  });
  it("does not share profile genomes, memories or terrain buffers", () => {
    const lab = createLaboratory(createWorld());
    const a = addIndividual(lab, options("same")),
      b = addIndividual(lab, options("same"));
    a.world.creature.genome.genes.speed = 28;
    a.world.creature.brain.amber.value = 1;
    a.world.foods = [];
    expect(b.world.creature.genome.genes.speed).not.toBe(28);
    expect(b.world.creature.brain.amber.value).toBe(0);
    expect(b.world.foods.length).toBe(12);
  });
  it("enforces the profile limit and keeps failure atomic", () => {
    const lab = createLaboratory(createWorld());
    for (let i = 1; i < MAX_PROFILES; i++)
      addIndividual(lab, options(`seed-${i}`));
    const before = serializeLaboratory(lab);
    expect(() => addIndividual(lab, options("too-many"))).toThrow();
    expect(serializeLaboratory(lab)).toBe(before);
  });
});

describe("compatibility and persisted laboratory state", () => {
  it("loads v1 and v2 worlds without changing their original genome or memories", () => {
    for (const save of [legacyV1, legacyV2]) {
      const world = deserialize(JSON.stringify(save));
      expect(world.creature.genome).toEqual(save.creature.genome);
      expect(world.creature.brain).toEqual(save.creature.brain);
      expect(physiology(world.creature.genome)).toEqual({
        metabolicRate: 1,
        digestionRate: 1,
        toxinSensitivity: 1,
        stimulusGain: 1,
        stressSensitivity: 1,
        recoveryRate: 1,
        stimulationDecay: 1,
      });
      const lab = createLaboratory(world);
      expect(deserializeLaboratory(serializeLaboratory(lab))).toEqual(lab);
    }
  });
  it("continues a legacy interaction bit for bit against the previous engine reference", () => {
    const world = deserialize(JSON.stringify(legacyV2));
    advance(world, 300);
    expect(world).toEqual(referenceV2);
  });
  it("round trips modern genomes and the full laboratory, including paused interactions and trials", () => {
    const lab = createLaboratory(createWorld("same", generateGenome("modern")));
    const world = activeProfile(lab).world;
    world.foods = [];
    world.creature.metabolism.energy = 95;
    addObject(world, "chime", 300, 340);
    advance(world, 12);
    expect(world.creature.action.kind).toBe("interact");
    const child = addIndividual(lab, {
      ...options("child"),
      parentId: lab.activeId,
    });
    lab.environment = captureEnvironment(world);
    createTrial(lab, child.id);
    const restored = deserializeLaboratory(serializeLaboratory(lab));
    expect(restored).toEqual(lab);
    advanceActive(lab, 300);
    advanceActive(restored, 300);
    expect(restored).toEqual(lab);
  });
  it("rejects malformed archives, missing profiles, bad ancestry and unsafe genes", () => {
    const baseline = createLaboratory(
      createWorld("same", generateGenome("modern")),
    );
    for (const mutate of [
      (lab: typeof baseline) => {
        lab.activeId = "missing";
      },
      (lab: typeof baseline) => {
        lab.profiles = [];
      },
      (lab: typeof baseline) => {
        lab.profiles.push(structuredClone(lab.profiles[0]!));
      },
      (lab: typeof baseline) => {
        lab.profiles[0]!.parentId = lab.activeId;
      },
      (lab: typeof baseline) => {
        lab.profiles[0]!.world.creature.genome.genes.speed = NaN;
      },
      (lab: typeof baseline) => {
        Object.assign(lab.profiles[0]!.world.creature.genome.genes, {
          unvalidated: "not a gene",
        });
      },
      (lab: typeof baseline) => {
        lab.environment = captureEnvironment(lab.profiles[0]!.world);
        lab.environment.id = "wrong";
      },
    ]) {
      const copy = structuredClone(baseline);
      mutate(copy);
      expect(() => deserializeLaboratory(serializeLaboratory(copy))).toThrow();
    }
    expect(() =>
      deserializeLaboratory("x".repeat(MAX_LAB_BYTES + 1)),
    ).toThrow();
    expect(() =>
      deserializeLaboratory(JSON.stringify({ ...baseline, version: 2 })),
    ).toThrow();
    const world = createWorld("same", generateGenome("modern"));
    if (world.creature.genome.version === 2)
      world.creature.genome.genes.toxinSensitivity = -1;
    expect(() => deserialize(serialize(world))).toThrow();
  });
  it("keeps generated physiological variants finite over long runs", () => {
    for (const seed of ["one", "two", "three", "four"]) {
      const w = createWorld("same", generateGenome(seed));
      addObject(w, "prism", 300, 340);
      for (let i = 0; i < 10000; i++) {
        step(w);
        if (i % 1000 === 0) expect(deserialize(serialize(w))).toEqual(w);
      }
    }
  });
});
