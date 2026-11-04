import { test, expect } from "vitest";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  DIAGNOSTIC_SCENARIOS,
  runDiagnosticScenario,
  diagnosticBenchmark,
} from "../src/experiments/ecological-observatory";
import { runEcologyCase } from "../src/experiments/ecology";

test.runIf(process.env.RUN_ECOLOGICAL_DIAGNOSTICS === "1")(
  "publishes paired diagnostic experiments and checks the entire previous ecological cohort",
  () => {
    const reps = process.env.DIAGNOSTIC_PILOT === "1" ? 1 : 6,
      runs = [];
    for (let i = 0; i < reps; i++)
      for (const scenario of DIAGNOSTIC_SCENARIOS) {
        const r = runDiagnosticScenario(
          scenario,
          `diagnostic-e${i}`,
          `diagnostic-g${i}`,
        );
        expect(r.parity.equal).toBe(true);
        runs.push(r);
      }
    const old = JSON.parse(
      readFileSync("docs/research/ecology-results.json", "utf8"),
    );
    const historical = [];
    for (const r of old.runs.slice(0, reps === 1 ? 8 : 96)) {
      const now = runEcologyCase(
        r.scenario,
        r.environmentSeed,
        r.geneticSeed,
        r.summary.ticks,
      );
      expect(now.initial).toEqual(r.initial);
      expect(now.final).toEqual(r.final);
      expect(now.samples).toEqual(r.samples);
      historical.push({
        scenario: r.scenario,
        environmentSeed: r.environmentSeed,
        geneticSeed: r.geneticSeed,
        equal: true,
        samples: r.samples.length,
      });
    }
    const h = createHash("sha256");
    for (const dir of ["src/sim", "src/observatory"])
      for (const f of readdirSync(dir)
        .filter((f) => f.endsWith(".ts"))
        .sort())
        h.update(dir + "/" + f).update(readFileSync(dir + "/" + f));
    const benchmark = diagnosticBenchmark();
    const result = {
      protocolVersion: 1,
      referenceCommit: "b91d73c8069a4eaf9172147f57fe6fd4772974b4",
      sourceSha256: h.digest("hex"),
      metadata: {
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        pilot: reps === 1,
      },
      replicates: reps,
      runs,
      historical,
      benchmark,
    };
    writeFileSync(
      process.env.DIAGNOSTIC_OUT ?? "/tmp/luma-ecological-diagnostics.json",
      JSON.stringify(result) + "\n",
    );
    console.log(
      JSON.stringify(
        runs.map((r) => ({
          scenario: r.scenario,
          alive: r.final.creature.alive,
          deathTick: r.report?.tick,
          food: r.report?.final.food.physicalCount,
          visible: r.report?.final.food.visibleCount,
          plants: r.final.ecology?.plants.length,
          reportBytes: JSON.stringify(r.report).length,
          session: r.maxSessionChars,
        })),
        null,
        2,
      ),
    );
  },
  300000,
);
