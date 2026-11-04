import { validDeathReport } from "./ecological-validation";
import { CUES, type Cue, type World } from "../sim/types";
import { step as engineStep } from "../sim/world";
import {
  bodyState,
  type DiagnosticEvent,
  type DecisionTrace,
  type SimulationObserver,
} from "../sim/diagnostics";
import { hunger } from "../sim/metabolism";
import { perceive } from "../sim/perception";
import { PLANT_STAGES } from "../sim/ecology-types";
import { soilIndex } from "../sim/ecology";
import type {
  DeathReport,
  EcologicalSample,
  EcologicalSession,
  FoodAvailability,
  LifeSample,
  PhysiologyTrace,
  WorldProfile,
} from "./ecological-types";

export const ECO_POINTS = 180,
  LIFE_POINTS = 180,
  ECO_EVENTS = 256;
export const INGESTIONS = 64,
  DECISIONS = 96,
  EXECUTIONS = 180;
export const REPORT_BYTES = 120000,
  SIDECAR_BYTES = 1000000;
const counts = (): Record<Cue, number> => ({ amber: 0, blue: 0, rose: 0 });
const absorbed = () =>
  Object.fromEntries(
    CUES.map((c) => [c, { nutrients: 0, energy: 0, toxins: 0 }]),
  ) as LifeSample["absorbed"];
const flux = (): PhysiologyTrace => ({
  energySpent: 0,
  toxinDamage: 0,
  starvationDamage: 0,
  recovery: 0,
  energyAfterDigestion: 0,
  healthAfterMetabolism: 0,
});
interface Context {
  session: EcologicalSession;
  generation: number;
  previous: Record<Cue, number>;
  lastTime: number | null;
  consumedBefore: number;
  absorption: LifeSample["absorbed"];
  fluxes: PhysiologyTrace;
  lastPhysiology: PhysiologyTrace | null;
  lastDecision?: DecisionTrace;
}
export function availability(w: World): FoodAvailability {
  const c = w.creature,
    present = w.ecology?.creaturePresent !== false;
  const physical = counts();
  for (const f of w.foods) physical[f.cue]++;
  const distances = w.foods.map((f) => Math.hypot(f.x - c.x, f.y - c.y));
  const visible = present
    ? perceive(c, w.foods).map((o) => {
        const food = w.foods.find((f) => f.id === o.id)!;
        return {
          id: o.id,
          cue: o.cue,
          distance: o.distance,
          contact: o.distance <= 9,
          stomachFits: c.metabolism.stomach + food.mass <= 36,
          minimumTravelSeconds:
            Math.max(0, o.distance - 9) / c.genome.genes.speed,
        };
      })
    : [];
  return {
    present: physical,
    physicalCount: w.foods.length,
    presentNutrients: w.foods.reduce((s, f) => s + f.nutrients, 0),
    visible,
    visibleCount: visible.length,
    visibleDetailsTruncated: false,
    contactAndFits: visible.filter((f) => f.contact && f.stomachFits).length,
    nearestPhysical: distances.length ? Math.min(...distances) : null,
    presence: present,
  };
}
export function ecologicalSample(
  w: World,
  s: EcologicalSession,
): EcologicalSample {
  const e = w.ecology,
    plants = counts(),
    fruits = counts();
  const stages = Object.fromEntries(
    PLANT_STAGES.map((k) => [k, 0]),
  ) as EcologicalSample["stages"];
  const stagesByVariety = Object.fromEntries(
    CUES.map((c) => [c, { ...stages }]),
  ) as EcologicalSample["stagesByVariety"];
  const cells = Array.from({ length: 25 }, counts);
  for (const p of e?.plants ?? []) {
    stages[p.stage]++;
    stagesByVariety[p.variety][p.stage]++;
    if (p.stage !== "dead") {
      plants[p.variety]++;
      cells[soilIndex(p.x, p.y)]![p.variety]++;
    }
  }
  for (const f of e?.fruits ?? []) {
    const food = w.foods.find((x) => x.id === f.foodId);
    if (food) fruits[food.cue]++;
  }
  return {
    tick: w.tick,
    segment: s.segment,
    ecologicalTime: e?.time ?? null,
    plants,
    stages,
    stagesByVariety,
    fruits,
    cells,
    soilWater: e?.soil.reduce((n, c) => n + c.water, 0) ?? 0,
    soilMinerals: e?.soil.reduce((n, c) => n + c.minerals, 0) ?? 0,
    counters: { ...e?.counters },
    observedProduced: { ...s.produced },
    observedConsumed: { ...s.consumed },
    observedDynamics: Object.fromEntries(
      CUES.map((c) => [
        c,
        {
          germinations: s.germinations[c],
          births: s.births[c],
          deaths: s.deaths[c],
        },
      ]),
    ) as EcologicalSample["observedDynamics"],
  };
}
function lifeSample(w: World, ctx: Context): LifeSample {
  const food = availability(w);
  food.visible.sort((a, b) => a.distance - b.distance);
  food.visibleDetailsTruncated = food.visible.length > 8;
  food.visible = food.visible.slice(0, 8);
  return {
    tick: w.tick,
    segment: ctx.session.segment,
    body: bodyState(w.creature),
    hunger: hunger(w.creature.metabolism),
    action: structuredClone(w.creature.action),
    x: w.creature.x,
    y: w.creature.y,
    alive: w.creature.alive,
    present: w.ecology?.creaturePresent !== false,
    food,
    absorbed: structuredClone(ctx.absorption),
    fluxes: { ...ctx.fluxes },
  };
}
function bounded<
  K extends
    | "ecological"
    | "life"
    | "events"
    | "ingestions"
    | "decisions"
    | "executions",
>(
  s: EcologicalSession,
  k: K,
  value: EcologicalSession[K][number],
  limit: number,
) {
  const a = s[k] as EcologicalSession[K][number][];
  if (a.length >= limit) {
    a.shift();
    s.dropped[k] = (s.dropped[k] ?? 0) + 1;
  }
  a.push(value);
  s.revision++;
}
function event(
  ctx: Context,
  w: World,
  kind: EcologicalSession["events"][number]["kind"],
  text: string,
  trace?: EcologicalSession["events"][number]["trace"],
) {
  bounded(
    ctx.session,
    "events",
    {
      tick: w.tick,
      segment: ctx.session.segment,
      kind,
      text,
      ...(trace ? { trace: structuredClone(trace) } : {}),
    },
    ECO_EVENTS,
  );
}
function makeReport(w: World, ctx: Context, recorded: boolean): DeathReport {
  const s = ctx.session,
    final = structuredClone(
      s.life.at(-1)?.tick === w.tick &&
        s.life.at(-1)?.alive === w.creature.alive
        ? s.life.at(-1)!
        : lifeSample(w, ctx),
    );
  final.food = availability(w);
  const physiology = recorded ? ctx.lastPhysiology : null;
  const facts = [
    `Arrêt du moteur : santé finale ${final.body.health}, vivant = ${w.creature.alive}.`,
    `${final.food.physicalCount} aliments physiquement présents ; ${final.food.visibleCount} dans le rayon sensoriel ; ${final.food.contactAndFits} au contact avec capacité stomacale suffisante.`,
    `L’énergie assimilée est mesurée séparément de la présence et des doses ingérées.`,
  ];
  if (physiology) {
    facts.push(
      `Dernier tick métabolique : perte de santé par absorption toxique ${physiology.toxinDamage}, par déficit énergétique ${physiology.starvationDamage}, récupération ${physiology.recovery}.`,
    );
    if (physiology.toxinDamage === 0 && physiology.starvationDamage === 0)
      facts.push(
        "Aucune perte métabolique mesurée au dernier tick ne suffit à expliquer l’arrêt.",
      );
  }
  const hypotheses: string[] = [];
  if (final.food.physicalCount && !final.food.visibleCount)
    hypotheses.push(
      "La nourriture restante hors du rayon sensoriel a pu contribuer au manque d’ingestion ; cela ne prouve pas qu’elle était impossible à atteindre auparavant.",
    );
  if (physiology?.starvationDamage)
    hypotheses.push(
      "Un apport assimilé trop faible par rapport aux dépenses a pu contribuer à l’épuisement énergétique. Les décisions et absorptions récentes permettent d’examiner cette hypothèse.",
    );
  const limitations = [
    "Le moteur ne calcule pas une cause unique de décès : il arrête la créature lorsque sa santé atteint zéro.",
    "Contact et capacité stomacale sont des conditions nécessaires, pas une preuve de consommation. Aucun plan de trajet ou pronostic de survie n’est calculé.",
    "Les doses toxiques absorbées et les pertes de santé sont mesurées ; un aliment ou une variété ne reçoit pas automatiquement la responsabilité du décès.",
    "Les courbes et journaux sont bornés ; les compteurs observés commencent à la capture et excluent ses interruptions.",
  ];
  if (!recorded)
    limitations.push(
      "Aucun tick terminal enregistré pour ce décès : son passé causal et les pertes du dernier tick sont inconnus. L’écosystème affiché est celui de la consultation.",
    );
  if (s.gaps)
    limitations.push(
      `${s.gaps} interruption(s) de capture : aucune donnée n’est reconstruite pendant ces périodes.`,
    );
  const recentTotals = {
    firstSampleTick: s.life[0]?.tick ?? w.tick,
    lastSampleTick: s.life.at(-1)?.tick ?? w.tick,
    sampleCount: s.life.length,
    absorbed: absorbed(),
    fluxes: {
      energySpent: 0,
      toxinDamage: 0,
      starvationDamage: 0,
      recovery: 0,
    },
  };
  for (const sample of s.life) {
    for (const cue of CUES)
      for (const key of ["nutrients", "energy", "toxins"] as const)
        recentTotals.absorbed[cue][key] += sample.absorbed[cue][key];
    for (const key of [
      "energySpent",
      "toxinDamage",
      "starvationDamage",
      "recovery",
    ] as const)
      recentTotals.fluxes[key] += sample.fluxes[key];
  }
  const report: DeathReport = {
    version: 1,
    tick: w.tick,
    coverageStart: s.startTick,
    gaps: s.gaps,
    provenance: recorded ? "recorded" : "loaded-dead",
    final,
    ecosystem: ecologicalSample(w, s),
    physiology,
    foodAssociations: structuredClone(w.creature.brain),
    lastDecision:
      recorded && ctx.lastDecision ? structuredClone(ctx.lastDecision) : null,
    recentTotals,
    samples: structuredClone(s.life),
    ingestions: structuredClone(s.ingestions),
    decisions: structuredClone(s.decisions),
    executions: structuredClone(s.executions),
    facts,
    hypotheses,
    limitations,
  };
  // Keep the time series; shed older identity/score details before refusing storage.
  if (JSON.stringify(report).length > REPORT_BYTES - 500) {
    report.limitations.push(
      "Détails historiques d’identités alimentaires réduits pour borner le rapport ; les décomptes et valeurs physiologiques sont conservés.",
    );
    for (const sample of report.samples) {
      sample.food.visible = [];
      sample.food.visibleDetailsTruncated = sample.food.visibleCount > 0;
    }
  }
  while (
    JSON.stringify(report).length > REPORT_BYTES - 500 &&
    report.decisions.length > 1
  )
    report.decisions.shift();
  while (
    JSON.stringify(report).length > REPORT_BYTES - 500 &&
    report.executions.length > 1
  )
    report.executions.shift();
  if (JSON.stringify(report).length > REPORT_BYTES - 500) {
    report.limitations.push(
      "Courbe corporelle sous-échantillonnée pour borner le rapport ; les totaux d’absorption d’origine restent conservés séparément.",
    );
    while (
      JSON.stringify(report).length > REPORT_BYTES - 500 &&
      report.samples.length > 2
    )
      report.samples = report.samples.filter(
        (_, i, a) => i === 0 || i === a.length - 1 || i % 2 === 0,
      );
  }
  if (
    report.decisions.length < s.decisions.length ||
    report.executions.length < s.executions.length
  )
    report.limitations.push(
      `Détails bornés : ${report.decisions.length}/${s.decisions.length} décisions et ${report.executions.length}/${s.executions.length} actions retenues dans le rapport.`,
    );
  return report;
}

// All state belongs to the observer, never to World or the simulation RNG.
export class EcologicalObservatory {
  enabled = true;
  private generation = 0;
  private contexts = new WeakMap<World, Context>();
  setEnabled(on: boolean) {
    if (this.enabled !== on) {
      this.enabled = on;
      this.generation++;
    }
  }
  inspect(w: World): EcologicalSession {
    const c = this.context(w);
    if (!w.creature.alive && !c.session.death) {
      if (c.generation !== this.generation) {
        c.session.gaps +=
          Math.ceil(this.generation / 2) - Math.ceil(c.generation / 2);
        c.generation = this.generation;
        c.session.segment++;
        event(
          c,
          w,
          "capture",
          "Décès constaté après une période sans capture ; pertes terminales inconnues.",
        );
      }
      if (
        c.session.life.at(-1)?.tick !== w.tick ||
        c.session.life.at(-1)?.alive
      ) {
        c.absorption = absorbed();
        c.fluxes = flux();
        this.sampleLife(w, c);
      }
      c.session.death = makeReport(w, c, false);
    }
    return c.session;
  }
  private context(w: World): Context {
    let c = this.contexts.get(w);
    if (!c) {
      const session: EcologicalSession = {
        revision: 0,
        startTick: w.tick,
        segment: 0,
        gaps: 0,
        dropped: {},
        ecological: [],
        life: [],
        events: [],
        ingestions: [],
        decisions: [],
        executions: [],
        produced: counts(),
        consumed: counts(),
        deaths: counts(),
        germinations: counts(),
        births: counts(),
        mortalityFactors: { amber: {}, blue: {}, rose: {} },
      };
      c = {
        session,
        generation: this.generation,
        previous: counts(),
        lastTime: null,
        consumedBefore: 0,
        absorption: absorbed(),
        fluxes: flux(),
        lastPhysiology: null,
      };
      this.contexts.set(w, c);
      event(
        c,
        w,
        "capture",
        "Début de capture ; historique antérieur inconnu.",
      );
      this.sample(w, c, true);
      if (!w.creature.alive) c.session.death = makeReport(w, c, false);
    }
    return c;
  }
  private resume(w: World, c: Context) {
    if (c.generation === this.generation) return;
    c.session.gaps +=
      Math.ceil(this.generation / 2) - Math.ceil(c.generation / 2);
    c.generation = this.generation;
    c.session.segment++;
    c.absorption = absorbed();
    c.fluxes = flux();
    c.lastPhysiology = null;
    c.lastDecision = undefined;
    c.previous = ecologicalSample(w, c.session).plants;
    event(
      c,
      w,
      "capture",
      "Reprise : période sans capture inconnue ; segments séparés.",
    );
    this.sample(w, c, true);
    if (!w.creature.alive && !c.session.death) this.inspect(w);
  }
  capture(w: World, intervention?: string) {
    const c = this.context(w);
    if (!this.enabled) return;
    this.resume(w, c);
    if (intervention) event(c, w, "intervention", intervention);
    this.sample(w, c, true);
  }
  step(w: World, other?: SimulationObserver) {
    if (!this.enabled) {
      engineStep(w, other);
      return;
    }
    const c = this.context(w);
    this.resume(w, c);
    const alive = w.creature.alive,
      tick = w.tick;
    c.consumedBefore = w.ecology?.counters.consumed ?? 0;
    engineStep(w, (e) => {
      this.consume(w, c, e);
      other?.(e);
    });
    if (w.tick === tick) return;
    this.sample(w, c, false);
    if (alive && !w.creature.alive) {
      // The terminal interval is retained even between regular one-second samples.
      if (c.session.life.at(-1)?.tick !== w.tick) this.sampleLife(w, c);
      c.session.death = makeReport(w, c, true);
      event(
        c,
        w,
        "death",
        "Santé arrivée à zéro ; rapport fondé sur les flux enregistrés.",
      );
    }
  }
  advance(w: World, ticks: number, other?: SimulationObserver) {
    for (let i = 0; i < ticks; i++) this.step(w, other);
  }
  private sampleLife(w: World, c: Context) {
    const sample = lifeSample(w, c),
      last = c.session.life.at(-1);
    if (last?.tick === w.tick && last.segment === sample.segment) {
      for (const cue of CUES)
        for (const key of ["nutrients", "energy", "toxins"] as const)
          sample.absorbed[cue][key] += last.absorbed[cue][key];
      for (const key of [
        "energySpent",
        "toxinDamage",
        "starvationDamage",
        "recovery",
      ] as const)
        sample.fluxes[key] += last.fluxes[key];
      c.session.life[c.session.life.length - 1] = sample;
      c.session.revision++;
    } else bounded(c.session, "life", sample, LIFE_POINTS);
    c.absorption = absorbed();
    c.fluxes = flux();
  }
  private sample(w: World, c: Context, force: boolean) {
    const s = c.session,
      time = w.ecology?.time ?? null;
    if (time !== c.lastTime || force) {
      const sample = ecologicalSample(w, s);
      for (const cue of CUES)
        if (c.previous[cue] > 0 && sample.plants[cue] === 0)
          event(
            c,
            w,
            "extinction",
            `Plus aucune plante vivante ${cue}, graines incluses. Les fruits restants sont comptés séparément.`,
          );
      c.previous = sample.plants;
      c.lastTime = time;
      if (
        force ||
        !s.ecological.length ||
        w.tick - s.ecological.at(-1)!.tick >= 50
      )
        if (
          s.ecological.at(-1)?.tick === w.tick &&
          s.ecological.at(-1)?.segment === sample.segment
        ) {
          s.ecological[s.ecological.length - 1] = sample;
          s.revision++;
        } else bounded(s, "ecological", sample, ECO_POINTS);
    }
    if (
      ((!s.death && w.creature.alive) || !s.life.length) &&
      (force || !s.life.length || w.tick - s.life.at(-1)!.tick >= 10)
    )
      this.sampleLife(w, c);
  }
  private consume(w: World, c: Context, e: DiagnosticEvent) {
    const s = c.session;
    switch (e.kind) {
      case "ecology": {
        const t = e.trace;
        if (t.event === "fruit") s.produced[t.variety]++;
        if (t.event === "seed") s.births[t.variety]++;
        if (t.event === "germination") s.germinations[t.variety]++;
        if (t.event === "death") {
          s.deaths[t.plant.variety]++;
          for (const [key, active] of Object.entries(t.conditions))
            if (active)
              s.mortalityFactors[t.plant.variety][key] =
                (s.mortalityFactors[t.plant.variety][key] ?? 0) + 1;
        }
        const text =
          t.event === "death"
            ? `Mort végétale #${t.plant.id} (${t.plant.variety}) : santé zéro, perte appliquée ${t.damage} ; facteurs actifs ${
                Object.entries(t.conditions)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ") || "aucun identifié"
              }.`
            : t.event === "fruit"
              ? `Fruit #${t.foodId} produit par la plante #${t.plantId} (${t.variety}).`
              : t.event === "seed"
                ? `Graine #${t.childId} issue de #${t.plantId} (${t.variety}).`
                : t.event === "germination"
                  ? `Germination achevée de #${t.plantId} (${t.variety}).`
                  : `${t.event === "decay" ? "Décomposition" : "Retrait extérieur"} du fruit #${t.foodId}.`;
        event(c, w, "plant", text, t);
        break;
      }
      case "ingestion": {
        const plantFruit =
          (w.ecology?.counters.consumed ?? 0) > c.consumedBefore;
        if (plantFruit) s.consumed[e.food.cue]++;
        bounded(
          s,
          "ingestions",
          { tick: e.tick, segment: s.segment, food: { ...e.food }, plantFruit },
          INGESTIONS,
        );
        event(
          c,
          w,
          "food",
          `Ingestion ${e.food.cue} #${e.food.id} : masse ${e.food.mass}, dose nutritive ${e.food.nutrients} ; absorption différée.`,
        );
        break;
      }
      case "absorption": {
        const a = c.absorption[e.trace.cue];
        a.nutrients += e.trace.nutrients ?? 0;
        a.energy += e.trace.energy;
        a.toxins += e.trace.absorbedToxin;
        break;
      }
      case "physiology": {
        c.lastPhysiology = { ...e.trace };
        for (const key of [
          "energySpent",
          "toxinDamage",
          "starvationDamage",
          "recovery",
        ] as const)
          c.fluxes[key] += e.trace[key];
        c.fluxes.energyAfterDigestion = e.trace.energyAfterDigestion;
        c.fluxes.healthAfterMetabolism = e.trace.healthAfterMetabolism;
        break;
      }
      case "decision":
        c.lastDecision = structuredClone(e.trace);
        bounded(
          s,
          "decisions",
          {
            tick: e.tick,
            segment: s.segment,
            trace: structuredClone({
              chosen: e.trace.chosen,
              branch: e.trace.branch,
              foodPolicy: e.trace.foodPolicy,
              foods: e.trace.foods,
              motivations: e.trace.motivations,
            }),
          },
          DECISIONS,
        );
        break;
      case "execution": {
        const last = s.executions.at(-1);
        if (
          !last ||
          e.tick - last.tick >= 10 ||
          JSON.stringify(last.action) !== JSON.stringify(e.action)
        )
          bounded(
            s,
            "executions",
            {
              tick: e.tick,
              segment: s.segment,
              action: structuredClone(e.action),
              moving: e.moving,
              distance: e.distance,
            },
            EXECUTIONS,
          );
        break;
      }
    }
  }
  // Sidecar snapshots bind a report to the exact saved world; never migrate World.
  exportReports(profiles: readonly WorldProfile[]): string {
    const entries = profiles.slice(0, 8).flatMap((p) => {
      const report = this.contexts.get(p.world)?.session.death;
      return report && JSON.stringify(report).length <= REPORT_BYTES
        ? [{ id: p.id, fingerprint: worldFingerprint(p.world), report }]
        : [];
    });
    return JSON.stringify({ version: 1, entries });
  }
  restoreReports(profiles: readonly WorldProfile[], json: string): number {
    if (json.length > SIDECAR_BYTES) return 0;
    try {
      const raw = JSON.parse(json);
      if (
        raw.version !== 1 ||
        !Array.isArray(raw.entries) ||
        raw.entries.length > 8
      )
        return 0;
      let restored = 0;
      for (const item of raw.entries) {
        const profile = profiles.find((p) => p.id === item.id);
        if (
          !profile ||
          profile.world.creature.alive ||
          item.fingerprint !== worldFingerprint(profile.world) ||
          !validDeathReport(item.report, REPORT_BYTES) ||
          JSON.stringify(item.report.final.body) !==
            JSON.stringify(bodyState(profile.world.creature))
        )
          continue;
        this.context(profile.world).session.death = structuredClone(
          item.report,
        );
        restored++;
      }
      return restored;
    } catch {
      return 0;
    }
  }
}
export function worldFingerprint(w: World): string {
  const json = JSON.stringify(w);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < json.length; i++) {
    a = Math.imul(a ^ json.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ json.charCodeAt(i);
  }
  return `${json.length}:${a >>> 0}:${b >>> 0}`;
}
