import { describe, expect, it } from "vitest";
import {
  createLivingWorld,
  createWorld,
  step,
  advance,
  addFood,
  setCreaturePresence,
} from "../src/sim/world";
import { enableEcology, plantSeed } from "../src/sim/ecology";
import { deserialize, serialize } from "../src/sim/persistence";
import {
  createLaboratory,
  serializeLaboratory,
  deserializeLaboratory,
} from "../src/lab/laboratory";
import { addDispenser } from "../src/sim/devices";
import { addObject } from "../src/sim/objects";
import { LearningObservatory } from "../src/observatory/recorder";
import {
  EcologicalObservatory,
  availability,
  ECO_POINTS,
  LIFE_POINTS,
  ECO_EVENTS,
  DECISIONS,
  EXECUTIONS,
  REPORT_BYTES,
} from "../src/observatory/ecological";
import { bodyState } from "../src/sim/diagnostics";
import { generateGenome } from "../src/sim/genome";

function empty(seed = "eco-diagnostic") {
  const w = createWorld(seed);
  w.foods = [];
  return w;
}
function starving() {
  const w = empty();
  w.creature.metabolism.energy = 0;
  w.creature.metabolism.health = 0.2;
  return w;
}
describe("strictly passive ecological recording", () => {
  it.each(["classic", "living", "absent", "machines", "toxic"] as const)(
    "keeps every tick and random state identical for %s",
    (kind) => {
      const a =
        kind === "classic"
          ? createWorld("passive")
          : createLivingWorld("passive", generateGenome("passive-gene"));
      if (kind === "absent") setCreaturePresence(a, false);
      if (kind === "machines") {
        addDispenser(a, 320, 340);
        addObject(a, "chime", 300, 340);
      }
      if (kind === "toxic") {
        a.foods = [];
        addFood(a, "rose", 300, 340);
        a.creature.metabolism.health = 4;
      }
      const b = structuredClone(a),
        observer = new EcologicalObservatory(),
        learning = new LearningObservatory();
      learning.setEnabled(true);
      for (let i = 0; i < 3000; i++) {
        if (i === 700) observer.setEnabled(false);
        if (i === 1000) observer.setEnabled(true);
        step(a);
        observer.step(b, learning.observerFor(b));
        expect(serialize(b)).toBe(serialize(a));
      }
      expect(b.rng).toBe(a.rng);
      expect(b.ecology?.rng).toBe(a.ecology?.rng);
    },
  );
  it("reconciles all captured natural events and distinguishes zero fruit from extinction", () => {
    const w = empty();
    const e = enableEcology(w, { creaturePresent: false });
    const o = new EcologicalObservatory();
    const initial = structuredClone(o.inspect(w).ecological[0]!);
    o.advance(w, 15000);
    const s = o.inspect(w);
    expect(Object.values(s.produced).reduce((a, b) => a + b, 0)).toBe(
      e.counters.produced,
    );
    expect(Object.values(s.births).reduce((a, b) => a + b, 0)).toBe(
      e.counters.born,
    );
    expect(Object.values(s.deaths).reduce((a, b) => a + b, 0)).toBe(
      e.counters.died,
    );
    expect(Object.values(s.germinations).reduce((a, b) => a + b, 0)).toBe(
      e.counters.germinated,
    );
    expect(initial.plants).toEqual({ amber: 3, blue: 3, rose: 3 });
    expect(initial.fruits).toEqual({ amber: 0, blue: 0, rose: 0 });
    expect(initial.cells.reduce((sum, c) => sum + c.blue, 0)).toBe(3);
    expect(s.events.filter((e) => e.kind === "extinction")).toHaveLength(0);
  });
  it("captures actual plant death factors before their reserves are cleared", () => {
    const w = empty();
    enableEcology(w, {
      creaturePresent: false,
      founders: false,
      water: 0,
      minerals: 0,
      light: 0,
      waterInput: 0,
      mineralInput: 0,
    });
    plantSeed(w, "blue", 300, 340);
    const o = new EcologicalObservatory();
    o.advance(w, 3400);
    const s = o.inspect(w);
    expect(s.deaths.blue).toBe(1);
    expect(s.mortalityFactors.blue.dormantExpired).toBe(1);
    const t = s.events.find((x) => x.trace?.event === "death")!.trace!;
    expect(t.event).toBe("death");
    if (t.event === "death") {
      expect(t.plant.health).toBe(0);
      expect(t.plant.energy).toBeGreaterThan(0);
      expect(t.damage).toBe(2);
      expect(t.conditions.waterDeficit).toBe(false);
    }
    expect(
      s.events.some((e) => e.kind === "extinction" && e.text.includes("blue")),
    ).toBe(true);
  });
  it("bounds history on a prolonged run and separates capture gaps", () => {
    const w = createLivingWorld("long-diagnostics");
    setCreaturePresence(w, false);
    const o = new EcologicalObservatory();
    o.advance(w, 20000);
    const s = o.inspect(w);
    expect(s.ecological.length).toBeLessThanOrEqual(ECO_POINTS);
    expect(s.life.length).toBeLessThanOrEqual(LIFE_POINTS);
    expect(s.events.length).toBeLessThanOrEqual(ECO_EVENTS);
    expect(s.decisions.length).toBeLessThanOrEqual(DECISIONS);
    expect(s.executions.length).toBeLessThanOrEqual(EXECUTIONS);
    const count = structuredClone(s.produced);
    o.setEnabled(false);
    o.advance(w, 1000);
    expect(s.produced).toEqual(count);
    o.setEnabled(true);
    o.advance(w, 10);
    expect(s.gaps).toBe(1);
    expect(new Set(s.ecological.map((p) => p.segment)).size).toBe(2);
  });
});
describe("measured feeding and death diagnosis", () => {
  it("separates physical food, perception, contact, ingestion and effective absorption", () => {
    const w = empty();
    addFood(w, "amber", 25, 25);
    addFood(w, "amber", 300, 340);
    const o = new EcologicalObservatory();
    const before = availability(w);
    expect(before.physicalCount).toBe(2);
    expect(before.visibleCount).toBe(1);
    expect(before.contactAndFits).toBe(1);
    w.creature.metabolism.stomach = 30;
    expect(availability(w).contactAndFits).toBe(0);
    w.creature.metabolism.stomach = 0;
    w.creature.metabolism.energy = 99.9;
    w.creature.action = { kind: "seek", foodId: w.foods[1]!.id };
    w.creature.nextDecision = 1000;
    o.advance(w, 100);
    const s = o.inspect(w);
    expect(s.ingestions).toHaveLength(1);
    expect(s.ingestions[0]!.food.nutrients).toBe(28);
    const nutrients = s.life.reduce(
        (n, p) => n + p.absorbed.amber.nutrients,
        0,
      ),
      energy = s.life.reduce((n, p) => n + p.absorbed.amber.energy, 0);
    expect(nutrients).toBeGreaterThan(0);
    expect(energy).toBeLessThan(nutrients * w.creature.genome.genes.efficiency);
    expect(s.executions.some((e) => e.action.kind === "seek")).toBe(true);
  });
  it("reports starvation with food present without inventing unreachable food or a unique cause", () => {
    const w = starving();
    addFood(w, "amber", 25, 25);
    const o = new EcologicalObservatory();
    o.advance(w, 10);
    const r = o.inspect(w).death!;
    expect(r.provenance).toBe("recorded");
    expect(r.final.body).toEqual(bodyState(w.creature));
    expect(r.physiology!.starvationDamage).toBeGreaterThan(0);
    expect(r.physiology!.toxinDamage).toBe(0);
    expect(r.final.food.physicalCount).toBe(1);
    expect(r.final.food.visibleCount).toBe(0);
    expect(r.final.food.contactAndFits).toBe(0);
    expect(r.samples.at(-1)!.alive).toBe(false);
    expect(r.decisions.length).toBeGreaterThan(0);
    expect(r.hypotheses.some((x) => x.includes("ne prouve pas"))).toBe(true);
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(REPORT_BYTES);
  });
  it("records toxic and simultaneous energy damage from actual metabolic updates", () => {
    const w = starving();
    w.creature.metabolism.gut = [
      { cue: "rose", remaining: 10, nutrients: 0, toxins: 10, reward: 0 },
    ];
    w.creature.metabolism.stomach = 10;
    const o = new EcologicalObservatory();
    o.advance(w, 10);
    const r = o.inspect(w).death!;
    expect(r.physiology!.toxinDamage).toBeGreaterThan(0);
    expect(r.physiology!.starvationDamage).toBeGreaterThanOrEqual(0);
    expect(
      r.samples.reduce((n, p) => n + p.absorbed.rose.toxins, 0),
    ).toBeGreaterThan(0);
    expect(r.facts.some((x) => x.includes("absorption toxique"))).toBe(true);
  });
  it("does not reconstruct history for a loaded corpse and freezes a recorded report after ecology advances", () => {
    const w = createLivingWorld("corpse");
    w.creature.metabolism.energy = 0;
    w.creature.metabolism.health = 0.1;
    const o = new EcologicalObservatory();
    o.advance(w, 2);
    const r = structuredClone(o.inspect(w).death!);
    o.advance(w, 600);
    expect(o.inspect(w).death).toEqual(r);
    expect(w.ecology!.time).toBeGreaterThan(0);
    const loaded = new EcologicalObservatory().inspect(
      deserialize(serialize(w)),
    ).death!;
    expect(loaded.provenance).toBe("loaded-dead");
    expect(loaded.physiology).toBeNull();
    expect(loaded.decisions).toHaveLength(0);
  });
  it("preserves reports in a bounded sidecar for matching lab worlds without changing any game save", () => {
    const w = starving(),
      o = new EcologicalObservatory();
    o.advance(w, 3);
    const lab = createLaboratory(w),
      raw = serializeLaboratory(lab),
      saved = serialize(w);
    const sidecar = o.exportReports(lab.profiles);
    expect(serialize(w)).toBe(saved);
    expect(serializeLaboratory(lab)).toBe(raw);
    const next = deserializeLaboratory(raw),
      other = new EcologicalObservatory();
    expect(other.restoreReports(next.profiles, sidecar)).toBe(1);
    expect(other.inspect(next.profiles[0]!.world).death).toEqual(
      o.inspect(w).death,
    );
    next.profiles[0]!.world.seed = "another-world";
    expect(
      new EcologicalObservatory().restoreReports(next.profiles, sidecar),
    ).toBe(0);
    expect(other.restoreReports(next.profiles, "{broken")).toBe(0);
  });
  it("does not create reports for living individuals or advance an old save when inspected", () => {
    const w = createWorld("old-save");
    advance(w, 73);
    const raw = serialize(w),
      o = new EcologicalObservatory();
    o.inspect(w);
    o.capture(w);
    expect(serialize(w)).toBe(raw);
    expect(o.inspect(w).death).toBeUndefined();
    expect(
      JSON.parse(o.exportReports([{ id: "p", world: w }])).entries,
    ).toHaveLength(0);
  });
});

it("records the exact same decision traces with either observer configuration", () => {
  const a = createLivingWorld("decision-transcript"),
    b = structuredClone(a),
    o = new EcologicalObservatory();
  const before: unknown[] = [],
    after: unknown[] = [];
  for (let i = 0; i < 1500; i++) {
    step(a, (e) => {
      if (e.kind === "decision") before.push(e.trace);
    });
    o.step(b, (e) => {
      if (e.kind === "decision") after.push(e.trace);
    });
  }
  expect(after).toEqual(before);
  expect(after.length).toBeGreaterThan(10);
});
it("keeps repeated same-tick inspections from consuming history or double-counting absorption", () => {
  const w = empty("same-tick");
  addFood(w, "amber", 300, 340);
  w.creature.metabolism.energy = 10;
  const o = new EcologicalObservatory();
  o.advance(w, 30);
  o.capture(w);
  const initial = structuredClone(o.inspect(w));
  for (let i = 0; i < 200; i++) o.capture(w);
  const s = o.inspect(w);
  expect(s.life.length).toBe(initial.life.length);
  expect(s.ecological.length).toBe(initial.ecological.length);
  expect(
    s.life.reduce((n, p) => n + p.absorbed.amber.nutrients, 0),
  ).toBeCloseTo(
    initial.life.reduce((n, p) => n + p.absorbed.amber.nutrients, 0),
    12,
  );
});
it("bounds dense death reports, preserves original totals and rejects malformed sidecars", () => {
  // Explicit physical test world; no ecological resources are introduced or removed after start.
  const classic = empty("dense-report");
  enableEcology(classic, { founders: false });
  for (let i = 0; i < 48; i++) {
    addFood(classic, "blue", 300 + Math.cos(i) * 30, 340 + Math.sin(i) * 30);
    classic.foods.at(-1)!.nutrients = 0.001;
    classic.foods.at(-1)!.mass = 36;
  }
  const o = new EcologicalObservatory();
  o.advance(classic, 5000);
  const r = o.inspect(classic).death!;
  expect(r).toBeDefined();
  expect(JSON.stringify(r).length).toBeLessThan(REPORT_BYTES);
  expect(r.recentTotals.sampleCount).toBeGreaterThanOrEqual(r.samples.length);
  expect(r.recentTotals.absorbed.blue.nutrients).toBeGreaterThanOrEqual(
    r.samples.reduce((n, p) => n + p.absorbed.blue.nutrients, 0),
  );
  const lab = createLaboratory(classic),
    raw = o.exportReports(lab.profiles),
    next = deserializeLaboratory(serializeLaboratory(lab));
  expect(new EcologicalObservatory().restoreReports(next.profiles, raw)).toBe(
    1,
  );
  for (const change of [
    (r: Record<string, unknown>) => (r.final = { body: { health: 0 } }),
    (r: Record<string, unknown>) => (r.samples = [{ tick: 0 }]),
    (r: Record<string, unknown>) => (r.facts = ["x".repeat(2500)]),
  ]) {
    const corrupt = JSON.parse(raw);
    change(corrupt.entries[0].report);
    expect(
      new EcologicalObservatory().restoreReports(
        next.profiles,
        JSON.stringify(corrupt),
      ),
    ).toBe(0);
  }
});

it("marks a death during suspended capture as unknown and does not reuse stale physiological causes", () => {
  const w = empty("suspended-death");
  w.creature.metabolism.energy = 0;
  w.creature.metabolism.health = 1;
  const o = new EcologicalObservatory();
  o.advance(w, 2);
  o.setEnabled(false);
  o.advance(w, 20);
  const r = o.inspect(w).death!;
  expect(r.provenance).toBe("loaded-dead");
  expect(r.physiology).toBeNull();
  expect(r.lastDecision).toBeNull();
  expect(r.gaps).toBe(1);
  expect(r.final.alive).toBe(false);
  expect(r.samples.at(-1)!.alive).toBe(false);
  expect(r.samples.at(-1)!.fluxes.starvationDamage).toBe(0);
  expect(
    r.limitations.some((s) => s.includes("Aucun tick terminal enregistré")),
  ).toBe(true);
  o.setEnabled(true);
  o.advance(w, 1);
  expect(o.inspect(w).gaps).toBe(1);
});
