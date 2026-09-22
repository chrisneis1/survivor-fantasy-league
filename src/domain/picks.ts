// Opening selection and weekly replacement windows (guide §5.1–5.4, §7).
// Pure functions. Every write returns a new Season plus audit events; the store makes it atomic.
import { buildPickQueue, effectiveRoster, isActiveAt, latestPublished, ownerCount, statusEventFor } from "./engine";
import { rosterProblem, validateSetup } from "./setup";
import type { AuditEvent, PickTurn, PickWindow, Season, Transaction } from "./types";

const clone = <T>(v: T): T => structuredClone(v);
type Result = { season: Season; audit: AuditEvent[] };
const ev = (s: Season, actor: string, entityType: string, entityId: string, action: string, after?: unknown, reason?: string): AuditEvent => ({
  seasonId: s.id,
  actor,
  entityType,
  entityId,
  action,
  after,
  reason,
});

// =====================================================================================================
// Opening selection
// =====================================================================================================

/** Team ids in turn order: one castaway per turn, `slots` rounds, FIXED or SNAKE traversal after round 1. */
export function openingSequence(season: Season): string[] {
  const seed = season.config.openingSeed;
  const out: string[] = [];
  for (let r = 0; r < season.slots.length; r++) {
    out.push(...(season.config.openingRoundMode === "SNAKE" && r % 2 === 1 ? [...seed].reverse() : seed));
  }
  return out;
}

export interface OpeningTurn {
  index: number;
  teamId: string;
  round: number;
  total: number;
}

export function openingTurn(season: Season): OpeningTurn | null {
  if (season.status !== "OPENING_SELECTION") return null;
  const seq = openingSequence(season);
  const index = season.opening.picks.length;
  if (index >= seq.length) return null;
  return { index, teamId: seq[index], round: Math.floor(index / season.teams.length) + 1, total: seq.length };
}

/** Opens member picking. The commissioner-entry path (activate directly) skips this. */
/**
 * Publishes the teams and pick order and hands control to the members: from here, each pick is theirs to make (or
 * the commissioner's, on their behalf) from the draft board, not something typed into Setup. Deliberately does not
 * require episodes or scoring to be configured yet — a league often finalizes those closer to when the season
 * airs, after the draft is already done.
 */
export function openOpeningSelection(season: Season, actor: string): Result {
  if (season.status !== "SETUP") throw new Error("Only a season in setup can open selection.");
  const errors = validateSetup(season, { rosters: false, episodes: false, scoring: false }).filter((i) => i.level === "error");
  if (errors.length) throw new Error(`Fix ${errors.length} setup ${errors.length === 1 ? "problem" : "problems"} first.`);
  if (season.teams.some((t) => t.draft.some(Boolean))) throw new Error("Some rosters are already filled in. Clear them, or activate the season directly instead.");
  const next = clone(season);
  next.status = "OPENING_SELECTION";
  return { season: next, audit: [ev(season, actor, "season", season.id, "OPEN_OPENING_SELECTION", { order: season.config.openingSeed, mode: season.config.openingRoundMode })] };
}

/** Why `castawayId` cannot go in `slot` for this team right now (the same checks the server runs on commit). */
export function openingBlock(season: Season, teamId: string, slot: number, castawayId: string): string | null {
  const team = season.teams.find((t) => t.id === teamId);
  if (!team) return "Unknown team.";
  if (!season.slots[slot]) return "Unknown slot.";
  if (team.draft[slot]) return "That slot is already filled.";
  const ids = [...team.draft];
  ids[slot] = castawayId;
  return rosterProblem(season, teamId, ids, { allowEmpty: true });
}

export function makeOpeningPick(season: Season, teamId: string, slot: number, castawayId: string, actor: string, at: string, reason?: string): Result {
  const turn = openingTurn(season);
  if (!turn) throw new Error("Opening selection is not open.");
  if (turn.teamId !== teamId) throw new Error("It isn't this team's turn to pick.");
  const problem = openingBlock(season, teamId, slot, castawayId);
  if (problem) throw new Error(problem);
  const next = clone(season);
  next.teams.find((t) => t.id === teamId)!.draft[slot] = castawayId;
  next.opening.picks.push({ team: teamId, slot, castaway: castawayId, round: turn.round, at, by: actor });
  const audit = [ev(season, actor, "opening_pick", `${turn.index + 1}`, "PICK", { team: teamId, slot: season.slots[slot].name, castaway: castawayId, round: turn.round }, reason)];
  if (next.opening.picks.length === openingSequence(next).length) {
    next.status = "ACTIVE";
    audit.push(ev(season, actor, "season", season.id, "OPENING_COMPLETE"));
  }
  return { season: next, audit };
}

// =====================================================================================================
// Weekly replacement windows
// =====================================================================================================

/** Slots whose current castaway is out of the game at `episode`, so the slot can take a replacement. */
export function replaceableSlots(season: Season, teamId: string, episode: number): number[] {
  return effectiveRoster(season, teamId, episode)
    .map((c, i) => (c && !isActiveAt(season, c, episode) ? i : -1))
    .filter((i) => i >= 0);
}

const swapsUsed = (season: Season, teamId: string) => season.transactions.filter((t) => t.team === teamId && !t.free).length;

/** Whether replacing `slot` is free of swap credits (e.g. after a medical evacuation). */
function isFree(season: Season, outgoing: string): boolean {
  const exit = statusEventFor(season, outgoing);
  return !!exit && season.config.freeReplacementStatuses.includes(exit.type);
}

export type Legal = { ok: true; free: boolean } | { ok: false; reason: string };

/** The full server-side rule check for one replacement (guide §5.4). The UI shows `reason` beside disabled choices. */
export function replacementCheck(season: Season, teamId: string, slot: number, incoming: string, episode: number): Legal {
  const roster = effectiveRoster(season, teamId, episode);
  const outgoing = roster[slot];
  if (!outgoing || isActiveAt(season, outgoing, episode)) return { ok: false, reason: "That slot has nobody to replace." };
  const c = season.castaways.find((x) => x.id === incoming);
  if (!c) return { ok: false, reason: "Unknown castaway." };
  if (!isActiveAt(season, incoming, episode)) return { ok: false, reason: "Eliminated" };
  if (roster.includes(incoming)) return { ok: false, reason: "Already on your team" };
  if (ownerCount(season, incoming, episode) >= season.config.ownershipCap) return { ok: false, reason: "Ownership cap reached" };
  const need = season.slots[slot].restrictionTribeId;
  if (need && season.slots[slot].enforceOnSwap && c.initialTribeId !== need) return { ok: false, reason: "Wrong tribe for this slot" };
  const free = isFree(season, outgoing);
  const limit = season.config.swapCreditLimit;
  if (!free && limit !== null && swapsUsed(season, teamId) >= limit) return { ok: false, reason: "No swap credits left" };
  return { ok: true, free };
}

/** Does this team have at least one legal replacement available right now? */
export function hasLegalPick(season: Season, teamId: string, episode: number): boolean {
  for (const slot of replaceableSlots(season, teamId, episode))
    for (const c of season.castaways) if (replacementCheck(season, teamId, slot, c.id, episode).ok) return true;
  return false;
}

/** How many more replacements the team could make, bounded by open slots and swap credits/free entitlements. */
export function picksRemaining(season: Season, teamId: string, episode: number): number {
  const roster = effectiveRoster(season, teamId, episode);
  const open = replaceableSlots(season, teamId, episode);
  const free = open.filter((i) => isFree(season, roster[i])).length;
  const limit = season.config.swapCreditLimit;
  const credits = limit === null ? Infinity : Math.max(limit - swapsUsed(season, teamId), 0);
  return free + Math.min(open.length - free, credits);
}

export const currentTurn = (w: PickWindow) => w.turns.find((t) => t.status === "UP_NOW");
export const openWindow = (season: Season) => season.windows.find((w) => w.status === "OPEN");

/** Why the commissioner cannot open a pick window after `afterEpisode` right now, or null if they can. */
export function windowBlock(season: Season, afterEpisode: number): string | null {
  if (season.status !== "ACTIVE") return "The season is not active.";
  if (openWindow(season)) return "A pick window is already open. Close it first.";
  if (season.windows.some((w) => w.afterEpisode === afterEpisode)) return "A window was already held after that episode.";
  if (afterEpisode !== latestPublished(season)) return "A window can only be opened after the most recently published episode.";
  const nextEp = season.episodes.find((e) => e.number === afterEpisode + 1);
  if (!nextEp) return "That was the last episode, so there is nothing left to pick for.";
  if (nextEp.rosterPolicy !== "EFFECTIVE") return `${nextEp.title} scores a fixed roster, so swaps would not change any score.`;
  if (!buildPickQueue(season, afterEpisode).some((q) => q.eligible)) return "No team has an eligible replacement to make.";
  return null;
}

/**
 * The commissioner opens the window after `afterEpisode`. The reverse-standings queue is frozen now and is never
 * re-sorted, even if a score is corrected later (guide §5.2). There is no time limit on any turn.
 */
export function openPickWindow(season: Season, afterEpisode: number, at: string, actor: string): Result {
  const block = windowBlock(season, afterEpisode);
  if (block) throw new Error(block);
  const turns: PickTurn[] = buildPickQueue(season, afterEpisode).map((q) => ({
    sequence: q.sequence,
    teamId: q.teamId,
    pointsAtOpen: q.pointsAtOpen,
    rankAtOpen: q.rankAtOpen,
    openSlots: q.openSlots,
    eligible: q.eligible,
    status: q.eligible ? "WAITING" : "AUTO_SKIPPED",
    picks: 0,
    ...(q.eligible ? {} : { skipReason: q.skipReason }),
  }));
  const window: PickWindow = { id: `w${afterEpisode}`, afterEpisode, status: "OPEN", openedAt: at, turns };
  const next = clone(season);
  next.windows.push(window);
  return { season: advance(next, at), audit: [ev(season, actor, "pick_window", window.id, "OPEN", { afterEpisode, queue: turns.map((t) => t.teamId) })] };
}

/**
 * Moves the queue on: teams with no legal pick are auto-skipped with a reason, the next team becomes Up Now, and the
 * window closes when everyone has been through. Nothing here depends on the clock.
 */
export function advance(season: Season, at: string): Season {
  const next = clone(season);
  for (const w of next.windows) {
    if (w.status !== "OPEN") continue;
    const episode = w.afterEpisode + 1;
    for (let guard = 0; guard < 200; guard++) {
      if (currentTurn(w)) break;
      const waiting = w.turns.find((t) => t.status === "WAITING");
      if (!waiting) {
        w.status = "CLOSED";
        w.closedAt = at;
        break;
      }
      if (!hasLegalPick(next, waiting.teamId, episode)) {
        waiting.status = "AUTO_SKIPPED";
        waiting.skipReason = "No eligible pick when its turn came";
        continue;
      }
      waiting.status = "UP_NOW";
      waiting.startedAt = at;
    }
  }
  return next;
}

function turnFor(season: Season, teamId: string): { window: PickWindow; turn: PickTurn } {
  const window = openWindow(season);
  const turn = window && currentTurn(window);
  if (!window || !turn || turn.teamId !== teamId) throw new Error("It isn't this team's turn to pick.");
  return { window, turn };
}

/** One replacement in the current team's turn. The team stays Up Now while it still has a legal pick. */
export function makeReplacement(season: Season, teamId: string, slot: number, incoming: string, actor: string, at: string, reason?: string): Result {
  const { window: w0 } = turnFor(season, teamId);
  const episode = w0.afterEpisode + 1;
  const legal = replacementCheck(season, teamId, slot, incoming, episode);
  if (!legal.ok) throw new Error(legal.reason);

  const next = clone(season);
  const { window, turn } = turnFor(next, teamId);
  const outgoing = effectiveRoster(next, teamId, episode)[slot];
  const order = Math.max(0, ...next.transactions.map((t) => t.order ?? 0)) + 1;
  const tx: Transaction = {
    id: `tx${next.transactions.length + 1}`,
    team: teamId,
    slot,
    out: outgoing,
    in: incoming,
    windowAfterEpisode: window.afterEpisode,
    effectiveEpisode: episode,
    order,
    at,
    by: actor,
    ...(legal.free ? { free: true, note: "Free replacement" } : {}),
  };
  next.transactions.push(tx);
  turn.picks += 1;
  const audit = [ev(season, actor, "roster", teamId, "REPLACE", { slot: season.slots[slot].name, out: outgoing, in: incoming, free: !!legal.free, window: window.id }, reason)];
  // Out of legal picks (no open slot, no credits, nobody left to take): the turn ends by itself.
  if (!hasLegalPick(next, teamId, episode)) {
    turn.status = "COMPLETED";
    turn.completedAt = at;
  }
  return { season: advance(next, at), audit };
}

/** "Done / Pass remaining picks": ends the turn, keeping any unused swap credits. The commissioner can also skip a team. */
export function endTurn(season: Season, teamId: string, actor: string, at: string, opts: { reason?: string; skipped?: boolean } = {}): Result {
  const next = clone(season);
  const { window, turn } = turnFor(next, teamId);
  turn.status = turn.picks > 0 ? "COMPLETED" : "PASSED";
  if (opts.skipped) turn.skipReason = "Skipped by the commissioner";
  turn.completedAt = at;
  return { season: advance(next, at), audit: [ev(season, actor, "pick_window", window.id, opts.skipped ? "SKIP_TURN" : "END_TURN", { team: teamId, picks: turn.picks }, opts.reason)] };
}

/** The commissioner ends the window. Teams that have not acted are marked as passed. */
export function closePickWindow(season: Season, actor: string, at: string, reason?: string): Result {
  const w0 = openWindow(season);
  if (!w0) throw new Error("There is no open pick window.");
  const next = clone(season);
  const w = openWindow(next)!;
  for (const t of w.turns) {
    if (t.status === "WAITING" || t.status === "UP_NOW") {
      t.status = t.picks > 0 ? "COMPLETED" : "PASSED";
      t.skipReason = "Window closed by the commissioner";
      t.completedAt = at;
    }
  }
  w.status = "CLOSED";
  w.closedAt = at;
  return { season: next, audit: [ev(season, actor, "pick_window", w.id, "CLOSE", undefined, reason)] };
}
