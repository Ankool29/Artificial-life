import { motivations } from "../sim/curiosity";
import {
  bodyState,
  type BodyState,
  type DecisionTrace,
  type DiagnosticEvent,
  type SimulationObserver,
} from "../sim/diagnostics";
import {
  CUES,
  OBJECT_CUES,
  type Action,
  type Cue,
  type ObjectCue,
  type ObjectEffects,
  type World,
} from "../sim/types";

export const HISTORY_LIMIT = 320;
export const POINT_LIMIT = 180;
export const SAMPLE_LIMIT = 120;
export type TimelineKind =
  | "capture"
  | "perception"
  | "decision"
  | "action"
  | "ingestion"
  | "consequence"
  | "association"
  | "state";
export interface TimelineEntry {
  id: number;
  tick: number;
  kind: TimelineKind;
  title: string;
  details: string[];
  refs: string[];
}
export interface FoodConsequence {
  energy: number;
  health: number;
  absorbedToxin: number;
  partial: boolean;
}
interface Digestion extends FoodConsequence {
  episode: string;
  foodId?: number;
  startTick?: number;
  cue: Cue;
  completed: boolean;
}
export interface LearningPoint {
  tick: number;
  segment: number;
  domain: "food" | "object";
  cue: Cue | ObjectCue;
  before: number;
  after: number;
  count: number;
  reward?: number;
  rate?: number;
}
export interface StateSample {
  tick: number;
  segment: number;
  body: BodyState;
  drives: ReturnType<typeof motivations>;
}
export interface ObservationSession {
  startTick: number;
  revision: number;
  segment: number;
  dropped: number;
  history: TimelineEntry[];
  points: LearningPoint[];
  samples: StateSample[];
  lastDecision?: DecisionTrace;
  foodEffects: Partial<Record<Cue, FoodConsequence>>;
  objectEffects: Partial<Record<ObjectCue, ObjectEffects>>;
}
interface Context {
  session: ObservationSession;
  generation: number;
  nextId: number;
  nextEpisode: number;
  pending: Digestion[];
  completed: Digestion[];
  lastAction: string;
  observer: SimulationObserver;
}
const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
export function actionLabel(action: Action): string {
  switch (action.kind) {
    case "seek":
      return `Approcher l’aliment #${action.foodId}`;
    case "inspect":
      return `Approcher l’objet #${action.objectId}`;
    case "interact":
      return `Interagir avec l’objet #${action.objectId}`;
    case "wander":
      return `Explorer vers (${action.target.x.toFixed(1)}, ${action.target.y.toFixed(1)})`;
    case "rest":
      return "Repos";
  }
}
function bounded<T>(array: T[], value: T, limit: number): void {
  array.push(value);
  if (array.length > limit) array.shift();
}
function append(
  ctx: Context,
  tick: number,
  kind: TimelineKind,
  title: string,
  details: string[] = [],
  refs: string[] = [],
): void {
  if (ctx.session.history.length === HISTORY_LIMIT) ctx.session.dropped++;
  bounded(
    ctx.session.history,
    { id: ++ctx.nextId, tick, kind, title, details, refs },
    HISTORY_LIMIT,
  );
  ctx.session.revision++;
}
function unknownBolus(ctx: Context, cue: Cue): Digestion {
  return {
    episode: `b${++ctx.nextEpisode}`,
    cue,
    energy: 0,
    health: 0,
    absorbedToxin: 0,
    partial: true,
    completed: false,
  };
}

// Lives outside World and laboratory JSON. Weak keys release replaced/imported worlds.
export class LearningObservatory {
  enabled = false;
  private generation = 0;
  private contexts = new WeakMap<World, Context>();

  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.generation++;
    }
  }
  inspect(world: World): ObservationSession | undefined {
    return this.contexts.get(world)?.session;
  }
  capture(world: World): ObservationSession | undefined {
    if (this.enabled) this.observerFor(world);
    return this.inspect(world);
  }
  recordIntervention(world: World, title: string, details: string[]): void {
    if (!this.enabled) return;
    this.observerFor(world);
    const ctx = this.contexts.get(world)!;
    append(ctx, world.tick, "capture", title, details);
    bounded(
      ctx.session.samples,
      {
        tick: world.tick,
        segment: ctx.session.segment,
        body: bodyState(world.creature),
        drives: motivations(world.creature),
      },
      SAMPLE_LIMIT,
    );
  }
  observerFor(world: World): SimulationObserver | undefined {
    if (!this.enabled) return undefined;
    let ctx = this.contexts.get(world);
    if (!ctx) {
      const created: Context = {
        session: {
          startTick: world.tick,
          revision: 0,
          segment: 0,
          dropped: 0,
          history: [],
          points: [],
          samples: [],
          foodEffects: {},
          objectEffects: {},
        },
        generation: -1,
        nextId: 0,
        nextEpisode: 0,
        pending: [],
        completed: [],
        lastAction: "",
        observer: () => {},
      };
      created.observer = (event) => {
        if (this.enabled && created.generation === this.generation)
          this.consume(created, event);
      };
      ctx = created;
      this.contexts.set(world, ctx);
    }
    if (ctx.generation !== this.generation) {
      ctx.generation = this.generation;
      ctx.session.segment++;
      ctx.session.lastDecision = undefined;
      ctx.session.foodEffects = {};
      ctx.session.objectEffects = {};
      ctx.pending = world.creature.metabolism.gut.map((bolus) =>
        unknownBolus(ctx!, bolus.cue),
      );
      ctx.completed = [];
      ctx.lastAction = actionLabel(world.creature.action);
      append(ctx, world.tick, "capture", "Début / reprise de capture", [
        "L’historique antérieur et les périodes sans capture ne sont pas reconstruits.",
        "b… et d… sont des références locales de diagnostic, absentes des sauvegardes.",
      ]);
      for (const cue of CUES) {
        const m = world.creature.brain[cue];
        bounded(
          ctx.session.points,
          {
            tick: world.tick,
            segment: ctx.session.segment,
            domain: "food",
            cue,
            before: m.value,
            after: m.value,
            count: m.meals,
          },
          POINT_LIMIT,
        );
      }
      for (const cue of OBJECT_CUES) {
        const m = world.creature.objectBrain[cue];
        bounded(
          ctx.session.points,
          {
            tick: world.tick,
            segment: ctx.session.segment,
            domain: "object",
            cue,
            before: m.value,
            after: m.value,
            count: m.interactions,
          },
          POINT_LIMIT,
        );
      }
      bounded(
        ctx.session.samples,
        {
          tick: world.tick,
          segment: ctx.session.segment,
          body: bodyState(world.creature),
          drives: motivations(world.creature),
        },
        SAMPLE_LIMIT,
      );
    }
    return ctx.observer;
  }

  private consume(ctx: Context, event: DiagnosticEvent): void {
    const s = ctx.session,
      tick = event.tick;
    switch (event.kind) {
      case "decision": {
        const ref = `d${ctx.nextId + 1}`;
        s.lastDecision = event.trace;
        append(
          ctx,
          tick,
          "perception",
          "Perception calculée pour cette décision",
          [
            `Aliments : ${event.trace.foods.map((f) => `${f.cue} #${f.id} (${f.distance.toFixed(1)})`).join(", ") || "aucun"}`,
            `Objets : ${event.trace.objects.map((o) => `${o.cue} #${o.id} (${o.distance.toFixed(1)})`).join(", ") || "aucun"}`,
          ],
          [ref],
        );
        append(
          ctx,
          tick,
          "decision",
          actionLabel(event.trace.chosen),
          [
            `Branche : ${event.trace.branch} ; politique alimentaire : ${event.trace.foodPolicy}.`,
            `${event.trace.candidates.length} scores effectivement calculés (sélection alimentaire et arbitrage distincts).`,
          ],
          [ref],
        );
        break;
      }
      case "ingestion": {
        const p = unknownBolus(ctx, event.food.cue);
        Object.assign(p, {
          foodId: event.food.id,
          startTick: tick,
          partial: false,
        });
        ctx.pending.push(p);
        append(
          ctx,
          tick,
          "ingestion",
          `Ingestion de ${event.food.cue} #${event.food.id}`,
          [
            `Dose physique : masse ${event.food.mass}, nutriments ${event.food.nutrients}, toxines ${event.food.toxins}.`,
            "Diagnostic physique après ingestion ; composition jamais fournie à la décision.",
          ],
          [p.episode, `aliment #${event.food.id}`],
        );
        break;
      }
      case "absorption": {
        const a = event.trace;
        const p =
          ctx.pending[a.slot] ??
          (ctx.pending[a.slot] = unknownBolus(ctx, a.cue));
        p.energy += a.energy;
        p.health += a.health;
        p.absorbedToxin += a.absorbedToxin;
        if (a.completed) {
          p.completed = true;
          ctx.completed.push(p);
          s.foodEffects[p.cue] = {
            energy: p.energy,
            health: p.health,
            absorbedToxin: p.absorbedToxin,
            partial: p.partial,
          };
          append(
            ctx,
            tick,
            "consequence",
            `Absorption terminée : ${p.cue}`,
            [
              `Δ énergie ${signed(p.energy)}, Δ santé ${signed(p.health)}, dose toxique absorbée ${p.absorbedToxin.toFixed(3)}.`,
              p.partial
                ? "Bilan partiel : bolus présent avant capture, aliment d’origine inconnu."
                : `Ingestion au tick ${p.startTick} ; effets mesurés pendant l’absorption.`,
            ],
            [
              p.episode,
              ...(p.foodId === undefined ? [] : [`aliment #${p.foodId}`]),
            ],
          );
        }
        break;
      }
      case "food-learning": {
        // Outcome order is exactly the completion order of the metabolism loop.
        const p = ctx.completed.shift();
        const refs =
          p?.cue === event.cue
            ? [
                p.episode,
                ...(p.foodId === undefined ? [] : [`aliment #${p.foodId}`]),
              ]
            : [];
        bounded(
          s.points,
          {
            tick,
            segment: s.segment,
            domain: "food",
            cue: event.cue,
            before: event.before.value,
            after: event.after.value,
            count: event.after.meals,
            reward: event.reward,
            rate: event.rate,
          },
          POINT_LIMIT,
        );
        append(
          ctx,
          tick,
          "association",
          `Association alimentaire : ${event.cue}`,
          [
            `${signed(event.before.value)} → ${signed(event.after.value)} ; bilan ${signed(event.reward)} ; plasticité ${event.rate.toFixed(3)} ; expérience ${event.after.meals}.`,
            "Attribution directe du moteur au signal du bolus ; aucune causalité intermédiaire inférée.",
          ],
          refs,
        );
        break;
      }
      case "interaction-start":
        append(
          ctx,
          tick,
          "action",
          `Début d’interaction : ${event.cue}`,
          [],
          [`objet #${event.objectId}`],
        );
        break;
      case "object-learning":
        s.objectEffects[event.cue] = { ...event.changes };
        append(
          ctx,
          tick,
          "consequence",
          `Effets mesurés de ${event.cue}`,
          Object.entries(event.changes).map(
            ([key, value]) => `${key} : ${signed(value)}`,
          ),
          [`objet #${event.objectId}`],
        );
        bounded(
          s.points,
          {
            tick,
            segment: s.segment,
            domain: "object",
            cue: event.cue,
            before: event.before.value,
            after: event.after.value,
            count: event.after.interactions,
            reward: event.reward,
            rate: event.rate,
          },
          POINT_LIMIT,
        );
        append(
          ctx,
          tick,
          "association",
          `Association d’objet : ${event.cue}`,
          [
            `${signed(event.before.value)} → ${signed(event.after.value)} ; bilan ${signed(event.reward)} ; plasticité ${event.rate.toFixed(3)} ; expérience ${event.after.interactions}.`,
            `Effets attendus après mise à jour : ${Object.entries(
              event.after.expected,
            )
              .map(([k, v]) => `${k} ${signed(v)}`)
              .join(", ")}.`,
          ],
          [`objet #${event.objectId}`],
        );
        break;
      case "state": {
        const action = actionLabel(event.action);
        if (action !== ctx.lastAction) {
          append(ctx, tick, "action", `Action en fin de tick : ${action}`, [
            event.alive ? "Créature vivante." : "Vie terminée.",
          ]);
          ctx.lastAction = action;
        }
        const last = s.samples.at(-1)!;
        if (tick - last.tick >= 10 || !event.alive) {
          // Net interval deltas include every process; no attribution to a nearby object.
          append(
            ctx,
            tick,
            "state",
            `Variation nette sur ${tick - last.tick} ticks`,
            (Object.keys(event.body) as (keyof BodyState)[]).map(
              (key) => `${key} : ${signed(event.body[key] - last.body[key])}`,
            ),
          );
          bounded(
            s.samples,
            {
              tick,
              segment: s.segment,
              body: { ...event.body },
              drives: { ...event.drives },
            },
            SAMPLE_LIMIT,
          );
        }
        ctx.pending = ctx.pending.filter((p) => !p.completed);
        break;
      }
    }
  }
}
