import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deserialize } from "../src/sim/persistence";
import { runEcologyCase } from "../src/experiments/ecology";
const data = JSON.parse(
  readFileSync(
    new URL("../docs/research/ecology-results.json", import.meta.url),
    "utf8",
  ),
);
test("published ecological trajectories balance resources, preserve genes and match their summaries", () => {
  expect(data.runs).toHaveLength(96);
  expect(data.metadata.pilot).toBe(false);
  for (const r of data.runs) {
    const initial = deserialize(JSON.stringify(r.initial));
    const final = deserialize(JSON.stringify(r.final));
    expect(final.creature.genome).toEqual(initial.creature.genome);
    expect(r.samples).toHaveLength(121);
    expect(r.samples.at(-1)[0]).toBe(3600);
    expect(r.summary.population).toBe(
      final.ecology.plants.filter((p) => p.stage !== "dead").length,
    );
    for (const key of Object.keys(final.ecology.counters))
      expect(r.summary.counters[key]).toBe(
        final.ecology.counters[key] - initial.ecology.counters[key],
      );
    expect(r.summary.counters.produced + r.summary.initialFruits).toBe(
      r.summary.counters.consumed +
        r.summary.counters.decayed +
        r.summary.plantFruits,
    );
    if (!initial.ecology.creaturePresent) {
      expect(final.creature).toEqual(initial.creature);
      expect(final.rng).toBe(initial.rng);
      expect(r.summary.alive).toBeNull();
    }
  }
  for (const s of data.aggregation.scenarios) {
    const runs = data.runs.filter((r) => r.scenario === s.scenario);
    expect(runs).toHaveLength(s.n);
    for (const k of Object.keys(s.totals))
      expect(s.totals[k]).toBe(
        runs.reduce((sum, r) => sum + r.summary.counters[k], 0),
      );
  }
});
test("published initial ecology and first measurements replay with the checked-in protocol", () => {
  for (const scenario of [
    "favorable",
    "poor",
    "crowded",
    "distributed",
    "overharvest",
    "overharvest-control",
    "without-creature",
    "without-plants",
  ]) {
    const r = data.runs.find((r) => r.scenario === scenario);
    const replay = runEcologyCase(
      scenario,
      r.environmentSeed,
      r.geneticSeed,
      600,
    );
    expect(replay.initial).toEqual(r.initial);
    expect(replay.samples).toEqual(r.samples.slice(0, 3));
  }
});
