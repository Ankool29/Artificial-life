import { createWorld, advance, step, setCreaturePresence } from "../sim/world";
import { generateGenome } from "../sim/genome";
import { enableEcology, plantSeed, ecologySummary } from "../sim/ecology";
import { MAX_PLANTS, PLANT_STAGES } from "../sim/ecology-types";
import { serialize } from "../sim/persistence";
import { LearningObservatory } from "../observatory/recorder";

export const ECOLOGY_SCENARIOS = [
  "favorable",
  "poor",
  "crowded",
  "distributed",
  "overharvest",
  "overharvest-control",
  "without-creature",
  "without-plants",
] as const;
export type EcologyScenario = (typeof ECOLOGY_SCENARIOS)[number];
export const ECOLOGY_SAMPLE_TICKS = 300;
export const ECOLOGY_STUDY_TICKS = 36000;
export const ECOLOGY_COLUMNS = [
  "elapsedSeconds",
  "population",
  ...PLANT_STAGES,
  "soilWater",
  "soilMinerals",
  "allFood",
  "plantFruits",
  "germinated",
  "born",
  "died",
  "produced",
  "consumed",
  "decayed",
  "emptyFruitTicks",
  "energy",
  "toxins",
  "health",
  "alive",
] as const;

export function prepareEcologyCase(
  scenario: EcologyScenario,
  environmentSeed: string,
  geneticSeed: string,
) {
  const w = createWorld(environmentSeed, generateGenome(geneticSeed));
  const harvest =
    scenario === "overharvest" || scenario === "overharvest-control";
  if (harvest) w.foods = [];
  const e = enableEcology(w, {
    founders: ![
      "crowded",
      "distributed",
      "overharvest",
      "overharvest-control",
      "without-plants",
    ].includes(scenario),
    creaturePresent: !harvest && scenario !== "without-creature",
    ...(scenario === "poor"
      ? {
          water: 0.5,
          minerals: 0.02,
          light: 0.1,
          waterInput: 0,
          mineralInput: 0,
        }
      : {}),
    ...(harvest ? { minerals: 2.8, mineralInput: 0 } : {}),
  });
  if (scenario === "crowded" || scenario === "distributed")
    for (let i = 0; i < MAX_PLANTS; i++) {
      const x = scenario === "crowded" ? 275 + (i % 6) * 9 : 60 + (i % 6) * 96;
      const y =
        scenario === "crowded"
          ? 305 + Math.floor(i / 6) * 9
          : 60 + Math.floor(i / 6) * 112;
      plantSeed(
        w,
        ["amber", "blue", "rose"][i % 3] as "amber" | "blue" | "rose",
        x,
        y,
      );
    }
  if (harvest) {
    plantSeed(w, "amber", 300, 340);
    // Explicit environmental conditioning; no food, metabolic or cognitive
    // change is imposed on the individual waiting outside the garden.
    while (e.fruits.length < 2 && w.tick < 6000) step(w);
    if (e.fruits.length < 2)
      throw new Error("Conditioning failed to produce two physical fruits");
    setCreaturePresence(w, scenario === "overharvest");
  }
  return w;
}
export function runEcologyCase(
  scenario: EcologyScenario,
  environmentSeed: string,
  geneticSeed: string,
  ticks = ECOLOGY_STUDY_TICKS,
) {
  const w = prepareEcologyCase(scenario, environmentSeed, geneticSeed),
    e = w.ecology!,
    start = w.tick;
  const initial = JSON.parse(serialize(w)),
    before = { ...e.counters };
  const samples: (number | boolean | null)[][] = [];
  let emptyFruitTicks = 0,
    fruitTickSum = 0,
    deathSeconds: number | null = null,
    maxSaveChars = serialize(w).length,
    maxResidual = 0;
  const present = e.creaturePresent;
  function sample() {
    const s = ecologySummary(w)!;
    maxResidual = Math.max(
      maxResidual,
      ...Object.values(s.residuals).map((x) => Math.abs(Number(x))),
    );
    maxSaveChars = Math.max(maxSaveChars, serialize(w).length);
    const c = w.creature;
    samples.push([
      (w.tick - start) / 10,
      s.population,
      ...PLANT_STAGES.map((stage) => s.stages[stage] ?? 0),
      s.soilWater,
      s.soilMinerals,
      s.food,
      s.plantFruits,
      s.counters.germinated - before.germinated,
      s.counters.born - before.born,
      s.counters.died - before.died,
      s.counters.produced - before.produced,
      s.counters.consumed - before.consumed,
      s.counters.decayed - before.decayed,
      emptyFruitTicks,
      present ? c.metabolism.energy : null,
      present ? c.metabolism.toxins : null,
      present ? c.metabolism.health : null,
      present ? c.alive : null,
    ]);
  }
  sample();
  for (let i = 0; i < ticks; i++) {
    step(w);
    if (!e.fruits.length) emptyFruitTicks++;
    fruitTickSum += e.fruits.length;
    if (present && !w.creature.alive && deathSeconds === null)
      deathSeconds = (w.tick - start) / 10;
    if ((i + 1) % ECOLOGY_SAMPLE_TICKS === 0) sample();
  }
  if ((w.tick - start) % ECOLOGY_SAMPLE_TICKS) sample();
  const counters = Object.fromEntries(
    Object.entries(e.counters).map(([key, value]) => [
      key,
      value - before[key as keyof typeof before],
    ]),
  );
  const final = ecologySummary(w)!;
  return {
    scenario,
    environmentSeed,
    geneticSeed,
    initial,
    final: JSON.parse(serialize(w)),
    samples,
    summary: {
      ticks,
      elapsedSeconds: ticks / 10,
      initialFruits: initial.ecology.fruits.length,
      initialPopulation: initial.ecology.plants.length,
      population: final.population,
      stages: final.stages,
      counters,
      soilWater: final.soilWater,
      soilMinerals: final.soilMinerals,
      plantFruits: final.plantFruits,
      allFood: final.food,
      emptyFruitFraction: emptyFruitTicks / ticks,
      meanPlantFruitAvailability: fruitTickSum / ticks,
      deathSeconds,
      alive: present ? w.creature.alive : null,
      maxSaveChars,
      maxResidual,
      budgets: structuredClone(e.budgets),
    },
  };
}
export function ecologicalParity() {
  const a = prepareEcologyCase("favorable", "eco-parity", "eco-genome"),
    b = structuredClone(a),
    observer = new LearningObservatory();
  for (let i = 0; i < 6000; i++) {
    if (i % 100 === 0) observer.setEnabled(i % 300 !== 100);
    step(a);
    step(b, observer.observerFor(b));
    if (serialize(a) !== serialize(b)) return false;
  }
  return true;
}
export function ecologicalBenchmark() {
  const rows: {
    condition: string;
    rep: number;
    ticks: number;
    ms: number;
    saveChars: number;
    population: number;
  }[] = [];
  for (const condition of ["empty", "vegetation"]) {
    function scene() {
      const w = prepareEcologyCase(
        condition === "empty" ? "without-plants" : "without-creature",
        "eco-benchmark",
        "eco-genome",
      );
      setCreaturePresence(w, false);
      advance(w, 3000);
      return w;
    }
    const warm = scene();
    advance(warm, 3000);
    for (let rep = 0; rep < 7; rep++) {
      const w = scene(),
        start = performance.now();
      advance(w, 10000);
      const ms = performance.now() - start;
      rows.push({
        condition,
        rep,
        ticks: 10000,
        ms,
        saveChars: serialize(w).length,
        population: ecologySummary(w)!.population,
      });
    }
  }
  return rows;
}
