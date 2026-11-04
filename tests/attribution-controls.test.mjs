import { test, expect } from "vitest";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
const root = process.env.LUMA_ENGINE_ROOT ?? process.cwd();
const { createWorld, step, addFood } = await import(`${root}/src/sim/world.ts`);
const { addDispenser, pressDevice } = await import(
  `${root}/src/sim/devices.ts`
);
const { addObject } = await import(`${root}/src/sim/objects.ts`);
const { generateGenome } = await import(`${root}/src/sim/genome.ts`);
const { ingest } = await import(`${root}/src/sim/metabolism.ts`);
const { beginAction, perceiveActuators, registerIngestion } = await import(
  `${root}/src/sim/instrumental.ts`
);
const { serialize, deserialize } = await import(
  `${root}/src/sim/persistence.ts`
);
const limits = await import(`${root}/src/sim/instrumental-types.ts`);
const hash = (x) =>
  createHash("sha256")
    .update(typeof x === "string" ? x : JSON.stringify(x))
    .digest("hex");
const sourceHash = createHash("sha256");
for (const f of readdirSync(`${root}/src/sim`)
  .filter((f) => f.endsWith(".ts"))
  .sort())
  sourceHash.update(f).update(readFileSync(`${root}/src/sim/${f}`));
const metadata = {
  referenceCommit: "ba5eac0ccf69ef0f421c6208da8e1dbaf3dede89",
  engine: process.env.ENGINE_LABEL ?? "identity-v2",
  simulationSourceSha256: sourceHash.digest("hex"),
  node: process.versions.node,
};
function prepared(seed, learning, positions = [335]) {
  const w = createWorld("matched-exposure", generateGenome(seed));
  w.foods = [];
  w.creature.nextDecision = 10000000;
  for (const x of positions) addDispenser(w, x, 340);
  w.instrumental.learning = learning;
  return w;
}
function press(w, index) {
  const d = w.instrumental.devices[index],
    target = perceiveActuators(w).find((t) => t.id === d.id);
  beginAction(w, target, []);
  pressDevice(w, d);
}
function observer(w, productions, credits, rewards) {
  return (e) => {
    if (e.kind === "instrumental" && e.trace.phase === "production")
      productions.set(e.trace.foodId, e.trace.targetId);
    if (e.kind === "instrumental" && e.trace.phase === "credit")
      credits.push({ ...e.trace, tick: e.tick });
    if (e.kind === "food-learning") rewards.push(e.reward);
  };
}
function exposure(seed, learning, condition, delay) {
  const w = prepared(seed, learning),
    d = w.instrumental.devices[0],
    rows = [];
  d.recipe = {
    cue: "amber",
    mass: 10,
    nutrients: condition === "nutritious" ? 28 : 5,
    toxins: condition === "nutritious" ? 0 : 10,
  };
  for (let trial = 0; trial < 6; trial++) {
    const earliestStart = (rows.at(-1)?.start ?? -120) + 120;
    while (w.tick < earliestStart) {
      step(w);
      w.creature.metabolism.energy = 50;
    }
    Object.assign(w.creature.metabolism, {
      health: 100,
      energy: 50,
      toxins: 0,
      stomach: 0,
      gut: [],
    });
    w.instrumental.gut = [];
    const productions = new Map(),
      credits = [],
      rewards = [],
      observe = observer(w, productions, credits, rewards),
      start = w.tick;
    press(w, 0);
    for (let i = 0; i < 8 + delay; i++) {
      step(w, observe);
      w.creature.metabolism.energy = 50;
    }
    expect(w.foods.length).toBe(1);
    const f = w.foods[0],
      ingestionTick = w.tick;
    Object.assign(w.creature.metabolism, {
      health: 100,
      energy: 20,
      toxins: 0,
    });
    expect(ingest(w.creature.metabolism, f)).toBe(true);
    registerIngestion(w, f.id);
    w.foods = [];
    for (let i = 0; i < 400 && w.creature.metabolism.gut.length; i++)
      step(w, observe);
    expect(w.creature.metabolism.gut.length).toBe(0);
    expect(w.creature.alive).toBe(true);
    const m = w.instrumental.memories.find(
      (m) => m.targetId === d.id && m.situation === "clear",
    );
    rows.push({
      trial,
      start,
      appearanceTick: start + 8,
      ingestionTick,
      end: w.tick,
      reward: rewards[0],
      credit: credits[0] ?? null,
      foodValue: w.creature.brain.amber.value,
      probability: m?.probability ?? 0,
      value: m?.value ?? 0,
      biologyHash: hash(w.creature.metabolism),
      rng: w.rng,
      stateBytes: serialize(w).length,
    });
  }
  return { seed, genome: w.creature.genome, learning, condition, delay, rows };
}
function ambiguity(kind, reverse) {
  const positions =
    kind === "adjacent"
      ? [260, 300]
      : kind === "indistinguishable"
        ? [300, 300]
        : [300];
  const w = prepared("hunger-g00", true, positions);
  const productions = new Map(),
    credits = [],
    rewards = [],
    observe = observer(w, productions, credits, rewards);
  for (let j = 0; j < positions.length; j++) {
    if (kind === "coincidence") w.instrumental.devices[j].stock = 0;
    press(w, j);
  }
  for (let i = 0; i < 7; i++) step(w, observe);
  if (kind === "two-resources-one-action" || kind === "coincidence") {
    addFood(w, "amber", 322, 340);
    productions.set(w.foods.at(-1).id, null);
  }
  // Reverse physical food iteration, not the brain's provenance data. Both orders
  // contain identical observations. Deferred pending output is represented as a
  // genuine physical berry before the same perception tick.
  if (reverse) {
    const { updateDevices } = deviceModule;
    w.tick++;
    const events = updateDevices(w);
    w.tick--;
    for (const e of events)
      if (e.kind === "resource") productions.set(e.foodId, e.targetId);
    w.foods.reverse();
  }
  step(w, observe);
  const bindings = structuredClone(w.instrumental.links),
    foodIds = w.foods.map((f) => f.id),
    sources = foodIds.map((id) => productions.get(id));
  for (const f of [...w.foods]) {
    Object.assign(w.creature.metabolism, {
      health: 100,
      energy: 20,
      toxins: 0,
    });
    expect(ingest(w.creature.metabolism, f)).toBe(true);
    registerIngestion(w, f.id);
    w.foods = w.foods.filter((x) => x.id !== f.id);
    for (let i = 0; i < 400 && w.creature.metabolism.gut.length; i++)
      step(w, observe);
  }
  return {
    kind,
    reverse,
    bindings,
    foodIds,
    sources,
    credits,
    rewards,
    correct: credits.filter((t) => productions.get(t.foodId) === t.targetId)
      .length,
    false: credits.filter((t) => productions.get(t.foodId) !== t.targetId)
      .length,
  };
}
const deviceModule = await import(`${root}/src/sim/devices.ts`);
function memoryBudget() {
  const w = prepared("hunger-g00", true, [300, 310, 320, 330]),
    s = w.instrumental;
  const modern = s.version === 2;
  s.nextEpisode = limits.MAX_EPISODES + 1;
  for (let i = 0; i < limits.MAX_EPISODES; i++)
    s.episodes.push({
      id: i + 1,
      targetId: s.devices[i % 4].id,
      situation: "clear",
      tick: 0,
      x: 300,
      y: 340,
      covered: false,
      eventSeen: !modern,
    });
  const hypotheses = Array.from({ length: 4 }, (_, i) => ({
    episodeId: i + 1,
    targetId: s.devices[i].id,
    situation: "clear",
    actionTick: 0,
  }));
  for (let i = 0; i < 48; i++) {
    addFood(w, "amber", 300, 340);
    if (i < limits.MAX_LINKS)
      s.links.push(
        modern
          ? {
              foodId: w.foods.at(-1).id,
              episodeId: null,
              tick: 0,
              observedTick: 0,
              bound: false,
              hypotheses: structuredClone(hypotheses),
            }
          : {
              foodId: w.foods.at(-1).id,
              episodeId: 1 + (i % limits.MAX_EPISODES),
              tick: 0,
            },
      );
  }
  const gutBudget = modern ? limits.MAX_GUT_CREDITS : 4;
  for (let i = 0; i < gutBudget; i++) {
    w.creature.metabolism.gut.push({
      cue: "amber",
      remaining: modern ? 0.5 : 9,
      nutrients: 0,
      toxins: 0,
      reward: 0,
    });
    s.gut.push(
      modern
        ? {
            foodId: w.nextId++,
            episodeId: null,
            observedTick: 0,
            bound: false,
            hypotheses: structuredClone(hypotheses),
          }
        : { foodId: w.nextId++, episodeId: i + 1 },
    );
  }
  w.creature.metabolism.stomach = modern ? gutBudget * 0.5 : 36;
  for (let i = 0; i < limits.MAX_TRANSITIONS; i++)
    s.memories.push({
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
  s.seenFoods = w.foods.map((f) => f.id);
  const saved = serialize(w);
  expect(() => deserialize(saved)).not.toThrow();
  return {
    synthetic: true,
    stateBytes: saved.length,
    episodes: s.episodes.length,
    links: s.links.length,
    gut: s.gut.length,
    hypotheses: [...s.links, ...s.gut].reduce(
      (n, r) => n + (r.hypotheses?.length ?? (r.episodeId !== null ? 1 : 0)),
      0,
    ),
    memories: s.memories.length,
  };
}
function benchmark() {
  function scene() {
    const w = createWorld("hunger-e00", generateGenome("hunger-g00"));
    for (const [cue, x, y] of [
      ["amber", 200, 290],
      ["blue", 400, 290],
      ["rose", 300, 460],
    ])
      addDispenser(w, x, y, cue);
    for (const [cue, x, y] of [
      ["chime", 300, 235],
      ["moss", 420, 420],
      ["prism", 180, 420],
    ])
      addObject(w, cue, x, y);
    return w;
  }
  // Timing is isolated from study aggregation and observations; it is not an
  // Android benchmark. Identical input scenes, with naturally diverging states.
  let w = scene();
  for (let i = 0; i < 5000; i++) step(w);
  const rows = [];
  for (let rep = 0; rep < 9; rep++) {
    w = scene();
    const started = performance.now();
    for (let i = 0; i < 5000; i++) step(w);
    const elapsedMs = performance.now() - started;
    expect(w.tick).toBe(5000);
    rows.push({
      rep,
      ticks: w.tick,
      elapsedMs,
      stateBytes: serialize(w).length,
      slots: {
        episodes: w.instrumental.episodes.length,
        links: w.instrumental.links.length,
        gut: w.instrumental.gut.length,
      },
    });
  }
  return {
    workload:
      "g00/e00/spaced/r0, no observer, 5000 ticks, one warmup + nine replicates",
    rows,
  };
}

test.runIf(process.env.RUN_ATTRIBUTION_CONTROLS === "1")(
  "matched exposure, ambiguous evidence and isolated timing",
  () => {
    const timingOnly = process.env.ATTRIBUTION_TIMING_ONLY === "1";
    const exposures = [];
    if (!timingOnly)
      for (let g = 0; g < 12; g++)
        for (const learning of [true, false])
          for (const condition of ["nutritious", "toxic-dose"])
            for (const delay of [0, 1200])
              exposures.push(
                exposure(
                  `hunger-g${String(g).padStart(2, "0")}`,
                  learning,
                  condition,
                  delay,
                ),
              );
    const ambiguous = [];
    if (!timingOnly)
      for (const kind of [
        "adjacent",
        "indistinguishable",
        "two-resources-one-action",
        "coincidence",
      ])
        for (const reverse of [false, true])
          ambiguous.push(ambiguity(kind, reverse));
    const result = {
      metadata,
      timingOnly,
      exposures,
      ambiguous,
      memoryBudget: memoryBudget(),
      benchmark: benchmark(),
    };
    writeFileSync(
      process.env.LUMA_CONTROLS_OUT ??
        "/tmp/luma-attribution-study/controls.json",
      JSON.stringify(result, null, 2) + "\n",
    );
  },
  180000,
);
