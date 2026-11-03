import type { IndividualProfile } from "../lab/laboratory";
import { createWorld, addFood, step } from "../sim/world";
import { LearningObservatory, type ObservationSession } from "./recorder";

export const PROTOCOLS = {
  preference: "Préférence progressive",
  aversion: "Aversion alimentaire",
  reversal: "Changement des effets",
  diversity: "Différences physiologiques",
} as const;
export type Protocol = keyof typeof PROTOCOLS;
export interface ExperimentResult {
  name: string;
  geneticSeed: string | null;
  session: ObservationSession;
  completed: number;
  finalValue: number;
  ticks: number;
}

// Isolated, sequential assay; no live profile or global RNG is touched.
// Explicit experimental interventions, never rules injected into decide/reinforce.
export function runLearningExperiment(
  profile: IndividualProfile,
  protocol: Protocol,
): ExperimentResult {
  const w = createWorld("observatory-assay-v1", profile.world.creature.genome);
  w.foods = [];
  const recorder = new LearningObservatory();
  recorder.setEnabled(true);
  const observe = recorder.observerFor(w);
  for (let episode = 0; episode < 8; episode++) {
    // Same controlled initial body for each exposure; acquired associations retained.
    Object.assign(w.creature.metabolism, {
      energy: 10,
      health: 100,
      toxins: 0,
      stomach: 0,
      gut: [],
    });
    w.creature.needs = { stimulation: 40, fatigue: 0, stress: 0 };
    Object.assign(w.creature, {
      x: 300,
      y: 340,
      alive: true,
      action: { kind: "rest" },
      nextDecision: w.tick,
    });
    w.foods = [];
    addFood(w, "amber", 300, 340);
    const harmful =
      protocol === "aversion" ||
      protocol === "diversity" ||
      (protocol === "reversal" && episode >= 4);
    Object.assign(w.foods[0]!, {
      nutrients: harmful ? 4 : 18,
      toxins: harmful ? 5 : 0,
    });
    recorder.recordIntervention(w, `Exposition contrôlée ${episode + 1}/8`, [
      "Corps réinitialisé, génome et associations conservés ; aliment placé au contact.",
      `Dose : ${harmful ? "4 nutriments, 5 toxines" : "18 nutriments, 0 toxine"}, masse 10.`,
      "Fenêtre de 180 ticks ; aliment non consommé retiré après 100 ticks. Aucune action forcée.",
    ]);
    // No forced ingestion/action and no coefficient changed: the ordinary policy decides.
    for (let tick = 0; tick < 180; tick++) {
      if (tick === 100) w.foods = [];
      step(w, observe);
    }
  }
  return {
    name: profile.name,
    geneticSeed: profile.geneticSeed,
    session: recorder.inspect(w)!,
    completed: w.creature.brain.amber.meals,
    finalValue: w.creature.brain.amber.value,
    ticks: w.tick,
  };
}
