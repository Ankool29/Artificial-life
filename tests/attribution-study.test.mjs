import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { test, expect } from "vitest";
import { createHash } from "node:crypto";
const root = process.env.LUMA_ENGINE_ROOT ?? process.cwd();
const learning = process.env.INSTRUMENTAL_LEARNING !== "0";
const sourceHash = createHash("sha256");
for (const file of readdirSync(`${root}/src/sim`)
  .filter((f) => f.endsWith(".ts"))
  .sort())
  sourceHash.update(file).update(readFileSync(`${root}/src/sim/${file}`));
const { createWorld, step, addFood } = await import(`${root}/src/sim/world.ts`);
const { addDispenser, refillDevice } = await import(
  `${root}/src/sim/devices.ts`
);
const { addObject } = await import(`${root}/src/sim/objects.ts`);
const { generateGenome } = await import(`${root}/src/sim/genome.ts`);
const { hunger } = await import(`${root}/src/sim/metabolism.ts`);
const { perceive, perceiveObjects } = await import(
  `${root}/src/sim/perception.ts`
);
const { perceiveActuators, actuatorScores } = await import(
  `${root}/src/sim/instrumental.ts`
);
const { decide } = await import(`${root}/src/sim/decisions.ts`);
const { LearningObservatory } = await import(
  `${root}/src/observatory/recorder.ts`
);
const { motivations } = await import(`${root}/src/sim/curiosity.ts`);
const { createBrain } = await import(`${root}/src/sim/brain.ts`);
const { random } = await import(`${root}/src/sim/random.ts`);
const { serialize, deserialize } = await import(
  `${root}/src/sim/persistence.ts`
);
const CUES = ["amber", "blue", "rose"];
const MAX_TICKS = 36000;
const config = {
  referenceCommit: "ba5eac0ccf69ef0f421c6208da8e1dbaf3dede89",
  engine: process.env.ENGINE_LABEL ?? "identity-v2",
  learning,
  simulationSourceSha256: sourceHash.digest("hex"),
  maxTicks: MAX_TICKS,
  geneticSeeds: Array.from(
    { length: 12 },
    (_, i) => `hunger-g${String(i).padStart(2, "0")}`,
  ),
  environmentSeeds: ["hunger-e00", "hunger-e01"],
  layouts: {
    spaced: [
      [200, 290],
      [400, 290],
      [300, 460],
    ],
    compact: [
      [260, 325],
      [300, 325],
      [340, 325],
    ],
  },
  objects: [
    ["chime", 300, 235],
    ["moss", 420, 420],
    ["prism", 180, 420],
  ],
  rotations: [0, 1, 2],
  dt: 0.1,
};
const examples = {};
const round = (x) =>
  JSON.parse(
    JSON.stringify(x, (_k, v) =>
      typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(10)) : v,
    ),
  );
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const blank = () => Object.fromEntries(CUES.map((c) => [c, 0]));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
function scene(g, e, layout, rotation) {
  const w =
    g === "legacy-v1" ? createWorld(e) : createWorld(e, generateGenome(g));
  CUES.forEach((cue, i) => {
    const p = config.layouts[layout][(i + rotation) % 3];
    addDispenser(w, p[0], p[1], cue);
  });
  for (const [cue, x, y] of config.objects) addObject(w, cue, x, y);
  w.instrumental.learning = learning;
  return w;
}
function mems(w) {
  return structuredClone(w.instrumental?.memories ?? []);
}
function body(w) {
  const c = w.creature,
    m = c.metabolism;
  return {
    tick: w.tick,
    energy: m.energy,
    health: m.health,
    toxins: m.toxins,
    stomach: m.stomach,
    hunger: hunger(m),
    needs: structuredClone(c.needs),
    position: { x: c.x, y: c.y },
    foodValues: structuredClone(c.brain),
    models: mems(w),
    stocks: w.instrumental?.devices.map((d) => ({
      id: d.id,
      cue: d.recipe.cue,
      stock: d.stock,
      pendingAt: d.pendingAt,
      readyAt: d.readyAt,
    })),
  };
}
function run(
  w,
  ticks,
  {
    tag = "case",
    captureCheckpoint = false,
    priorTruth = null,
    observatory = true,
  } = {},
) {
  const start = w.tick,
    s = w.instrumental;
  const roles = new Map(s?.devices.map((d) => [d.id, d.recipe.cue]) ?? []);
  const truth = new Map(
    priorTruth
      ? structuredClone([...priorTruth])
      : w.foods.map((f) => [
          f.id,
          {
            id: f.id,
            cue: f.cue,
            source: null,
            ingestedTick: null,
            complete: false,
            damage: 0,
            gain: 0,
            toxin: 0,
            foodReward: null,
            credit: null,
          },
        ]),
  );
  const stats = {
    start,
    end: null,
    alive: null,
    firstDecision: null,
    firstGoodProduction: null,
    firstGoodIngestion: null,
    attempts: blank(),
    empty: blank(),
    emptyBelief: {
      n: 0,
      unknown: 0,
      lowLearnedProbability: 0,
      negativeValue: 0,
      sumProbability: 0,
    },
    cooling: blank(),
    produced: blank(),
    ingested: blank(),
    negativeMeals: blank(),
    credited: blank(),
    negativeCredits: blank(),
    correctNegativeCredits: blank(),
    attributedInitial: 0,
    wrongDeviceCredits: 0,
    missingCreditReasons: { noEpisodeAtIngestion: 0, linkedButNoCredit: 0 },
    negativeMissingByCue: Object.fromEntries(
      CUES.map((c) => [
        c,
        {
          ambiguous: 0,
          linkedThenLostBeforeEating: 0,
          neverLinked: 0,
          lostDuringDigestion: 0,
        },
      ]),
    ),
    toxicMachineAfterGoodEmpty: 0,
    toxicMachineAfterGoodEmptyAndFoodAbsent: 0,
    decisions: 0,
    urgentDecisions: 0,
    toxicAfterFoodAversion: 0,
    toxicAfterInstrumentalAversion: 0,
    firstPositiveCredit: null,
    firstNegativeCredit: null,
    partialCredits: 0,
    unattributedOutcomes: 0,
    peakSlots: { episodes: 0, links: 0, gut: 0, hypotheses: 0 },
    sampledPeakStateBytes: 0,
    roseSelections: { scored: 0, exploration: 0 },
    roseIngestions: { scored: 0, exploration: 0, unknown: 0 },
    damageToxic: 0,
    damageStarvation: 0,
    regeneration: 0,
    minEnergy: w.creature.metabolism.energy,
    maxToxins: w.creature.metabolism.toxins,
    minHealth: w.creature.metabolism.health,
    death: null,
    firstToxicUse: null,
    firstToxicMeal: null,
    phaseCounts: {},
    phaseStarts: {},
    ambiguousAppearances: 0,
    scoreBins: Object.fromEntries(
      ["low", "medium", "high"].map((k) => [
        k,
        {
          decisions: 0,
          actions: {},
          machines: Object.fromEntries(
            CUES.map((c) => [
              c,
              { n: 0, sum: 0, min: null, max: null, p: 0, value: 0 },
            ]),
          ),
        },
      ]),
    ),
    emptyEvents: [],
    transitions: [],
    credits: [],
    samples: [],
  };
  const rec = new LearningObservatory();
  rec.setEnabled(observatory);
  const sink = rec.observerFor(w);
  let lastDecision = null,
    completed = [],
    beforeHealth = 0,
    toxThisTick = 0,
    checkpoint = null;
  const phase = () => {
    const a = s.devices.find((d) => d.recipe.cue === "amber"),
      b = s.devices.find((d) => d.recipe.cue === "blue");
    return !a || !b
      ? "single-device"
      : a.stock > 0 && b.stock > 0
        ? "both-good-stocked"
        : a.stock === 0 && b.stock > 0
          ? "amber-empty"
          : b.stock === 0 && a.stock > 0
            ? "blue-empty"
            : "both-good-empty";
  };
  const phaseRow = () => {
    const key = phase();
    stats.phaseStarts[key] ??= w.tick;
    return (stats.phaseCounts[key] ??= {
      attempts: blank(),
      produced: blank(),
      ingested: blank(),
    });
  };
  const example = (key, extra = {}) => {
    if (!(key in examples))
      examples[key] = round({
        tag,
        genome: structuredClone(w.creature.genome),
        state: body(w),
        decision: lastDecision,
        ...extra,
      });
  };
  const observe = (e) => {
    sink?.(e);
    if (e.kind === "decision") {
      lastDecision = e.trace;
      stats.firstDecision ??= e.trace;
      stats.decisions++;
      const h = e.trace.motivations.hunger,
        b = stats.scoreBins[h < 0.33 ? "low" : h > 0.65 ? "high" : "medium"];
      b.decisions++;
      b.actions[e.trace.chosen.kind] =
        (b.actions[e.trace.chosen.kind] ?? 0) + 1;
      if (e.trace.branch === "urgent-food") stats.urgentDecisions++;
      for (const a of e.trace.candidates)
        if (a.instrumental) {
          const cue = roles.get(a.instrumental.targetId);
          if (!cue) continue;
          const m = b.machines[cue];
          m.n++;
          m.sum += a.score;
          m.min = m.min === null ? a.score : Math.min(m.min, a.score);
          m.max = m.max === null ? a.score : Math.max(m.max, a.score);
          m.p += a.instrumental.probability;
          m.value += a.instrumental.value;
        }
      if (
        e.trace.chosen.kind === "seek" &&
        truth.get(e.trace.chosen.foodId)?.cue === "rose"
      )
        stats.roseSelections[
          e.trace.foodPolicy === "exploration" ? "exploration" : "scored"
        ]++;
    }
    if (e.kind === "instrumental") {
      const t = e.trace,
        cue = roles.get(t.targetId);
      if (t.phase === "perceived" && t.event === "ambiguous") {
        stats.ambiguousAppearances++;
        const f = truth.get(t.foodId);
        if (f) f.ambiguous = true;
      }
      if (t.phase === "attribution" && t.event === "unattributed")
        stats.unattributedOutcomes++;
      if (t.phase === "attempt" && cue) {
        stats.attempts[cue]++;
        phaseRow().attempts[cue]++;
        const d = s.devices.find((d) => d.id === t.targetId);
        if (d.stock === 0) {
          stats.empty[cue]++;
          const m = s.memories.find(
            (m) => m.targetId === d.id && m.situation === t.situation,
          );
          stats.emptyBelief.n++;
          stats.emptyBelief.sumProbability += m?.probability ?? 0;
          if (!m?.observations) stats.emptyBelief.unknown++;
          else if (m.probability <= 0.05)
            stats.emptyBelief.lowLearnedProbability++;
          if (m?.value < 0) stats.emptyBelief.negativeValue++;
          if (stats.emptyEvents.length < 6)
            stats.emptyEvents.push({
              tick: e.tick,
              cue,
              probability: s.memories.find(
                (m) => m.targetId === d.id && m.situation === t.situation,
              )?.probability,
              situation: t.situation,
              pendingAt: d.pendingAt,
            });
          example("emptyAttempt", { event: e });
        }
        if (d.readyAt > w.tick) stats.cooling[cue]++;
        if (cue === "rose") {
          stats.firstToxicUse ??= e.tick;
          if (
            s.devices
              .filter((d) => d.recipe.cue !== "rose")
              .every((d) => d.stock === 0)
          ) {
            stats.toxicMachineAfterGoodEmpty++;
            if (!w.foods.some((f) => f.cue !== "rose"))
              stats.toxicMachineAfterGoodEmptyAndFoodAbsent++;
          }
          example("toxicLever", { event: e });
        }
      }
      if (t.phase === "production") {
        const f = w.foods.find((f) => f.id === t.foodId);
        if (f) {
          stats.produced[f.cue]++;
          phaseRow().produced[f.cue]++;
          if (f.cue !== "rose") stats.firstGoodProduction ??= e.tick;
          truth.set(f.id, {
            id: f.id,
            cue: f.cue,
            source: t.targetId,
            ingestedTick: null,
            complete: false,
            damage: 0,
            gain: 0,
            toxin: 0,
            foodReward: null,
            credit: null,
          });
        }
      }
      if (t.phase === "transition" && stats.transitions.length < 30)
        stats.transitions.push({ tick: e.tick, ...t });
      if (t.phase === "credit") {
        if (t.outcome === "terminal-partial") stats.partialCredits++;
        if (t.reward > 0) stats.firstPositiveCredit ??= e.tick;
        if (t.reward < 0) stats.firstNegativeCredit ??= e.tick;
        const f = truth.get(t.foodId);
        if (f) {
          f.credit = { ...t, tick: e.tick };
          stats.credited[f.cue]++;
          if (t.reward < 0) {
            stats.negativeCredits[f.cue]++;
            if (f.source === t.targetId) stats.correctNegativeCredits[f.cue]++;
          }
          if (f.source === null) {
            stats.attributedInitial++;
            example("initialFoodAttributed", { event: e, physicalFood: f });
          } else if (f.source !== t.targetId) {
            stats.wrongDeviceCredits++;
            example("wrongDeviceCredit", { event: e, physicalFood: f });
          }
        }
        if (stats.credits.length < 12)
          stats.credits.push({
            tick: e.tick,
            foodCue: f?.cue,
            physicalSource: f?.source,
            ...t,
          });
      }
    }
    if (e.kind === "ingestion") {
      let f = truth.get(e.food.id);
      if (!f) {
        f = {
          id: e.food.id,
          cue: e.food.cue,
          source: null,
          ingestedTick: null,
          complete: false,
          damage: 0,
          gain: 0,
          toxin: 0,
          foodReward: null,
          credit: null,
        };
        truth.set(f.id, f);
      }
      f.ingestedTick = e.tick;
      const ledger = s.gut.at(-1);
      f.episodeAtIngestion = ledger?.episodeId ?? null;
      if (
        f.cue === "rose" &&
        w.creature.brain.rose.meals > 0 &&
        w.creature.brain.rose.value < 0
      )
        stats.toxicAfterFoodAversion++;
      if (
        f.cue === "rose" &&
        f.source !== null &&
        s.memories.some(
          (m) => m.targetId === f.source && m.outcomes > 0 && m.value < 0,
        )
      )
        stats.toxicAfterInstrumentalAversion++;
      f.hypothesesAtIngestion = structuredClone(ledger?.hypotheses ?? []);
      f.boundAtIngestion = ledger?.bound ?? ledger?.episodeId != null;
      stats.ingested[f.cue]++;
      phaseRow().ingested[f.cue]++;
      if (f.cue !== "rose") stats.firstGoodIngestion ??= e.tick;
      if (f.cue === "rose") {
        stats.firstToxicMeal ??= e.tick;
        const policy =
          lastDecision?.chosen.kind === "seek" &&
          lastDecision.chosen.foodId === f.id
            ? lastDecision.foodPolicy
            : "unknown";
        stats.roseIngestions[
          policy === "exploration"
            ? "exploration"
            : policy === "scored"
              ? "scored"
              : "unknown"
        ]++;
        example("toxicIngestion", {
          foodId: f.id,
          ingestionTick: e.tick,
          policy,
        });
        if (lastDecision?.motivations.hunger > 0.65)
          example("hungryToxicIngestion", {
            foodId: f.id,
            ingestionTick: e.tick,
            policy,
          });
      }
    }
    if (e.kind === "absorption") {
      const id = s.gut[e.trace.slot]?.foodId,
        f = truth.get(id);
      toxThisTick -= e.trace.health;
      stats.damageToxic -= e.trace.health;
      if (f) {
        f.damage -= e.trace.health;
        f.gain += e.trace.energy;
        f.toxin += e.trace.absorbedToxin;
        if (e.trace.completed) {
          f.complete = true;
          completed.push(f);
        }
      }
    }
    if (e.kind === "food-learning") {
      const f = completed.shift();
      if (f) {
        f.foodReward = e.reward;
        if (e.reward < 0) stats.negativeMeals[f.cue]++;
        if (f.source !== null && !f.credit) {
          if (f.episodeAtIngestion === null)
            stats.missingCreditReasons.noEpisodeAtIngestion++;
          else stats.missingCreditReasons.linkedButNoCredit++;
          if (f.foodReward < 0) {
            const reason =
              f.episodeAtIngestion !== null
                ? "lostDuringDigestion"
                : f.everLinked
                  ? "linkedThenLostBeforeEating"
                  : f.ambiguous
                    ? "ambiguous"
                    : "neverLinked";
            stats.negativeMissingByCue[f.cue][reason]++;
          }
        }
      }
    }
    if (e.kind === "state") {
      const residual = e.body.health - beforeHealth + toxThisTick;
      stats.damageStarvation += Math.max(0, -residual);
      stats.regeneration += Math.max(0, residual);
      stats.minEnergy = Math.min(stats.minEnergy, e.body.energy);
      stats.maxToxins = Math.max(stats.maxToxins, e.body.toxins);
      stats.minHealth = Math.min(stats.minHealth, e.body.health);
      if (!e.alive) {
        const pending = w.creature.metabolism.gut.map((b, i) => ({
          slot: i,
          cue: b.cue,
          remaining: b.remaining,
          accumulatedReward: b.reward,
          ledger: structuredClone(s.gut[i]),
          measured: truth.get(s.gut[i]?.foodId),
        }));
        const starve = Math.max(0, -residual);
        stats.death = {
          tick: e.tick,
          trigger:
            toxThisTick > 0 && starve > 0
              ? "mixed-last-tick"
              : toxThisTick > 0
                ? "toxic-last-tick"
                : starve > 0
                  ? "starvation-last-tick"
                  : "unclassified",
          energy: e.body.energy,
          toxins: e.body.toxins,
          previousHealth: beforeHealth,
          toxicDamageLastTick: toxThisTick,
          starvationDamageLastTick: starve,
          pendingBoluses: pending,
        };
        if (
          pending.some(
            (b) =>
              b.cue === "rose" &&
              b.measured?.damage > 0 &&
              !b.measured.complete,
          )
        )
          example("fatalIncompletePoison", {
            death: stats.death,
            history: rec.inspect(w)?.history.slice(-12),
          });
      }
    }
  };
  for (let i = 0; i < ticks && w.creature.alive; i++) {
    beforeHealth = w.creature.metabolism.health;
    toxThisTick = 0;
    step(w, observe);
    stats.peakSlots.episodes = Math.max(
      stats.peakSlots.episodes,
      s.episodes.length,
    );
    stats.peakSlots.links = Math.max(stats.peakSlots.links, s.links.length);
    if (s.gut.length > stats.peakSlots.gut)
      expect(() => deserialize(serialize(w))).not.toThrow();
    stats.peakSlots.gut = Math.max(stats.peakSlots.gut, s.gut.length);
    stats.peakSlots.hypotheses = Math.max(
      stats.peakSlots.hypotheses,
      [...s.links, ...s.gut].reduce(
        (n, r) => n + (r.hypotheses?.length ?? (r.episodeId !== null ? 1 : 0)),
        0,
      ),
    );
    for (const link of s.links) {
      const f = truth.get(link.foodId);
      if (f) {
        f.everLinked = true;
        f.firstLinkedTick ??= w.tick;
      }
    }
    if (w.tick % 3000 === 0) {
      stats.sampledPeakStateBytes = Math.max(
        stats.sampledPeakStateBytes,
        JSON.stringify(w).length,
      );
      const b = body(w);
      stats.samples.push({
        tick: b.tick,
        energy: b.energy,
        health: b.health,
        toxins: b.toxins,
        hunger: b.hunger,
        stomach: b.stomach,
        stocks: b.stocks.map((d) => [d.cue, d.stock]),
        foodValues: Object.fromEntries(
          CUES.map((c) => [c, b.foodValues[c].value]),
        ),
      });
    }
    if (
      captureCheckpoint &&
      !checkpoint &&
      s.devices
        .filter((d) => d.recipe.cue !== "rose")
        .every((d) => d.stock === 0) &&
      w.creature.alive
    )
      checkpoint = {
        world: structuredClone(w),
        truth: structuredClone(truth),
        tick: w.tick,
      };
  }
  stats.end = body(w);
  stats.alive = w.creature.alive;
  const pendingIds = new Set(
    w.creature.metabolism.gut.map((_, i) => s.gut[i]?.foodId),
  );
  stats.poisonFinal = {
    machineIngested: [...truth.values()].filter(
      (f) => f.cue === "rose" && f.source !== null && f.ingestedTick !== null,
    ).length,
    machineNegativeCompleted: [...truth.values()].filter(
      (f) => f.cue === "rose" && f.source !== null && f.foodReward < 0,
    ).length,
    machineCompleted: [...truth.values()].filter(
      (f) => f.cue === "rose" && f.source !== null && f.complete,
    ).length,
    machineUnfinishedDamaging: [...truth.values()].filter(
      (f) =>
        pendingIds.has(f.id) &&
        f.cue === "rose" &&
        f.source !== null &&
        f.damage > 0 &&
        !f.complete,
    ).length,
    completed: [...truth.values()].filter((f) => f.cue === "rose" && f.complete)
      .length,
    negativeCompleted: [...truth.values()].filter(
      (f) => f.cue === "rose" && f.foodReward < 0,
    ).length,
    correctNegativeCredits: [...truth.values()].filter(
      (f) =>
        f.cue === "rose" &&
        f.complete &&
        f.foodReward < 0 &&
        f.credit?.reward < 0 &&
        f.credit.outcome !== "terminal-partial" &&
        f.source === f.credit.targetId,
    ).length,
    unfinishedDamaging: [...truth.values()].filter(
      (f) =>
        pendingIds.has(f.id) && f.cue === "rose" && f.damage > 0 && !f.complete,
    ).length,
  };
  stats.sampledPeakStateBytes = Math.max(
    stats.sampledPeakStateBytes,
    JSON.stringify(w).length,
  );
  stats.meals = [...truth.values()]
    .filter((f) => f.ingestedTick !== null && f.ingestedTick >= start)
    .map((f) => ({
      foodId: f.id,
      cue: f.cue,
      source: f.source,
      ingestedTick: f.ingestedTick,
      complete: f.complete,
      completedReward: f.foodReward,
      completedNegative: f.foodReward !== null && f.foodReward < 0,
      completedPositive: f.foodReward !== null && f.foodReward > 0,
      damage: f.damage,
      gain: f.gain,
      credit: f.credit
        ? {
            targetId: f.credit.targetId,
            episodeId: f.credit.episodeId,
            tick: f.credit.tick,
            reward: f.credit.reward,
            outcome: f.credit.outcome ?? "completed",
            eligibility: f.credit.eligibility,
            beforeValue: f.credit.beforeValue,
            value: f.credit.value,
          }
        : null,
      hypothesesAtIngestion: f.hypothesesAtIngestion ?? [],
      boundAtIngestion: f.boundAtIngestion ?? false,
    }));
  stats.historyTail = rec.inspect(w)?.history.slice(-4) ?? [];
  return { stats, checkpoint, truth, world: w };
}
function staticDecision(
  source,
  {
    energy = 80,
    food = "none",
    objects = true,
    onlyToxic = false,
    stock = "full",
    memory = "learned",
    rng = 1234567890,
    needs = { stimulation: 40, fatigue: 20, stress: 5 },
  } = {},
) {
  const w = structuredClone(source);
  w.creature.x = 300;
  w.creature.y = 340;
  w.creature.alive = true;
  w.creature.needs = { ...needs };
  Object.assign(w.creature.metabolism, {
    energy,
    health: 100,
    toxins: 0,
    stomach: 0,
    gut: [],
  });
  w.instrumental.gut = [];
  w.instrumental.episodes = [];
  w.instrumental.links = [];
  w.foods = [];
  w.rng = rng;
  if (!objects) w.objects = [];
  if (onlyToxic)
    w.instrumental.devices = w.instrumental.devices.filter(
      (d) => d.recipe.cue === "rose",
    );
  for (const d of w.instrumental.devices) {
    d.pendingAt = null;
    d.readyAt = 0;
    d.stock = d.capacity;
  }
  if (memory === "unknown") {
    w.instrumental.memories = [];
    w.creature.brain = createBrain();
  }
  if (memory === "food-neutral") w.creature.brain = createBrain();
  if (memory === "instrument-value-neutral")
    for (const m of w.instrumental.memories) {
      m.probability = 0;
      m.value = 0;
    }
  const ranked = actuatorScores(
    w,
    perceiveActuators(w),
    perceive(w.creature, w.foods),
    motivations(w.creature).curiosity,
  )
    .filter(
      (a) =>
        w.instrumental.devices.find((d) => d.id === a.target.id)?.recipe.cue !==
        "rose",
    )
    .sort((a, b) => b.score - a.score);
  const preferredTargetId = ranked[0]?.target.id ?? null;
  for (const d of w.instrumental.devices)
    if (
      (stock === "preferred-empty" && d.id === preferredTargetId) ||
      (stock === "beneficial-empty" && d.recipe.cue !== "rose")
    )
      d.stock = 0;
  if (food === "rose") addFood(w, "rose", 320, 340);
  let trace;
  const before = w.rng;
  decide(
    w,
    perceive(w.creature, w.foods),
    perceiveObjects(w),
    (t) => {
      trace = t;
    },
    perceiveActuators(w),
  );
  return {
    energy,
    food,
    objects,
    onlyToxic,
    stock,
    memory,
    needs,
    preferredTargetId,
    rngBefore: before,
    rngAfter: w.rng,
    trace,
    models: mems(w),
    foodValues: structuredClone(w.creature.brain),
    machineRoles: w.instrumental.devices.map((d) => ({
      id: d.id,
      cue: d.recipe.cue,
    })),
  };
}
function rngFor(exploration) {
  for (let rng = 1; rng < 10000; rng++) {
    const x = { rng },
      u = random(x);
    if (exploration ? u < 0.01 : u > 0.99) return { rng, u };
  }
  throw Error("rng not found");
}
function biologicalControls() {
  const low = scene("hunger-g00", "terminal-poison", "spaced", 0);
  low.foods = [];
  low.objects = [];
  low.instrumental.devices = low.instrumental.devices.filter(
    (d) => d.recipe.cue === "rose",
  );
  const d = low.instrumental.devices[0];
  d.x = 335;
  d.y = 340;
  low.creature.metabolism.energy = 30;
  low.creature.metabolism.health = 1;
  const high = structuredClone(low);
  high.creature.metabolism.health = 100;
  return {
    lowHealth: run(low, 300, { tag: "terminal-low-health" }).stats,
    highHealth: run(high, 300, { tag: "terminal-high-health" }).stats,
  };
}
function memoryView(w) {
  return {
    creature: w.creature,
    rng: w.rng,
    tick: w.tick,
    memories: w.instrumental.memories,
    episodes: w.instrumental.episodes,
    links: w.instrumental.links,
    gut: w.instrumental.gut,
    seenFoods: w.instrumental.seenFoods,
  };
}
function hiddenPhysicsControl(source) {
  const a = structuredClone(source),
    b = structuredClone(source);
  for (const w of [a, b]) {
    w.foods = [];
    w.objects = [];
    w.instrumental.episodes = [];
    w.instrumental.links = [];
    w.creature.metabolism.gut = [];
    w.creature.metabolism.stomach = 0;
    w.instrumental.gut = [];
    w.creature.nextDecision = w.tick;
    w.creature.action = { kind: "rest" };
  }
  for (const d of a.instrumental.devices) {
    d.stock = 0;
    d.pendingAt = null;
  }
  for (const d of b.instrumental.devices) {
    d.stock = d.capacity;
    d.pendingAt = null;
    d.readyAt = b.tick + 10000;
  }
  let equal = true;
  for (let i = 0; i < 400 && a.creature.alive; i++) {
    step(a);
    step(b);
    if (hash(memoryView(a)) !== hash(memoryView(b))) equal = false;
  }
  return {
    ticks: a.tick - source.tick,
    cognitivePathsIdentical: equal,
    emptyMemories: mems(a),
    coolingMemories: mems(b),
  };
}
function observerParity(source) {
  const a = structuredClone(source),
    b = structuredClone(source),
    o = new LearningObservatory();
  let equal = true;
  for (let t = 0; t < 600 && a.creature.alive; t++) {
    if (t % 100 === 0) o.setEnabled(t % 300 !== 100);
    step(a);
    step(b, o.observerFor(b));
    if (hash(a) !== hash(b)) {
      equal = false;
      break;
    }
  }
  return { identical: equal, ticks: a.tick - source.tick };
}
function refillProbes(checkpoint, tag) {
  const rows = [];
  for (const neutralize of [false, true])
    for (const refill of [false, true]) {
      const w = structuredClone(checkpoint.world);
      if (neutralize)
        for (const m of w.instrumental.memories) {
          m.value = 0;
          m.probability = 0;
        }
      const before = hash(memoryView(w));
      if (refill)
        for (const d of w.instrumental.devices)
          if (d.recipe.cue !== "rose") refillDevice(w, d.id);
      const after = hash(memoryView(w));
      const measured = run(w, 1800, {
        tag: `${tag}/refill-${refill}/neutralize-${neutralize}`,
        priorTruth: checkpoint.truth,
      });
      rows.push({
        refill,
        neutralize,
        sourceTick: checkpoint.tick,
        interventionPreservesCognition: before === after,
        stats: {
          attempts: measured.stats.attempts,
          empty: measured.stats.empty,
          produced: measured.stats.produced,
          ingested: measured.stats.ingested,
          alive: measured.stats.alive,
          end: measured.stats.end,
          firstDecision: measured.stats.firstDecision,
          firstGoodProduction: measured.stats.firstGoodProduction,
          firstGoodIngestion: measured.stats.firstGoodIngestion,
        },
      });
    }
  return rows;
}
function briefDecision(row) {
  const t = row.trace ?? row;
  return {
    tick: t.tick,
    chosen: t.chosen,
    branch: t.branch,
    foodPolicy: t.foodPolicy,
    motivations: t.motivations,
    needs: t.needs,
    energy: t.energy,
    stomach: t.stomach,
    foods: t.foods.map((f) => ({ id: f.id, cue: f.cue, distance: f.distance })),
    scores: t.candidates.map((c) => ({
      stage: c.stage,
      action: c.action,
      score: c.score,
      ...(c.association ? { association: c.association } : {}),
      ...(c.instrumental ? { instrumental: c.instrumental } : {}),
    })),
  };
}
function additionalControls(saved) {
  const sweeps = [];
  const source = saved.find(({ world: w }) =>
    w.instrumental.memories.some(
      (m) =>
        m.situation === "clear" &&
        m.value < 0 &&
        w.instrumental.devices.find((d) => d.id === m.targetId)?.recipe.cue ===
          "rose",
    ),
  );
  if (source) {
    const target = source.world.instrumental.devices.find(
      (d) => d.recipe.cue === "rose",
    ).id;
    for (const probability of [0, 0.05, 0.2, 0.5, 1]) {
      const w = structuredClone(source.world);
      w.instrumental.memories.find(
        (m) => m.targetId === target && m.situation === "clear",
      ).probability = probability;
      const row = staticDecision(w, {
        objects: false,
        energy: 10,
        needs: { stimulation: 0, fatigue: 0, stress: 0 },
      });
      sweeps.push({
        source: source.tag,
        probability,
        target,
        trace: briefDecision(row.trace),
      });
    }
  }
  const context = [];
  if (source) {
    for (const visible of [false, true]) {
      const w = structuredClone(source.world);
      w.creature.x = 300;
      w.creature.y = 340;
      w.creature.needs = { stimulation: 0, fatigue: 0, stress: 0 };
      Object.assign(w.creature.metabolism, {
        energy: 95,
        stomach: 0,
        gut: [],
        health: 100,
        toxins: 0,
      });
      w.creature.alive = true;
      w.objects = [];
      w.foods = [];
      w.instrumental.gut = [];
      w.instrumental.links = [];
      w.instrumental.episodes = [];
      const target = w.instrumental.devices.find(
        (d) => d.recipe.cue === "rose",
      );
      if (visible) addFood(w, "blue", target.x + 22, target.y);
      let trace;
      decide(
        w,
        perceive(w.creature, w.foods),
        [],
        (t) => (trace = t),
        perceiveActuators(w),
      );
      context.push({
        source: source.tag,
        resourceNearToxic: visible,
        trace: briefDecision(trace),
      });
    }
  }
  return { negativeValueProbabilitySweep: sweeps, context };
}
const pilot = process.env.LUMA_STUDY_FAST === "1";
test.runIf(process.env.RUN_ATTRIBUTION_STUDY === "1")(
  "paired attribution study against the selected engine",
  () => {
    const runs = [],
      refills = [],
      matrices = [],
      saved = [];
    for (const g of pilot
      ? config.geneticSeeds.slice(0, 2)
      : [...config.geneticSeeds, "legacy-v1"])
      for (const e of config.environmentSeeds.slice(0, pilot ? 1 : 2))
        for (const layout of Object.keys(config.layouts))
          for (const rotation of config.rotations.slice(0, pilot ? 1 : 3)) {
            const tag = `${g}/${e}/${layout}/r${rotation}`,
              w = scene(g, e, layout, rotation);
            const result = run(w, MAX_TICKS, { tag, captureCheckpoint: true });
            result.stats.firstDecision = briefDecision(
              result.stats.firstDecision,
            );
            runs.push({
              tag,
              geneticSeed: g,
              environmentSeed: e,
              layout,
              rotation,
              genome: structuredClone(w.creature.genome),
              stats: result.stats,
            });
            saved.push({ tag, world: structuredClone(w) });
            if (result.checkpoint && learning)
              refills.push({
                tag,
                checkpoint: body(result.checkpoint.world),
                rows: refillProbes(result.checkpoint, tag),
              });
            if (
              learning &&
              layout === "spaced" &&
              e === config.environmentSeeds[0] &&
              rotation === 0
            ) {
              for (const memory of [
                "learned",
                "unknown",
                "food-neutral",
                "instrument-value-neutral",
              ])
                for (const objects of [false, true])
                  for (const onlyToxic of [false, true])
                    for (const stock of [
                      "full",
                      "preferred-empty",
                      "beneficial-empty",
                    ])
                      for (const energy of [80, 10])
                        matrices.push({
                          tag,
                          ...staticDecision(w, {
                            energy,
                            objects,
                            onlyToxic,
                            stock,
                            memory,
                            rng: rngFor(false).rng,
                          }),
                        });
              for (const policy of ["scored", "exploration"])
                for (const memory of ["learned", "unknown"])
                  for (const energy of [80, 10])
                    matrices.push({
                      tag,
                      forcedDraw: policy,
                      ...staticDecision(w, {
                        energy,
                        food: "rose",
                        objects: false,
                        memory,
                        rng: rngFor(policy === "exploration").rng,
                      }),
                    });
            }
          }
    for (const m of matrices) {
      m.trace = briefDecision(m.trace);
      delete m.models;
    }
    for (const group of refills)
      for (const row of group.rows)
        if (row.stats.firstDecision)
          row.stats.firstDecision = briefDecision(row.stats.firstDecision);
    const additional = additionalControls(saved);
    const biological = biologicalControls();
    const controlSource = scene(
      config.geneticSeeds[0],
      config.environmentSeeds[0],
      "spaced",
      0,
    );
    const hidden = hiddenPhysicsControl(controlSource),
      parity = observerParity(controlSource);
    expect(hidden.cognitivePathsIdentical).toBe(true);
    expect(parity.identical).toBe(true);
    const result = {
      config,
      metadata: {
        node: process.versions.node,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
        pilot,
      },
      rngStates: { scored: rngFor(false), exploration: rngFor(true) },
      runs,
      refills,
      matrices,
      additional,
      biological,
      hidden,
      parity,
      examples,
    };
    const path =
      process.env.LUMA_STUDY_OUT ?? "/tmp/luma-attribution-study/results.json";
    writeFileSync(path, JSON.stringify(round(result), null, 2) + "\n");
    console.log(
      JSON.stringify(
        {
          path,
          runs: runs.length,
          eligibleRefills: refills.length,
          deaths: runs.filter((r) => !r.stats.alive).length,
          terminalPoison: [
            biological.lowHealth.death,
            biological.highHealth.death,
          ],
        },
        null,
        2,
      ),
    );
  },
  300000,
);
