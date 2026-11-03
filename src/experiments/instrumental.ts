import { createWorld, step } from "../sim/world";
import { addDispenser } from "../sim/devices";
import { generateGenome } from "../sim/genome";
import type { Genome, World } from "../sim/types";
import type { SimulationObserver } from "../sim/diagnostics";

export const SCIENCE_SEEDS = Array.from(
  { length: 24 },
  (_, i) => `instrumental-${i}`,
);
export const TRAINING_TICKS = 1200;
export const OUTAGE_TICKS = 1200;
export const PROBE_TICKS = 180;
export interface RunMeasures {
  attempts: number;
  productions: number;
  credits: number;
  biologicalReward: number;
  firstAttempt: number | null;
  firstCredit: number | null;
  transitions: {
    tick: number;
    event: string;
    probability: number;
    situation: string;
  }[];
}
export interface Probe {
  attempts: number;
  firstChoice: string;
  score: number | null;
  probability: number;
  value: number;
}
export interface ScientificRun {
  seed: string;
  learning: boolean;
  condition: "beneficial" | "harmful";
  before: Probe;
  after: Probe;
  extinction: Probe;
  training: RunMeasures;
  outageEarly: RunMeasures;
  outageLate: RunMeasures;
  probabilityBeforeOutage: number;
  probabilityAfterOutage: number;
  valueBeforeOutage: number;
  alive: boolean;
  genotype: Genome;
  trainingEndTick: number;
  outageEndTick: number;
  aliveAfterTraining: boolean;
}
function prepared(
  seed: string,
  genome: Genome,
  learning: boolean,
  harmful: boolean,
): World {
  const w = createWorld(seed, genome);
  w.foods = [];
  addDispenser(w, 335, 340);
  const s = w.instrumental!,
    d = s.devices[0]!;
  s.learning = learning;
  d.capacity = 200;
  d.stock = 200;
  d.recipe = {
    cue: "amber",
    mass: 10,
    nutrients: harmful ? 4 : 28,
    toxins: harmful ? 5 : 0,
  };
  return w;
}
function empty(): RunMeasures {
  return {
    attempts: 0,
    productions: 0,
    credits: 0,
    biologicalReward: 0,
    firstAttempt: null,
    firstCredit: null,
    transitions: [],
  };
}
function measured(w: World, ticks: number): RunMeasures {
  const result = empty(),
    start = w.tick;
  const observe: SimulationObserver = (event) => {
    if (event.kind !== "instrumental") return;
    const t = event.trace;
    if (t.phase === "attempt") {
      result.attempts++;
      result.firstAttempt ??= w.tick - start;
    }
    if (t.phase === "production") result.productions++;
    if (t.phase === "credit") {
      result.credits++;
      result.biologicalReward += t.reward!;
      result.firstCredit ??= w.tick - start;
    }
    if (t.phase === "transition" && result.transitions.length < 64)
      result.transitions.push({
        tick: event.tick,
        event: t.event!,
        probability: t.probability!,
        situation: t.situation!,
      });
  };
  for (let tick = 0; tick < ticks; tick++) step(w, observe);
  return result;
}
export function matchedProbe(source: World, abolishValues = false): Probe {
  const w = prepared(
    source.seed,
    source.creature.genome,
    source.instrumental!.learning,
    false,
  );
  w.tick = source.tick;
  w.instrumental!.memories = structuredClone(source.instrumental!.memories);
  if (abolishValues)
    for (const m of w.instrumental!.memories) {
      m.probability = 0;
      m.value = 0;
    }
  w.creature.brain = structuredClone(source.creature.brain);
  w.creature.metabolism.energy = 60;
  w.creature.needs = { stimulation: 90, fatigue: 20, stress: 0 };
  const initial = w.instrumental!.memories.find((m) => m.situation === "clear");
  const result: Probe = {
    attempts: 0,
    firstChoice: "none",
    score: null,
    probability: initial?.probability ?? 0,
    value: initial?.value ?? 0,
  };
  const observe: SimulationObserver = (event) => {
    if (event.kind === "decision" && result.firstChoice === "none") {
      result.firstChoice = event.trace.chosen.kind;
      result.score =
        event.trace.candidates.find((c) => c.instrumental)?.score ?? null;
    }
    if (event.kind === "instrumental" && event.trace.phase === "attempt")
      result.attempts++;
  };
  for (let tick = 0; tick < PROBE_TICKS; tick++) step(w, observe);
  return result;
}
export function runScientificCase(
  seed: string,
  learning: boolean,
  condition: ScientificRun["condition"],
  genotype = generateGenome(`genome:${seed}`),
): ScientificRun {
  const w = prepared(
    `world:${seed}`,
    genotype,
    learning,
    condition === "harmful",
  );
  const before = matchedProbe(w);
  const training = measured(w, TRAINING_TICKS),
    after = matchedProbe(w);
  const trainingEndTick = w.tick,
    aliveAfterTraining = w.creature.alive;
  const m = w.instrumental!.memories.find((m) => m.situation === "clear");
  const probabilityBeforeOutage = m?.probability ?? 0,
    valueBeforeOutage = m?.value ?? 0;
  // Explicit physical intervention at the same tick in every paired run.
  const d = w.instrumental!.devices[0]!;
  d.stock = 0;
  d.pendingAt = null;
  w.foods = [];
  const outageEarly = measured(w, OUTAGE_TICKS / 2),
    outageLate = measured(w, OUTAGE_TICKS / 2);
  const extinction = matchedProbe(w);
  return {
    seed,
    learning,
    condition,
    genotype,
    before,
    after,
    extinction,
    training,
    outageEarly,
    outageLate,
    probabilityBeforeOutage,
    probabilityAfterOutage:
      w.instrumental!.memories.find((m) => m.situation === "clear")
        ?.probability ?? 0,
    valueBeforeOutage,
    alive: w.creature.alive,
    trainingEndTick,
    outageEndTick: w.tick,
    aliveAfterTraining,
  };
}
export function scientificReport() {
  const runs = SCIENCE_SEEDS.flatMap((seed) =>
    (["beneficial", "harmful"] as const).flatMap((condition) =>
      [true, false].map((learning) =>
        runScientificCase(seed, learning, condition),
      ),
    ),
  );
  const mean = (values: number[]): number =>
    values.reduce((a, b) => a + b, 0) / values.length;
  const summaries = (["beneficial", "harmful"] as const).flatMap((condition) =>
    [true, false].map((learning) => {
      const group = runs.filter(
        (r) => r.condition === condition && r.learning === learning,
      );
      return {
        condition,
        learning,
        n: group.length,
        discovery: group.filter((r) => r.training.firstAttempt !== null).length,
        credits: mean(group.map((r) => r.training.credits)),
        trainingAttempts: mean(group.map((r) => r.training.attempts)),
        beforeProbeAttempts: mean(group.map((r) => r.before.attempts)),
        afterProbeAttempts: mean(group.map((r) => r.after.attempts)),
        afterFirstUses: group.filter((r) => r.after.firstChoice === "use")
          .length,
        extinctionProbeAttempts: mean(group.map((r) => r.extinction.attempts)),
        extinctionFirstUses: group.filter(
          (r) => r.extinction.firstChoice === "use",
        ).length,
        earlyOutageAttempts: mean(group.map((r) => r.outageEarly.attempts)),
        lateOutageAttempts: mean(group.map((r) => r.outageLate.attempts)),
        probabilityBefore: mean(group.map((r) => r.probabilityBeforeOutage)),
        probabilityAfter: mean(group.map((r) => r.probabilityAfterOutage)),
        biologicalValue: mean(group.map((r) => r.valueBeforeOutage)),
        alive: group.filter((r) => r.alive).length,
      };
    }),
  );
  return {
    protocolVersion: 1,
    trainingTicks: TRAINING_TICKS,
    outageTicks: OUTAGE_TICKS,
    probeTicks: PROBE_TICKS,
    seeds: SCIENCE_SEEDS,
    summaries,
    runs,
  };
}
