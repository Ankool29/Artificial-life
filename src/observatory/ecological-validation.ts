import type { DeathReport } from "./ecological-types";
import { CUES } from "../sim/types";
import { PLANT_STAGES } from "../sim/ecology-types";
// Validate only diagnostic sidecars; a failed report never rejects a game save.
type Obj = Record<string, unknown>;
const obj = (x: unknown): x is Obj =>
  !!x && typeof x === "object" && !Array.isArray(x);
const n = (x: unknown, a = 0, b = 1e12): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= a && x <= b;
const integer = (x: unknown, a = 0, b = 1e12) =>
  n(x, a, b) && Number.isInteger(x);
const bool = (x: unknown) => typeof x === "boolean";
const vec = (x: unknown, keys: readonly string[], max = 1e12) =>
  obj(x) && keys.every((k) => n(x[k], 0, max));
const array = (x: unknown, limit: number, valid: (v: unknown) => boolean) =>
  Array.isArray(x) && x.length <= limit && x.every(valid);
function action(x: unknown): boolean {
  if (!obj(x)) return false;
  switch (x.kind) {
    case "rest":
      return true;
    case "seek":
      return integer(x.foodId, 1);
    case "use":
      return integer(x.targetId, 1);
    case "inspect":
      return integer(x.objectId, 1);
    case "wander":
      return vec(x.target, ["x", "y"], 680);
    case "interact":
      return (
        integer(x.objectId, 1) &&
        typeof x.cue === "string" &&
        integer(x.remaining, 0, 30) &&
        obj(x.changes) &&
        Object.values(x.changes).every((v) => n(v, -1000, 1000))
      );
    default:
      return false;
  }
}
function food(x: unknown): boolean {
  return (
    obj(x) &&
    vec(x.present, CUES, 48) &&
    integer(x.physicalCount, 0, 48) &&
    integer(x.visibleCount, 0, 48) &&
    bool(x.visibleDetailsTruncated) &&
    n(x.presentNutrients, 0, 4800) &&
    integer(x.contactAndFits, 0, 48) &&
    bool(x.presence) &&
    (x.nearestPhysical === null || n(x.nearestPhysical, 0, 1000)) &&
    array(
      x.visible,
      48,
      (v) =>
        obj(v) &&
        integer(v.id, 1) &&
        CUES.includes(v.cue as never) &&
        n(v.distance, 0, 1000) &&
        bool(v.contact) &&
        bool(v.stomachFits) &&
        n(v.minimumTravelSeconds, 0, 1000),
    )
  );
}
function physiology(x: unknown): boolean {
  return vec(x, [
    "energySpent",
    "toxinDamage",
    "starvationDamage",
    "recovery",
    "energyAfterDigestion",
    "healthAfterMetabolism",
  ]);
}
function life(x: unknown): boolean {
  return (
    obj(x) &&
    integer(x.tick) &&
    integer(x.segment) &&
    vec(
      x.body,
      [
        "energy",
        "stomach",
        "toxins",
        "health",
        "stimulation",
        "fatigue",
        "stress",
      ],
      100,
    ) &&
    n(x.hunger, 0, 1) &&
    n(x.x, 0, 600) &&
    n(x.y, 0, 680) &&
    bool(x.alive) &&
    bool(x.present) &&
    action(x.action) &&
    food(x.food) &&
    physiology(x.fluxes) &&
    obj(x.absorbed) &&
    CUES.every((c) =>
      vec((x.absorbed as Obj)[c], ["nutrients", "energy", "toxins"]),
    )
  );
}
function ecology(x: unknown): boolean {
  return (
    obj(x) &&
    integer(x.tick) &&
    integer(x.segment) &&
    (x.ecologicalTime === null || integer(x.ecologicalTime)) &&
    vec(x.plants, CUES, 36) &&
    vec(x.fruits, CUES, 48) &&
    vec(x.stages, PLANT_STAGES, 36) &&
    obj(x.stagesByVariety) &&
    CUES.every((c) => vec((x.stagesByVariety as Obj)[c], PLANT_STAGES, 36)) &&
    n(x.soilWater, 0, 2500) &&
    n(x.soilMinerals, 0, 1000) &&
    Array.isArray(x.cells) &&
    x.cells.length === 25 &&
    x.cells.every((c) => vec(c, CUES, 36))
  );
}
export function validDeathReport(
  raw: unknown,
  maxBytes: number,
): raw is DeathReport {
  if (
    !obj(raw) ||
    JSON.stringify(raw).length > maxBytes ||
    raw.version !== 1 ||
    !integer(raw.tick) ||
    !integer(raw.coverageStart) ||
    !integer(raw.gaps) ||
    !["recorded", "loaded-dead"].includes(raw.provenance as string)
  )
    return false;
  if (
    !life(raw.final) ||
    !obj(raw.final) ||
    raw.final.alive !== false ||
    !obj(raw.final.body) ||
    raw.final.body.health !== 0 ||
    !ecology(raw.ecosystem) ||
    (raw.physiology !== null && !physiology(raw.physiology))
  )
    return false;
  if (
    !obj(raw.foodAssociations) ||
    !CUES.every((c) => {
      const a = (raw.foodAssociations as Obj)[c];
      return (
        obj(a) &&
        n(a.value, -2, 2) &&
        integer(a.meals) &&
        n(a.lastReward, -2, 2)
      );
    })
  )
    return false;
  if (raw.lastDecision !== null) {
    const d = raw.lastDecision;
    if (
      !obj(d) ||
      !integer(d.tick) ||
      !action(d.chosen) ||
      typeof d.branch !== "string" ||
      typeof d.foodPolicy !== "string" ||
      !array(
        d.foods,
        48,
        (f) =>
          obj(f) &&
          integer(f.id, 1) &&
          CUES.includes(f.cue as never) &&
          n(f.distance, 0, 1000),
      ) ||
      !array(
        d.candidates,
        80,
        (c) =>
          obj(c) &&
          action(c.action) &&
          n(c.score, -1e9, 1e9) &&
          (c.association === undefined ||
            (obj(c.association) &&
              n(c.association.value, -2, 2) &&
              integer(c.association.experiences))),
      )
    )
      return false;
  }
  if (
    !obj(raw.recentTotals) ||
    !integer(raw.recentTotals.firstSampleTick) ||
    !integer(raw.recentTotals.lastSampleTick) ||
    !integer(raw.recentTotals.sampleCount, 0, 180) ||
    !obj(raw.recentTotals.absorbed) ||
    !CUES.every((c) =>
      vec(
        (raw.recentTotals as Obj).absorbed &&
          ((raw.recentTotals as Obj).absorbed as Obj)[c],
        ["nutrients", "energy", "toxins"],
      ),
    ) ||
    !vec(raw.recentTotals.fluxes, [
      "energySpent",
      "toxinDamage",
      "starvationDamage",
      "recovery",
    ])
  )
    return false;
  if (
    !array(raw.samples, 180, life) ||
    !array(
      raw.ingestions,
      64,
      (x) =>
        obj(x) &&
        integer(x.tick) &&
        integer(x.segment) &&
        bool(x.plantFruit) &&
        obj(x.food) &&
        integer(x.food.id, 1) &&
        CUES.includes(x.food.cue as never) &&
        vec(x.food, ["mass", "nutrients", "toxins", "x", "y"], 1000),
    )
  )
    return false;
  if (
    !array(
      raw.executions,
      180,
      (x) =>
        obj(x) &&
        integer(x.tick) &&
        integer(x.segment) &&
        action(x.action) &&
        bool(x.moving) &&
        n(x.distance, 0, 1000),
    )
  )
    return false;
  if (
    !array(
      raw.decisions,
      96,
      (x) =>
        obj(x) &&
        integer(x.tick) &&
        integer(x.segment) &&
        obj(x.trace) &&
        action(x.trace.chosen) &&
        typeof x.trace.branch === "string" &&
        typeof x.trace.foodPolicy === "string" &&
        vec(
          x.trace.motivations,
          ["hunger", "curiosity", "rest", "comfort"],
          1,
        ) &&
        array(
          x.trace.foods,
          48,
          (f) =>
            obj(f) &&
            integer(f.id, 1) &&
            CUES.includes(f.cue as never) &&
            n(f.distance, 0, 1000),
        ),
    )
  )
    return false;
  for (const k of ["facts", "hypotheses", "limitations"])
    if (!array(raw[k], 24, (x) => typeof x === "string" && x.length < 2000))
      return false;
  function safe(x: unknown, depth = 0): boolean {
    if (depth > 14) return false;
    if (x === null || typeof x === "boolean") return true;
    if (typeof x === "number") return Number.isFinite(x);
    if (typeof x === "string") return x.length < 2000;
    if (Array.isArray(x))
      return x.length <= 256 && x.every((v) => safe(v, depth + 1));
    return (
      obj(x) &&
      Object.keys(x).length <= 48 &&
      Object.values(x).every((v) => safe(v, depth + 1))
    );
  }
  return safe(raw);
}
