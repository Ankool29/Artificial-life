import type { World } from "./types";
import type { Attribution } from "./instrumental-types";
import { MAX_GUT_CREDITS } from "./instrumental-types";

// Preserve learned values, counters, biology and RNG. Old ingested traces did not
// store appearance time: retain that uncertainty rather than invent a timestamp.
export function migrateInstrumental(world: World): void {
  const s = world.instrumental;
  if (!s || s.version !== 1) return;
  let gutEvidence = 0;
  for (const record of [...s.links, ...s.gut]) {
    const e = s.episodes.find((e) => e.id === record.episodeId);
    const evidence: Attribution = {
      hypotheses: e
        ? [
            {
              episodeId: e.id,
              targetId: e.targetId,
              situation: e.situation,
              actionTick: e.tick,
            },
          ]
        : [],
      observedTick: "tick" in record ? record.tick : null,
      bound: !!e,
    };
    Object.assign(record, evidence);
    if (!("tick" in record) && e && ++gutEvidence > MAX_GUT_CREDITS) {
      Object.assign(record, { hypotheses: [], episodeId: null, bound: false });
    }
  }
  s.version = 2;
}
