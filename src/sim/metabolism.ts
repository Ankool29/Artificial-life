import type { PhysiologyTrace } from "./ecological-diagnostics";
import {
  clamp,
  DT,
  type Cue,
  type Food,
  type Genome,
  type Metabolism,
} from "./types";
import { physiology } from "./genome";
import type { AbsorptionTrace } from "./diagnostics";

export function hunger(m: Metabolism): number {
  return clamp(1 - m.energy / 100) * (1 - 0.7 * clamp(m.stomach / 36));
}
export function ingest(m: Metabolism, food: Food): boolean {
  if (m.stomach + food.mass > 36) return false;
  m.gut.push({
    cue: food.cue,
    remaining: food.mass,
    nutrients: food.nutrients,
    toxins: food.toxins,
    reward: 0,
  });
  m.stomach += food.mass;
  return true;
}
export interface Outcome {
  cue: Cue;
  reward: number;
}

export function metabolize(
  m: Metabolism,
  genome: Genome,
  moving: boolean,
  observe?: (trace: AbsorptionTrace) => void,
  observePhysiology?: (trace: PhysiologyTrace) => void,
): Outcome[] {
  const initialEnergy = observePhysiology ? m.energy : 0;
  let toxinDamage = 0;
  const outcomes: Outcome[] = [];
  const traits = physiology(genome);
  const locomotion = genome.version === 2 ? genome.genes.speed / 38 : 1;
  m.energy = clamp(
    m.energy -
      (0.32 + (moving ? 0.18 * locomotion : 0)) * DT * traits.metabolicRate,
    0,
    100,
  );
  const energySpent = observePhysiology ? initialEnergy - m.energy : 0;
  // Finite enzyme throughput shared across the gut; each meal takes several seconds.
  const throughput =
    (2.4 * DT * traits.digestionRate) / Math.max(1, m.gut.length);
  let diagnosticSlot = 0;
  for (const bolus of m.gut) {
    const amount = Math.min(throughput, bolus.remaining);
    const fraction = amount / bolus.remaining;
    const nutrients = bolus.nutrients * fraction;
    const absorbedToxin = bolus.toxins * fraction;
    const previousEnergy = m.energy;
    const previousHealth = m.health;
    m.energy = clamp(m.energy + nutrients * genome.genes.efficiency, 0, 100);
    m.toxins = clamp(m.toxins + absorbedToxin, 0, 100);
    m.health = clamp(
      m.health - absorbedToxin * 1.8 * traits.toxinSensitivity,
      0,
      100,
    );
    if (observePhysiology) toxinDamage += previousHealth - m.health;
    // Reinforcement from actual internal changes, never from a food's category.
    bolus.reward +=
      (m.energy - previousEnergy) / 25 + (m.health - previousHealth) / 14;
    bolus.nutrients = Math.max(0, bolus.nutrients - nutrients);
    bolus.toxins = Math.max(0, bolus.toxins - absorbedToxin);
    bolus.remaining = Math.max(0, bolus.remaining - amount);
    observe?.({
      nutrients,
      mass: amount,
      slot: diagnosticSlot++,
      cue: bolus.cue,
      energy: m.energy - previousEnergy,
      health: m.health - previousHealth,
      absorbedToxin,
      completed: bolus.remaining < 1e-8,
    });
    if (bolus.remaining < 1e-8)
      outcomes.push({ cue: bolus.cue, reward: clamp(bolus.reward, -2, 2) });
  }
  m.gut = m.gut.filter((bolus) => bolus.remaining >= 1e-8);
  m.stomach = m.gut.reduce((sum, bolus) => sum + bolus.remaining, 0);
  m.toxins = Math.max(0, m.toxins - genome.genes.detox * DT);
  const healthBeforeStarvation = observePhysiology ? m.health : 0;
  if (m.energy < 1) m.health = Math.max(0, m.health - 1.6 * DT);
  const starvationDamage = observePhysiology
    ? healthBeforeStarvation - m.health
    : 0;
  const healthBeforeRecovery = observePhysiology ? m.health : 0;
  if (m.energy > 35 && m.toxins < 1)
    m.health = Math.min(100, m.health + 0.13 * DT);
  observePhysiology?.({
    energySpent,
    toxinDamage,
    starvationDamage,
    recovery: m.health - healthBeforeRecovery,
    energyAfterDigestion: m.energy,
    healthAfterMetabolism: m.health,
  });
  return outcomes;
}
