import { describe, expect, it } from "vitest";
import {
  addDispenser,
  pressDevice,
  updateDevices,
  refillDevice,
  removeDevice,
} from "../src/sim/devices";
import {
  beginAction,
  observeChange,
  newlyPerceivedResources,
  perceiveActuators,
  perceiveChange,
  actuatorScores,
} from "../src/sim/instrumental";
import {
  createWorld,
  step,
  advance,
  addFood,
  FOOD_RECIPES,
} from "../src/sim/world";
import { decide } from "../src/sim/decisions";
import { perceive, perceiveObjects } from "../src/sim/perception";
import { deserialize, serialize } from "../src/sim/persistence";
import {
  createLaboratory,
  captureEnvironment,
  createTrial,
  deserializeLaboratory,
  serializeLaboratory,
  activateProfile,
} from "../src/lab/laboratory";
import { LearningObservatory } from "../src/observatory/recorder";
import { generateGenome } from "../src/sim/genome";
import {
  EVENT_WINDOW,
  MAX_DEVICES,
  MAX_EPISODES,
  MAX_LINKS,
  MAX_TRANSITIONS,
} from "../src/sim/instrumental-types";
import {
  runScientificCase,
  matchedProbe,
} from "../src/experiments/instrumental";

function world(seed = "instrument-test") {
  const w = createWorld(seed);
  w.foods = [];
  addDispenser(w, 335, 340);
  return w;
}
describe("independent device physics", () => {
  it("moves, reserves one berry, delays production and enforces stock/cooldown without cognitive reward", () => {
    const w = world(),
      d = w.instrumental!.devices[0]!,
      brain = structuredClone(w.creature.brain),
      rng = w.rng;
    const motion = pressDevice(w, d);
    expect(motion.kind).toBe("motion");
    expect(d.stock).toBe(11);
    expect(w.foods).toHaveLength(0);
    pressDevice(w, d);
    expect(d.stock).toBe(11);
    w.tick = d.delayTicks;
    expect(updateDevices(w)).toHaveLength(1);
    expect(w.foods[0]).toMatchObject({ cue: "amber", ...FOOD_RECIPES.amber });
    expect(w.creature.brain).toEqual(brain);
    expect(w.instrumental!.memories).toEqual([]);
    expect(w.rng).toBe(rng);
    d.stock = 0;
    w.tick = d.readyAt;
    pressDevice(w, d);
    w.tick += d.delayTicks;
    expect(updateDevices(w)).toEqual([]);
    expect(refillDevice(w, d.id)).toBe(true);
    expect(d.stock).toBe(d.capacity);
  });
  it("bounds devices and handles a full garden without unbounded production", () => {
    const w = world(),
      d = w.instrumental!.devices[0]!;
    while (addFood(w, "amber", 300, 340)) {
      /* fill the physical capacity */
    }
    pressDevice(w, d);
    w.tick = d.delayTicks;
    expect(updateDevices(w)).toEqual([]);
    expect(d.pendingAt).not.toBeNull();
    w.foods.pop();
    expect(updateDevices(w)).toHaveLength(1);
    expect(w.foods).toHaveLength(48);
    for (let i = 1; i < MAX_DEVICES; i++)
      expect(addDispenser(w, 50 + i * 50, 50)).toBe(true);
    expect(addDispenser(w, 100, 100)).toBe(false);
    expect(removeDevice(w, d.id)).toBe(true);
  });
  it("keeps all hidden recipes, stocks and timers out of perception and initial decisions", () => {
    const a = world(),
      b = structuredClone(a),
      d = b.instrumental!.devices[0]!;
    d.stock = 0;
    d.readyAt = 9999;
    d.recipe = { cue: "rose", nutrients: 0, toxins: 100, mass: 36 };
    expect(perceiveActuators(a)).toEqual(perceiveActuators(b));
    const decisions = [a, b].map((w) =>
      decide(
        w,
        perceive(w.creature, w.foods),
        perceiveObjects(w),
        undefined,
        perceiveActuators(w),
      ),
    );
    expect(decisions[0]).toEqual(decisions[1]);
    expect(a.rng).toBe(b.rng);
    expect(perceiveActuators(a)[0]).not.toHaveProperty("stock");
    expect(perceiveActuators(a)[0]).not.toHaveProperty("recipe");
  });
});
describe("perception and temporal attribution", () => {
  it("does not transfer the hidden source ID of a produced food to the learner", () => {
    const w = world(),
      physical = {
        kind: "resource" as const,
        tick: 1,
        targetId: 999,
        foodId: 14,
        cue: "amber" as const,
        x: 330,
        y: 340,
      };
    const perceived = perceiveChange(w, physical)!;
    expect(perceived).not.toHaveProperty("targetId");
    expect(perceived).toMatchObject({ foodId: 14, cue: "amber" });
    physical.x = 590;
    physical.y = 50;
    expect(perceiveChange(w, physical)).toBeUndefined();
  });
  it("observes generic newly visible resources, including food placed without a device", () => {
    const w = world();
    addFood(w, "blue", 330, 340);
    const events = newlyPerceivedResources(w, perceive(w.creature, w.foods));
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("resource");
    expect(events[0]).not.toHaveProperty("targetId");
    expect(newlyPerceivedResources(w, perceive(w.creature, w.foods))).toEqual(
      [],
    );
  });
  it("learns a transition on appearance, but earns biological value only after normal digestion", () => {
    const w = world();
    w.creature.genome.genes.exploration = 0;
    let firstProduction: number | undefined, firstCredit: number | undefined;
    advance(w, 140, (e) => {
      if (e.kind !== "instrumental") return;
      if (e.trace.phase === "production" && firstProduction === undefined) {
        firstProduction = e.tick;
        expect(w.instrumental!.memories[0]!.value).toBe(0);
      }
      if (e.trace.phase === "credit") firstCredit ??= e.tick;
    });
    expect(firstProduction).toBeDefined();
    expect(firstCredit).toBeGreaterThan(firstProduction!);
    expect(
      w.instrumental!.memories.some(
        (m) => m.probability > 0 && m.value > 0 && m.outcomes > 0,
      ),
    ).toBe(true);
    expect(w.creature.brain.amber.meals).toBeGreaterThan(0);
  });
  it("does not guess a unique source when two recent actions could explain an appearance", () => {
    const w = world();
    addDispenser(w, 345, 340);
    for (const target of perceiveActuators(w)) beginAction(w, target, []);
    observeChange(w, {
      kind: "resource",
      tick: 0,
      foodId: w.nextId++,
      cue: "amber",
      x: 350,
      y: 340,
    });
    expect(w.instrumental!.links).toEqual([]);
    expect(
      w.instrumental!.memories.every(
        (m) => m.probability === 0 && m.value === 0,
      ),
    ).toBe(true);
    expect(w.instrumental!.episodes.every((e) => !e.covered)).toBe(true);
  });
  it("credits the earlier observed chain, not a distracting action immediately before digestion", () => {
    const w = world("credit-not-last-touch"),
      source = w.instrumental!.devices[0]!.id;
    for (let tick = 0; tick < 100 && !w.creature.metabolism.gut.length; tick++)
      step(w);
    expect(w.creature.metabolism.gut.length).toBeGreaterThan(0);
    addDispenser(w, w.creature.x, w.creature.y);
    const distractor = w.instrumental!.devices[1]!;
    distractor.stock = 0;
    w.creature.action = { kind: "use", targetId: distractor.id };
    w.creature.nextDecision = w.tick + 20;
    let credited: number | undefined;
    advance(w, 80, (event) => {
      if (event.kind === "instrumental" && event.trace.phase === "credit")
        credited ??= event.trace.targetId;
    });
    expect(credited).toBe(source);
    expect(credited).not.toBe(distractor.id);
  });
  it("requires a covered observation window before learning from an absence", () => {
    const a = world(),
      b = structuredClone(a);
    for (const w of [a, b]) {
      w.instrumental!.devices[0]!.stock = 0;
      beginAction(w, perceiveActuators(w)[0]!, []);
      w.instrumental!.memories[0]!.probability = 0.8;
      w.creature.nextDecision = 999;
      w.creature.action = { kind: "rest" };
    }
    b.creature.x = 20;
    b.creature.y = 20;
    advance(a, EVENT_WINDOW + 1);
    advance(b, EVENT_WINDOW + 1);
    expect(a.instrumental!.memories[0]!.probability).toBeLessThan(0.8);
    expect(b.instrumental!.memories[0]!.probability).toBe(0.8);
  });
});
describe("persistence and non-interference", () => {
  it.each([5, 15, 35, 55, 90])(
    "continues identically through a saved delay/eligibility/digestion at tick %i",
    (ticks) => {
      const a = world();
      advance(a, ticks);
      const b = deserialize(serialize(a));
      for (let i = 0; i < 300; i++) {
        step(a);
        step(b);
        expect(serialize(b)).toBe(serialize(a));
      }
    },
  );
  it("preserves device physics in fresh laboratory terrains, neutralizing instrumental memories", () => {
    const w = world();
    advance(w, 120);
    const lab = createLaboratory(w);
    lab.environment = captureEnvironment(w);
    const p = createTrial(lab, lab.activeId);
    expect(p.world.instrumental!.devices).toEqual(lab.environment.devices);
    expect(p.world.instrumental!.memories).toEqual([]);
    expect(lab.profiles[0]!.world).toBe(w);
    activateProfile(lab, p.id);
    expect(deserializeLaboratory(serializeLaboratory(lab))).toEqual(lab);
  });
  it("rejects malformed extension data and broken references without changing legacy validation", () => {
    const w = world();
    advance(w, 20);
    for (const mutate of [
      (w: ReturnType<typeof world>) => {
        w.instrumental!.devices[0]!.stock = -1;
      },
      (w: ReturnType<typeof world>) => {
        w.instrumental!.devices[0]!.id = w.nextId;
      },
      (w: ReturnType<typeof world>) => {
        w.instrumental!.memories[0]!.probability = Number.NaN;
      },
      (w: ReturnType<typeof world>) => {
        w.instrumental!.gut.push({ episodeId: 9999, foodId: null });
      },
    ]) {
      const copy = structuredClone(w);
      mutate(copy);
      expect(() => deserialize(serialize(copy))).toThrow();
    }
  });
  it("keeps every tick and RNG identical with the observatory enabled, disabled and interrupted", () => {
    const a = world("observer-devices"),
      b = structuredClone(a);
    const recorder = new LearningObservatory();
    for (let tick = 0; tick < 1600; tick++) {
      if (tick % 100 === 0) recorder.setEnabled(tick % 300 !== 100);
      step(a);
      step(b, recorder.observerFor(b));
      expect(serialize(b)).toBe(serialize(a));
    }
    expect(recorder.inspect(b)!.instrumental.length).toBeGreaterThan(0);
    expect(
      recorder.inspect(b)!.history.some((e) => e.kind === "instrumental"),
    ).toBe(true);
  });
  it("bounds transitions, episodes, links, digestion credits and observation history", () => {
    const w = world("bounded-devices");
    advance(w, 6000);
    expect(w.instrumental!.memories.length).toBeLessThanOrEqual(
      MAX_TRANSITIONS,
    );
    expect(w.instrumental!.episodes.length).toBeLessThanOrEqual(MAX_EPISODES);
    expect(w.instrumental!.links.length).toBeLessThanOrEqual(MAX_LINKS);
    expect(w.instrumental!.gut.length).toBe(w.creature.metabolism.gut.length);
    expect(serialize(w).length).toBeLessThan(100000);
    expect(deserialize(serialize(w))).toEqual(w);
  });
});
describe("biology and causal ablations", () => {
  it("permits different learned values from toxin sensitivity alone, without predefined preferences", () => {
    const low = generateGenome("physiology-control"),
      high = structuredClone(low);
    low.genes.toxinSensitivity = 0.12;
    high.genes.toxinSensitivity = 1.8;
    const a = runScientificCase(
      "same-physiology-environment",
      true,
      "harmful",
      low,
    );
    const b = runScientificCase(
      "same-physiology-environment",
      true,
      "harmful",
      high,
    );
    expect(a.valueBeforeOutage).toBeGreaterThan(0);
    expect(b.valueBeforeOutage).toBeLessThan(0);
  });
  it("changes selection when learned terms are ablated, holding genotype, exposure counts and food memories fixed", () => {
    const w = world("retrieval-control");
    advance(w, 1200);
    const learned = matchedProbe(w),
      ablated = matchedProbe(w, true);
    expect(learned.score!).toBeGreaterThan(ablated.score!);
    expect(learned.firstChoice).toBe("use");
    expect(ablated.firstChoice).not.toBe("use");
  });
  it("cannot learn instrumental value in the control even though food and physiological learning continue", () => {
    const w = world("frozen-plasticity");
    w.instrumental!.learning = false;
    advance(w, 1200);
    expect(
      w.instrumental!.memories.every(
        (m) => m.value === 0 && m.probability === 0,
      ),
    ).toBe(true);
    expect(w.creature.brain.amber.meals).toBeGreaterThan(0);
    expect(
      actuatorScores(
        w,
        perceiveActuators(w),
        perceive(w.creature, w.foods),
        0.5,
      ).every((score) => score.value === 0),
    ).toBe(true);
  });
});
