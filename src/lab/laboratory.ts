import { generateGenome, inheritGenome } from "../sim/genome";
import { deserialize } from "../sim/persistence";
import { hashSeed } from "../sim/random";
import { createWorld, advance } from "../sim/world";
import type { Food, Genome, InteractiveObject, World } from "../sim/types";
import type { SimulationObserver } from "../sim/diagnostics";

export const MAX_PROFILES = 8;
export const MAX_LAB_BYTES = 1_500_000;
export interface EnvironmentSnapshot {
  version: 1;
  id: string;
  seed: string;
  rng: number;
  nextId: number;
  foods: Food[];
  objects: InteractiveObject[];
}
export interface IndividualProfile {
  id: string;
  name: string;
  geneticSeed: string | null;
  parentId: string | null;
  parentGenome: Genome | null;
  trial: { sourceId: string; environment: EnvironmentSnapshot } | null;
  world: World;
}
export interface Laboratory {
  kind: "luma-laboratory";
  version: 1;
  activeId: string;
  nextId: number;
  profiles: IndividualProfile[];
  environment: EnvironmentSnapshot | null;
}

export function createLaboratory(world: World): Laboratory {
  return {
    kind: "luma-laboratory",
    version: 1,
    activeId: "individual-1",
    nextId: 2,
    profiles: [
      {
        id: "individual-1",
        name: "Milo",
        geneticSeed: null,
        parentId: null,
        parentGenome: null,
        trial: null,
        world,
      },
    ],
    environment: null,
  };
}
export function activeProfile(lab: Laboratory): IndividualProfile {
  return lab.profiles.find((profile) => profile.id === lab.activeId)!;
}
export function activateProfile(lab: Laboratory, id: string): World {
  const profile = lab.profiles.find((candidate) => candidate.id === id);
  if (!profile) throw new Error("Individu introuvable.");
  lab.activeId = id;
  return profile.world;
}
export function replaceActiveWorld(lab: Laboratory, world: World): void {
  const profile = activeProfile(lab);
  profile.world = world;
  profile.geneticSeed = null;
  profile.parentId = null;
  profile.parentGenome = null;
  profile.trial = null;
}
function insertProfile(
  lab: Laboratory,
  profile: Omit<IndividualProfile, "id">,
): IndividualProfile {
  if (lab.profiles.length >= MAX_PROFILES)
    throw new Error(
      "Le laboratoire peut conserver 8 profils. Exportez-le pour garder une archive.",
    );
  const created = { ...profile, id: `individual-${lab.nextId++}` };
  lab.profiles.push(created);
  return created;
}
export function addIndividual(
  lab: Laboratory,
  options: {
    name: string;
    geneticSeed: string;
    environmentSeed: string;
    parentId?: string;
  },
): IndividualProfile {
  const name = options.name.trim();
  if (
    !name ||
    name.length > 40 ||
    !text(options.geneticSeed) ||
    !text(options.environmentSeed)
  )
    throw new Error("Nom ou graine invalide.");
  const parent = options.parentId
    ? lab.profiles.find((p) => p.id === options.parentId)
    : undefined;
  if (options.parentId && !parent) throw new Error("Parent introuvable.");
  const genome = parent
    ? inheritGenome(parent.world.creature.genome, options.geneticSeed)
    : generateGenome(options.geneticSeed);
  return insertProfile(lab, {
    name,
    geneticSeed: options.geneticSeed,
    parentId: parent?.id ?? null,
    parentGenome: parent ? structuredClone(parent.world.creature.genome) : null,
    trial: null,
    world: createWorld(options.environmentSeed, genome),
  });
}

// Standardize time, spawn and body state for a fresh genetic comparison.
export function captureEnvironment(world: World): EnvironmentSnapshot {
  const payload = {
    version: 1 as const,
    seed: world.seed,
    rng: world.rng,
    nextId: world.nextId,
    foods: structuredClone(world.foods),
    objects: world.objects.map((object) => ({
      ...structuredClone(object),
      availableAt: 0,
    })),
  };
  return {
    ...payload,
    id: `terrain-${hashSeed(JSON.stringify(payload)).toString(16).padStart(8, "0")}`,
  };
}
export function trialWorld(
  genome: Genome,
  environment: EnvironmentSnapshot,
): World {
  const world = createWorld(environment.seed, genome);
  world.rng = environment.rng;
  world.nextId = environment.nextId;
  world.foods = structuredClone(environment.foods);
  world.objects = structuredClone(environment.objects);
  return world;
}
export function createTrial(
  lab: Laboratory,
  sourceId: string,
): IndividualProfile {
  const source = lab.profiles.find((profile) => profile.id === sourceId);
  if (!source) throw new Error("Individu introuvable.");
  if (!lab.environment)
    throw new Error("Mémorisez d’abord le terrain de l’individu actif.");
  const environment = structuredClone(lab.environment);
  return insertProfile(lab, {
    name: `${source.name.slice(0, 24)} · essai ${lab.nextId}`,
    geneticSeed: source.geneticSeed,
    parentId: source.parentId,
    parentGenome: structuredClone(source.parentGenome),
    trial: { sourceId, environment },
    world: trialWorld(source.world.creature.genome, environment),
  });
}
export function advanceActive(
  lab: Laboratory,
  ticks = 300,
  observe?: SimulationObserver,
): void {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 600)
    throw new Error("Durée d’essai invalide.");
  advance(activeProfile(lab).world, ticks, observe);
}
export const serializeLaboratory = (lab: Laboratory): string =>
  JSON.stringify(lab);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 80): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const nullableText = (value: unknown, max = 80): value is string | null =>
  value === null || text(value, max);

function validateEnvironment(value: unknown): EnvironmentSnapshot {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.seed !== "string" ||
    value.seed.length > 80 ||
    !text(value.id)
  )
    throw new Error("Terrain invalide.");
  const world = deserialize(
    JSON.stringify({
      ...createWorld(value.seed),
      rng: value.rng,
      nextId: value.nextId,
      foods: value.foods,
      objects: value.objects,
    }),
  );
  if (world.objects.some((object) => object.availableAt !== 0))
    throw new Error("Terrain non normalisé.");
  const normalized = captureEnvironment(world);
  if (normalized.id !== value.id)
    throw new Error("Empreinte du terrain invalide.");
  return normalized;
}

export function deserializeLaboratory(json: string): Laboratory {
  if (json.length > MAX_LAB_BYTES)
    throw new Error("Fichier de laboratoire trop volumineux.");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Fichier de laboratoire invalide.");
  }
  if (
    !record(raw) ||
    raw.kind !== "luma-laboratory" ||
    raw.version !== 1 ||
    !text(raw.activeId) ||
    !Number.isSafeInteger(raw.nextId) ||
    (raw.nextId as number) < 2 ||
    (raw.nextId as number) > 1e6 ||
    !Array.isArray(raw.profiles) ||
    raw.profiles.length < 1 ||
    raw.profiles.length > MAX_PROFILES
  )
    throw new Error("Laboratoire invalide ou incompatible.");
  const nextId = raw.nextId as number;
  const profiles: IndividualProfile[] = raw.profiles.map((value) => {
    if (
      !record(value) ||
      !text(value.id) ||
      !text(value.name, 40) ||
      !value.name.trim() ||
      !nullableText(value.geneticSeed) ||
      !nullableText(value.parentId)
    )
      throw new Error("Profil invalide.");
    const ordinal = /^individual-([1-9]\d*)$/.exec(value.id)?.[1];
    if (!ordinal || Number(ordinal) >= nextId)
      throw new Error("Identifiant de profil invalide.");
    let parentGenome: Genome | null = null;
    if (value.parentId !== null) {
      const reference = createWorld("parent-validation");
      parentGenome = deserialize(
        JSON.stringify({
          ...reference,
          creature: { ...reference.creature, genome: value.parentGenome },
        }),
      ).creature.genome;
    } else if (value.parentGenome !== null)
      throw new Error("Ascendance invalide.");
    let trial: IndividualProfile["trial"] = null;
    if (value.trial !== null) {
      if (!record(value.trial) || !text(value.trial.sourceId))
        throw new Error("Essai invalide.");
      trial = {
        sourceId: value.trial.sourceId,
        environment: validateEnvironment(value.trial.environment),
      };
    }
    return {
      id: value.id,
      name: value.name,
      geneticSeed: value.geneticSeed,
      parentId: value.parentId,
      parentGenome,
      trial,
      world: deserialize(JSON.stringify(value.world)),
    };
  });
  const ids = new Set(profiles.map((profile) => profile.id));
  const ordinal = (id: string): number => Number(id.split("-")[1]);
  if (
    ids.size !== profiles.length ||
    !ids.has(raw.activeId) ||
    profiles.some(
      (p) =>
        (p.parentId !== null &&
          (!ids.has(p.parentId) || ordinal(p.parentId) >= ordinal(p.id))) ||
        (p.trial &&
          (!ids.has(p.trial.sourceId) ||
            ordinal(p.trial.sourceId) >= ordinal(p.id))),
    )
  )
    throw new Error("Référence individuelle invalide.");
  return {
    kind: "luma-laboratory",
    version: 1,
    activeId: raw.activeId,
    nextId: raw.nextId as number,
    profiles,
    environment:
      raw.environment === null ? null : validateEnvironment(raw.environment),
  };
}
