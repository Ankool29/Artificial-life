import { expect, it } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { scientificReport } from "../src/experiments/instrumental";

it("reproduces the fixed instrumental cohort and published raw measurements", () => {
  const result = scientificReport();
  // Step 4 measurements remain archived in instrumental-results.json.
  // This fixture records the current attribution engine. Reporting precision only; never round the live simulation or decision scores.
  const published = JSON.parse(
    JSON.stringify(result, (_key, value) =>
      typeof value === "number" && !Number.isInteger(value)
        ? Number(value.toFixed(10))
        : value,
    ),
  );
  if (process.env.UPDATE_INSTRUMENTAL_RESULTS === "1") {
    writeFileSync(
      "docs/research/instrumental-attribution-results.json",
      JSON.stringify(published, null, 2) + "\n",
    );
    console.log(JSON.stringify(result.summaries, null, 2));
  }
  expect(published).toEqual(
    JSON.parse(
      readFileSync(
        "docs/research/instrumental-attribution-results.json",
        "utf8",
      ),
    ),
  );
  const healthy = result.runs.filter(
    (r) => r.condition === "beneficial" && r.learning,
  );
  const controls = result.runs.filter(
    (r) => r.condition === "beneficial" && !r.learning,
  );
  for (const r of healthy) {
    const control = controls.find((c) => c.seed === r.seed);
    expect(r.training.firstAttempt).not.toBeNull();
    expect(r.training.firstAttempt).toBeLessThan(r.training.firstCredit);
    expect(r.after.attempts).toBeGreaterThan(control.after.attempts);
    expect(r.after.firstChoice).toBe("use");
    expect(control.after.firstChoice).not.toBe("use");
    expect(r.probabilityAfterOutage).toBeLessThan(r.probabilityBeforeOutage);
    expect(r.alive).toBe(true);
  }
  expect(
    healthy.reduce((sum, r) => sum + r.extinction.attempts, 0),
  ).toBeLessThan(healthy.reduce((sum, r) => sum + r.after.attempts, 0));
  // Extinction reduces use at cohort level; curiosity and a stronger retained
  // biological value do not guarantee zero retries for every individual.
  expect(
    healthy.filter((r) => r.extinction.firstChoice === "use").length,
  ).toBeLessThan(healthy.filter((r) => r.after.firstChoice === "use").length);
  for (const r of result.runs.filter(
    (r) => r.condition === "harmful" && r.learning,
  )) {
    expect(r.valueBeforeOutage).toBeLessThan(0);
    expect(r.after.firstChoice).not.toBe("use");
  }
}, 30000);
