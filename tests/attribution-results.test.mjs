import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

test("keeps published attribution claims consistent with the raw meals, controls and denominators", () => {
  const p = JSON.parse(
    readFileSync(
      new URL("../docs/research/attribution-results.json", import.meta.url),
      "utf8",
    ),
  );
  const c = Object.fromEntries(
    p.columns.meals.map((name, index) => [name, index]),
  );
  expect(Object.values(p.cohorts).reduce((n, g) => n + g.runs.length, 0)).toBe(
    624,
  );
  for (const s of p.summary) {
    const runs = p.cohorts[s.engine].runs.filter(
      (r) =>
        r.layout === s.layout &&
        (r.geneticSeed === "legacy-v1") === (s.genomeVersion === "legacy"),
    );
    expect(runs).toHaveLength(s.n);
    const meals = runs.flatMap((r) => r.stats.meals);
    const completed = meals.filter(
      (m) => m[c.source] !== null && m[c.complete],
    );
    const negative = completed.filter(
      (m) => m[c.cue] === "rose" && m[c.completedNegative],
    );
    const correct = (m) =>
      m[c.creditTarget] === m[c.source] && m[c.outcome] === "completed";
    expect(completed.length).toBe(s.completedMachineMeals);
    expect(completed.filter(correct).length).toBe(s.correctCompleted);
    expect(negative.length).toBe(s.negativeMachineRoseMeals);
    expect(negative.filter(correct).length).toBe(s.correctNegative);
    expect(
      meals.filter(
        (m) => m[c.creditTarget] !== null && m[c.creditTarget] !== m[c.source],
      ).length,
    ).toBe(s.falseCredits);
  }
  for (const layout of ["spaced", "compact"]) {
    const a = p.summary.find(
      (s) =>
        s.engine === "old-learning" &&
        s.layout === layout &&
        s.genomeVersion === "modern",
    );
    const b = p.summary.find(
      (s) =>
        s.engine === "new-learning" &&
        s.layout === layout &&
        s.genomeVersion === "modern",
    );
    expect(b.negativeRate).toBeGreaterThan(a.negativeRate);
    expect(b.falseCredits).toBe(0);
  }
  const old = p.controls["old-exposures"],
    current = p.controls["new-exposures"];
  expect(current.exposures).toHaveLength(96);
  current.exposures.forEach((x, i) =>
    x.rows.forEach((r, j) => {
      expect(r.biologyHash).toBe(old.exposures[i].rows[j].biologyHash);
      expect(r.rng).toBe(old.exposures[i].rows[j].rng);
    }),
  );
  expect(current.memoryBudget.stateBytes).toBeLessThan(100000);
  for (const r of current.ambiguous) {
    // The indistinguishable coincidence is an explicit remaining false positive,
    // present in both engines. Do not hide it behind the zero of the free cohort.
    expect(r.false).toBe(r.kind === "coincidence" ? 1 : 0);
    if (["indistinguishable", "two-resources-one-action"].includes(r.kind))
      expect(r.correct).toBe(0);
  }
});
