import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deserialize } from "../src/sim/persistence";
import { bodyState } from "../src/sim/diagnostics";
import { validDeathReport } from "../src/observatory/ecological-validation";
import { REPORT_BYTES } from "../src/observatory/ecological";
import { prepareDiagnosticScenario } from "../src/experiments/ecological-observatory";
const p = JSON.parse(
  readFileSync(
    new URL(
      "../docs/research/ecological-observatory-results.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("published diagnostic data preserve initial pairing, full worlds, counters and valid bounded reports", () => {
  expect(p.metadata.pilot).toBe(false);
  expect(p.runs).toHaveLength(48);
  expect(p.historical).toHaveLength(96);
  for (const r of p.runs) {
    const initial = deserialize(JSON.stringify(r.initial)),
      final = deserialize(JSON.stringify(r.final));
    expect(prepareDiagnosticScenario(r.scenario, r.seed, r.gene)).toEqual(
      initial,
    );
    expect(final.creature.genome).toEqual(initial.creature.genome);
    expect(r.parity.equal).toBe(true);
    expect(r.parity.perTickChecks).toBe(r.ticks);
    expect(r.parity.behaviorDigest).toBe(r.parity.controlDigest);
    for (const [key, counter] of [
      ["produced", "produced"],
      ["consumed", "consumed"],
      ["deaths", "died"],
      ["births", "born"],
      ["germinations", "germinated"],
    ])
      expect(Object.values(r.observed[key]).reduce((a, b) => a + b, 0)).toBe(
        final.ecology.counters[counter] - initial.ecology.counters[counter],
      );
    if (r.report) {
      expect(validDeathReport(r.report, REPORT_BYTES)).toBe(true);
      expect(r.report.final.body).toEqual(bodyState(final.creature));
      expect(r.report.final.food.visibleCount).toBeLessThanOrEqual(
        r.report.final.food.physicalCount,
      );
      expect(r.report.lastDecision?.tick).toBeLessThanOrEqual(r.report.tick);
    }
  }
  for (const x of p.historical) {
    expect(x.equal).toBe(true);
    expect(x.samples).toBe(121);
  }
  expect(p.memory.rows).toHaveLength(14);
});
test("normal renewable-resource death demonstrates measured toxicity, deficit and real negative food scores without a survival claim", () => {
  const r = p.runs.find((r) => r.scenario === "renewable-survival" && r.report),
    d = r.report;
  expect(d.final.food.present).toEqual({ amber: 0, blue: 0, rose: 14 });
  expect(d.final.food.visibleCount).toBe(13);
  expect(d.recentTotals.fluxes.toxinDamage).toBeGreaterThan(0);
  expect(d.recentTotals.fluxes.starvationDamage).toBeGreaterThan(0);
  expect(d.lastDecision.chosen.kind).toBe("wander");
  expect(d.lastDecision.foods.every((f) => f.cue === "rose")).toBe(true);
  expect(
    d.lastDecision.candidates
      .filter((c) => c.stage === "food")
      .every((c) => c.score < 0),
  ).toBe(true);
  const renewal = p.aggregation.scenarios.find(
    (s) => s.scenario === "renewable-survival",
  );
  expect(renewal.alive).toBe(5);
  expect(renewal.n).toBe(6);
});
