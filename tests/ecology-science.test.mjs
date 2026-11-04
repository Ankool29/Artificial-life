import { test, expect } from "vitest";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ECOLOGY_SCENARIOS,
  ECOLOGY_COLUMNS,
  ECOLOGY_STUDY_TICKS,
  runEcologyCase,
  ecologicalParity,
  ecologicalBenchmark,
} from "../src/experiments/ecology";

test.runIf(process.env.RUN_ECOLOGY_STUDY === "1")(
  "records the reproducible ecological campaign and isolated costs",
  () => {
    const runs = [],
      replicates = process.env.ECOLOGY_PILOT === "1" ? 1 : 12;
    for (let i = 0; i < replicates; i++)
      for (const scenario of ECOLOGY_SCENARIOS) {
        const result = runEcologyCase(
          scenario,
          `ecology-e${i}`,
          `ecology-g${Math.floor(i / 2)}`,
          ECOLOGY_STUDY_TICKS,
        );
        expect(result.summary.maxResidual).toBeLessThan(1e-4);
        expect(result.summary.maxSaveChars).toBeLessThan(100000);
        runs.push(result);
      }
    const hash = createHash("sha256");
    for (const file of readdirSync("src/sim")
      .filter((f) => f.endsWith(".ts"))
      .sort())
      hash.update(file).update(readFileSync(`src/sim/${file}`));
    const parity = ecologicalParity();
    expect(parity).toBe(true);
    const benchmark = ecologicalBenchmark();
    const report = {
      protocolVersion: 1,
      referenceCommit: "f3e087752512657427c1d31231e58bdb39d113d4",
      simulationSourceSha256: hash.digest("hex"),
      metadata: {
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        pilot: replicates === 1,
      },
      ticks: ECOLOGY_STUDY_TICKS,
      columns: ECOLOGY_COLUMNS,
      replicates,
      parity,
      runs,
      benchmark,
    };
    writeFileSync(
      process.env.ECOLOGY_OUT ?? "/tmp/luma-ecology-study.json",
      JSON.stringify(report) + "\n",
    );
    console.log(
      JSON.stringify(
        runs.map((r) => ({ scenario: r.scenario, ...r.summary })),
        null,
        2,
      ),
    );
  },
  300000,
);
