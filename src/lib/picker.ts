// Builds the data the pick panel shows. League-wide capacity and this team's own legality are kept apart:
// every castaway stays listed, and a blocked one carries the reason (guide §9.2 guardrails).
import { ownerCount, effectiveRoster } from "@/domain/engine";
import { openingBlock, replaceableSlots, replacementCheck } from "@/domain/picks";
import type { Season } from "@/domain/types";

export interface PickSlot {
  index: number;
  name: string;
  hint: string;
}

export interface PickCandidate {
  id: string;
  name: string;
  tribeName: string;
  tribeColor: string;
  owners: number;
  cap: number;
  /** Per slot index: null when legal, otherwise why not. */
  blocked: Record<number, string | null>;
}

function candidate(season: Season, castawayId: string, episode: number, slots: PickSlot[], block: (slot: number, id: string) => string | null): PickCandidate {
  const c = season.castaways.find((x) => x.id === castawayId)!;
  const tribe = season.tribes.find((t) => t.id === c.initialTribeId);
  return {
    id: c.id,
    name: c.name,
    tribeName: tribe?.name ?? "",
    tribeColor: tribe?.color ?? "#888",
    owners: ownerCount(season, c.id, episode),
    cap: season.config.ownershipCap,
    blocked: Object.fromEntries(slots.map((s) => [s.index, block(s.index, c.id)])),
  };
}

export function openingPanel(season: Season, teamId: string): { slots: PickSlot[]; candidates: PickCandidate[] } {
  const team = season.teams.find((t) => t.id === teamId)!;
  const slots = season.slots
    .map((s, index) => ({ index, name: s.name, hint: s.restrictionTribeId ? `${season.tribes.find((t) => t.id === s.restrictionTribeId)?.name} castaways only` : "Any castaway", filled: !!team.draft[index] }))
    .filter((s) => !s.filled)
    .map(({ index, name, hint }) => ({ index, name, hint }));
  return { slots, candidates: season.castaways.map((c) => candidate(season, c.id, 1, slots, (slot, id) => openingBlock(season, teamId, slot, id))) };
}

export function replacementPanel(season: Season, teamId: string, episode: number): { slots: PickSlot[]; candidates: PickCandidate[] } {
  const roster = effectiveRoster(season, teamId, episode);
  const slots = replaceableSlots(season, teamId, episode).map((index) => ({
    index,
    name: season.slots[index].name,
    hint: `Replaces ${season.castaways.find((c) => c.id === roster[index])?.name ?? "—"}`,
  }));
  return {
    slots,
    candidates: season.castaways.map((c) =>
      candidate(season, c.id, episode, slots, (slot, id) => {
        const r = replacementCheck(season, teamId, slot, id, episode);
        return r.ok ? null : r.reason;
      }),
    ),
  };
}
