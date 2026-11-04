import type { DiagnosticEvent } from "../sim/diagnostics";
import { createWorld, createLivingWorld, step, addFood } from "../sim/world";
import { enableEcology } from "../sim/ecology";
import { generateGenome } from "../sim/genome";
import { prepareEcologyCase } from "./ecology";
import { EcologicalObservatory, availability } from "../observatory/ecological";
import { CUES } from "../sim/types";
import { hunger } from "../sim/metabolism";
import { serialize } from "../sim/persistence";
export const DIAGNOSTIC_SCENARIOS = [
  "extinction-without-creature",
  "extinction-with-consumption",
  "consumption-control",
  "abundant-distant",
  "visible-poor-nutrients",
  "nutritive-control",
  "death-with-food",
  "renewable-survival",
] as const;
export type DiagnosticScenario = (typeof DIAGNOSTIC_SCENARIOS)[number];
export function prepareDiagnosticScenario(
  scenario: DiagnosticScenario,
  seed: string,
  gene: string,
) {
  if (
    scenario === "extinction-with-consumption" ||
    scenario === "consumption-control"
  )
    return prepareEcologyCase(
      scenario === "consumption-control"
        ? "overharvest-control"
        : "overharvest",
      seed,
      gene,
    );
  const w =
    scenario === "renewable-survival"
      ? createLivingWorld(seed, generateGenome(gene))
      : createWorld(seed, generateGenome(gene));
  if (scenario === "renewable-survival") return w;
  w.foods = [];
  if (scenario === "extinction-without-creature") {
    enableEcology(w, {
      creaturePresent: false,
      water: 0.5,
      minerals: 0.02,
      light: 0.1,
      waterInput: 0,
      mineralInput: 0,
    });
    return w;
  }
  enableEcology(w, { founders: false });
  if (scenario === "abundant-distant") {
    w.creature.metabolism.energy = 0;
    w.creature.metabolism.health = 0.4;
    for (let i = 0; i < 48; i++)
      addFood(w, "amber", 25 + (i % 6), 25 + Math.floor(i / 6));
  } else if (
    scenario === "visible-poor-nutrients" ||
    scenario === "nutritive-control"
  ) {
    w.creature.metabolism.energy = 2;
    w.creature.metabolism.health = 1;
    for (let i = 0; i < 48; i++) {
      addFood(w, "blue", 300 + Math.cos(i) * 30, 340 + Math.sin(i) * 30);
      const f = w.foods.at(-1)!;
      f.mass = 36;
      f.nutrients = scenario === "nutritive-control" ? 28 : 0.02;
    }
  } else {
    w.creature.metabolism.energy = 15;
    w.creature.metabolism.health = 0.4;
    for (let i = 0; i < 12; i++) addFood(w, "rose", 300, 340);
    for (let i = 0; i < 12; i++) addFood(w, "amber", 25, 25);
  }
  return w;
}
export const DIAGNOSTIC_COLUMNS = [
  "elapsedSeconds",
  "plantsAmber",
  "plantsBlue",
  "plantsRose",
  "fruitsAmber",
  "fruitsBlue",
  "fruitsRose",
  "soilWater",
  "soilMinerals",
  "physicalFood",
  "perceptibleFood",
  "contactAndFits",
  "energy",
  "health",
  "hunger",
  "alive",
  "germinated",
  "born",
  "died",
  "produced",
  "consumed",
  "absorbedNutrients",
  "effectiveEnergy",
  "toxinDamage",
  "starvationDamage",
] as const;
export function runDiagnosticScenario(
  scenario: DiagnosticScenario,
  seed: string,
  gene: string,
) {
  const w = prepareDiagnosticScenario(scenario, seed, gene),
    control = structuredClone(w),
    o = new EcologicalObservatory(),
    initial = JSON.parse(serialize(w)),
    start = w.tick;
  const ticks =
    scenario === "renewable-survival"
      ? 36000
      : scenario === "extinction-without-creature" ||
          scenario === "extinction-with-consumption" ||
          scenario === "consumption-control"
        ? 12000
        : 6000;
  const rows: (number | boolean | null)[][] = [];
  let rawNutrients = 0,
    effectiveEnergy = 0,
    toxinDamage = 0,
    starvationDamage = 0,
    ingestions = 0,
    checkpoints = 0,
    decisions = 0,
    maxSessionChars = 0,
    actionDigest = 2166136261,
    controlDigest = 2166136261;
  function digest(previous: number, text: string) {
    for (let i = 0; i < text.length; i++)
      previous = Math.imul(previous ^ text.charCodeAt(i), 16777619);
    return previous >>> 0;
  }
  const diagnostic = (e: DiagnosticEvent) => {
    if (e.kind === "absorption") {
      rawNutrients += e.trace.nutrients ?? 0;
      effectiveEnergy += e.trace.energy;
    }
    if (e.kind === "physiology") {
      toxinDamage += e.trace.toxinDamage;
      starvationDamage += e.trace.starvationDamage;
    }
    if (e.kind === "ingestion") ingestions++;
    if (e.kind === "decision") decisions++;
  };
  function sample() {
    const s = o.inspect(w),
      p = s.ecological.at(-1)!,
      f = availability(w),
      m = w.creature.metabolism,
      e = w.ecology;
    rows.push([
      (w.tick - start) / 10,
      ...CUES.map((c) => p.plants[c]),
      ...CUES.map((c) => p.fruits[c]),
      p.soilWater,
      p.soilMinerals,
      f.physicalCount,
      f.visibleCount,
      f.contactAndFits,
      w.ecology?.creaturePresent === false ? null : m.energy,
      w.ecology?.creaturePresent === false ? null : m.health,
      w.ecology?.creaturePresent === false ? null : hunger(m),
      w.ecology?.creaturePresent === false ? null : w.creature.alive,
      e?.counters.germinated ?? 0,
      e?.counters.born ?? 0,
      e?.counters.died ?? 0,
      e?.counters.produced ?? 0,
      e?.counters.consumed ?? 0,
      rawNutrients,
      effectiveEnergy,
      toxinDamage,
      starvationDamage,
    ]);
    maxSessionChars = Math.max(maxSessionChars, JSON.stringify(s).length);
  }
  sample();
  for (let i = 0; i < ticks; i++) {
    step(control);
    o.step(w, diagnostic);
    // Exact per-tick observable execution state and both RNGs, plus full checkpoints.
    const state = JSON.stringify([
      w.tick,
      w.rng,
      w.ecology?.rng,
      w.creature.action,
      w.creature.x,
      w.creature.y,
      w.creature.metabolism,
      w.creature.needs,
      w.creature.brain,
      w.creature.objectBrain,
    ]);
    const baseline = JSON.stringify([
      control.tick,
      control.rng,
      control.ecology?.rng,
      control.creature.action,
      control.creature.x,
      control.creature.y,
      control.creature.metabolism,
      control.creature.needs,
      control.creature.brain,
      control.creature.objectBrain,
    ]);
    if (state !== baseline)
      throw new Error("Per-tick behavioral parity failure");
    actionDigest = digest(actionDigest, state);
    controlDigest = digest(controlDigest, baseline);
    if (i % 100 === 0) {
      if (serialize(w) !== serialize(control))
        throw new Error("Full-state checkpoint parity failure");
      checkpoints++;
    }
    if ((i + 1) % 300 === 0) sample();
  }
  if (serialize(w) !== serialize(control))
    throw new Error("Final state parity failure");
  const s = o.inspect(w);
  return {
    scenario,
    seed,
    gene,
    ticks,
    initial,
    final: JSON.parse(serialize(w)),
    columns: DIAGNOSTIC_COLUMNS,
    samples: rows,
    parity: {
      equal: true,
      checkpoints,
      perTickChecks: ticks,
      behaviorDigest: actionDigest,
      controlDigest,
    },
    observed: {
      produced: s.produced,
      consumed: s.consumed,
      deaths: s.deaths,
      germinations: s.germinations,
      births: s.births,
      mortalityFactors: s.mortalityFactors,
    },
    totals: {
      rawNutrients,
      effectiveEnergy,
      toxinDamage,
      starvationDamage,
      ingestions,
      decisions,
    },
    maxSessionChars,
    report: s.death ?? null,
    exampleEvents: s.events
      .filter((e) => e.kind === "extinction" || e.trace?.event === "death")
      .slice(-12),
  };
}
export function diagnosticBenchmark() {
  const result = [];
  for (const condition of ["off", "on"] as const) {
    for (let rep = -1; rep < 7; rep++) {
      const w = createLivingWorld(
          "diagnostic-benchmark",
          generateGenome("diagnostic-benchmark"),
        ),
        o = new EcologicalObservatory();
      o.setEnabled(condition === "on");
      for (let i = 0; i < 1000; i++) o.step(w);
      const start = performance.now();
      for (let i = 0; i < 10000; i++) o.step(w);
      const ms = performance.now() - start;
      if (rep >= 0)
        result.push({
          condition,
          rep,
          ticks: 10000,
          ms,
          sessionChars:
            condition === "on" ? JSON.stringify(o.inspect(w)).length : 0,
          saveChars: serialize(w).length,
        });
    }
  }
  return result;
}
