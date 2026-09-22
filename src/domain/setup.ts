// Season setup and lifecycle (guide §4, §13). Pure functions over a Season.
import type { AuditEvent, Season } from "./types";
import { findWinner, resolveWagers, type WagerEntry } from "./wager";

const clone = <T>(v: T): T => structuredClone(v);

export interface SetupIssue {
  level: "error" | "warning";
  section: "basics" | "teams" | "cast" | "episodes" | "rosters" | "scoring";
  message: string;
}

export const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A new season that copies the prior season's settings, slots, scoring and episode shape (guide §13). */
export function createSeason(prev: Season | null, id: string, name: string): Season {
  const base = prev ? clone(prev) : null;
  return {
    id,
    name,
    status: "SETUP",
    config: base
      ? { ...base.config, openingSeed: [] }
      : {
          timezone: "America/Los_Angeles",
          visibility: "PUBLIC_READ",
          ownershipCap: 3,
          swapCreditLimit: null,
          openingSeedMethod: "MANUAL_LIST",
          pickOrderTieRule: "OPENING_SEED_REVERSE",
          openingSeed: [],
          openingRoundMode: "SNAKE",
          freeReplacementStatuses: ["MEDICAL_EVACUATION"],
          wager: { minStake: 1, maxStake: 30, correctMultiplier: 1, wrongMultiplier: 1, winnerRule: "winner" },
        },
    tribes: base ? base.tribes : [],
    slots: base
      ? base.slots
      : [{ id: "slot1", name: "Wild", restrictionTribeId: null, enforceOnSwap: false }],
    episodes: base
      ? base.episodes.map((e) => ({ ...e, state: "SCHEDULED" as const }))
      : [],
    rules: base ? base.rules : [],
    castaways: [],
    teams: [],
    scores: [],
    transactions: [],
    statusEvents: [],
    tribeSwaps: [],
    wagers: [],
    wagerState: "OFF",
    opening: { picks: [] },
    windows: [],
    drafts: [],
    corrections: [],
    reference: { teamWeek: [], totals: {}, ranks: {}, rosters: [] },
  };
}

/** Why a roster (slot-ordered castaway ids) is not legal for this team, or null if it is. */
export function rosterProblem(season: Season, teamId: string, ids: string[], opts: { allowEmpty?: boolean } = {}): string | null {
  if (ids.length !== season.slots.length) return `Needs ${season.slots.length} castaways, one per slot.`;
  const filled = ids.filter(Boolean);
  if (new Set(filled).size !== filled.length) return "The same castaway is in more than one slot.";
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i] && opts.allowEmpty) continue;
    const c = season.castaways.find((x) => x.id === ids[i]);
    if (!c) return `Slot ${season.slots[i].name}: choose a castaway.`;
    const need = season.slots[i].restrictionTribeId;
    if (need && c.initialTribeId !== need) {
      const tribe = season.tribes.find((t) => t.id === need)?.name ?? need;
      return `${season.slots[i].name} slot needs a ${tribe} castaway (${c.name} started on a different tribe).`;
    }
  }
  const cap = season.config.ownershipCap;
  for (const id of filled) {
    const owners = season.teams.filter((t) => t.id !== teamId && t.draft.includes(id)).length;
    if (owners >= cap) return `${season.castaways.find((c) => c.id === id)!.name} is already on ${owners} teams (cap ${cap}).`;
  }
  return null;
}

/**
 * Renames a team. Anyone with a reason to touch it can: the commissioner from Setup, or the member themselves from
 * My Team — team names are deliberately left as filler ("Shane's Team") until whoever owns it wants to change it,
 * and that stays true any time before the season is archived, not just during setup.
 */
export function renameTeam(season: Season, teamId: string, name: string, actor: string): { season: Season; audit: AuditEvent[] } {
  if (season.status === "ARCHIVED") throw new Error("An archived season is read-only.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the team a name.");
  if (trimmed.length > 60) throw new Error("Keep the team name to 60 characters or fewer.");
  const team = season.teams.find((t) => t.id === teamId);
  if (!team) throw new Error("Unknown team.");
  if (team.name === trimmed) throw new Error("That is already the team's name.");
  const next = clone(season);
  const before = team.name;
  next.teams.find((t) => t.id === teamId)!.name = trimmed;
  return { season: next, audit: [{ seasonId: season.id, actor, entityType: "team", entityId: teamId, action: "RENAME", before, after: trimmed }] };
}

/**
 * Edits an existing castaway's name or starting tribe — needed, for instance, when the cast is announced before the
 * tribes are, so castaways go in with a placeholder tribe and get moved to their real one once it's revealed. Only
 * while the season is in setup, same as adding or removing one; a castaway already on a team's roster can still be
 * renamed, but not moved to a tribe that would make that roster illegal.
 */
export function updateCastaway(season: Season, castawayId: string, form: { name: string; tribe: string }, actor: string): { season: Season; audit: AuditEvent[] } {
  if (season.status !== "SETUP") throw new Error("This can only be changed while the season is in setup.");
  const castaway = season.castaways.find((c) => c.id === castawayId);
  if (!castaway) throw new Error("Unknown castaway.");
  const name = form.name.trim();
  if (!name) throw new Error("Give the castaway a name.");
  if (!season.tribes.some((t) => t.id === form.tribe)) throw new Error("Choose a tribe.");
  const before = { name: castaway.name, tribe: castaway.initialTribeId };
  if (before.name === name && before.tribe === form.tribe) throw new Error("Nothing changed.");
  if (before.tribe !== form.tribe) {
    for (const t of season.teams) {
      if (!t.draft.includes(castawayId)) continue;
      const ids = [...t.draft];
      const withNewTribe: Season = { ...season, castaways: season.castaways.map((c) => (c.id === castawayId ? { ...c, initialTribeId: form.tribe } : c)) };
      const p = rosterProblem(withNewTribe, t.id, ids);
      if (p) throw new Error(`${t.member}'s roster: ${p}`);
    }
  }
  const next = clone(season);
  const c = next.castaways.find((x) => x.id === castawayId)!;
  c.name = name;
  c.initialTribeId = form.tribe;
  return { season: next, audit: [{ seasonId: season.id, actor, entityType: "castaway", entityId: castawayId, action: "UPDATE", before, after: { name, tribe: form.tribe } }] };
}

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Setup validation (guide §13.1). Errors block activation; warnings do not. `rosters`, `episodes` and `scoring` can
 * each be turned off to check readiness for a narrower step — opening the draft needs teams and a pick order, not a
 * finished episode list or point values, since a league often drafts before the rest of the season is nailed down.
 */
export function validateSetup(season: Season, opts: { rosters?: boolean; episodes?: boolean; scoring?: boolean } = {}): SetupIssue[] {
  const out: SetupIssue[] = [];
  const err = (section: SetupIssue["section"], message: string) => out.push({ level: "error", section, message });
  const warn = (section: SetupIssue["section"], message: string) => out.push({ level: "warning", section, message });

  if (!validTimezone(season.config.timezone)) err("basics", `"${season.config.timezone}" is not a valid timezone.`);
  if (season.teams.length < 2) err("teams", "Add at least two teams.");
  if (season.config.ownershipCap < 1) err("basics", "The ownership cap must be at least 1.");
  else if (season.teams.length && season.config.ownershipCap > season.teams.length) warn("basics", "The ownership cap is higher than the number of teams, so it can never bind.");

  if (season.tribes.length === 0) err("cast", "Add at least one tribe.");
  if (season.castaways.length === 0) err("cast", "Add the cast.");
  for (const c of season.castaways) if (!season.tribes.some((t) => t.id === c.initialTribeId)) err("cast", `${c.name} has no valid tribe.`);
  if (season.castaways.length < season.slots.length) err("cast", "There are fewer castaways than roster slots.");

  if (season.slots.length === 0) err("rosters", "Define at least one roster slot.");
  for (const s of season.slots) if (s.restrictionTribeId && !season.tribes.some((t) => t.id === s.restrictionTribeId)) err("rosters", `Slot "${s.name}" is restricted to a tribe that does not exist.`);

  if (opts.episodes !== false) {
    if (season.episodes.length === 0) err("episodes", "Add the episodes.");
    season.episodes.forEach((e, i) => {
      if (e.number !== i + 1) err("episodes", `Episode numbers must run 1, 2, 3… (found ${e.number} at position ${i + 1}).`);
      if (e.rosterPolicy === "SNAPSHOT_AS_OF" && (!e.rosterPolicySourceEpisode || e.rosterPolicySourceEpisode >= e.number)) err("episodes", `Episode ${e.number}: SNAPSHOT_AS_OF needs an earlier source episode.`);
    });
    if (season.episodes.length && season.episodes.at(-1)!.phase !== "finale") warn("episodes", "The last episode is not marked as the finale.");
  }

  if (opts.scoring !== false) {
    if (season.rules.length === 0) err("scoring", "Add scoring rules (copy them from a prior season).");
    for (const r of season.rules) {
      if (r.inputType === "choice" && !(r.options ?? []).length) err("scoring", `"${r.name}" is a choice rule with no options.`);
      if (r.inputType !== "choice" && r.inputType !== "manual" && Object.values(r.points).every((p) => p === null)) err("scoring", `"${r.name}" has no point value in any phase.`);
    }
    for (const e of season.episodes) {
      if (!season.rules.some((r) => r.inputType !== "manual" && (r.points[e.phase] !== null || (r.options ?? []).length))) {
        err("scoring", `No rule scores anything in the ${e.phase} phase (episode ${e.number}).`);
        break;
      }
    }
  }

  const seed = season.config.openingSeed;
  if (seed.length !== season.teams.length || season.teams.some((t) => !seed.includes(t.id))) err("rosters", "The opening seed order must list every team exactly once.");
  if (opts.rosters !== false) {
    for (const t of season.teams) {
      const p = rosterProblem(season, t.id, t.draft);
      if (p) err("rosters", `${t.member}: ${p}`);
    }
  }
  return out;
}

export const canActivate = (season: Season) => season.status === "SETUP" && !validateSetup(season).some((i) => i.level === "error");

export function activateSeason(season: Season, actor: string): { season: Season; audit: AuditEvent[] } {
  if (season.status !== "SETUP") throw new Error("Only a season in setup can be activated.");
  const errors = validateSetup(season).filter((i) => i.level === "error");
  if (errors.length) throw new Error(`Fix ${errors.length} setup ${errors.length === 1 ? "problem" : "problems"} first.`);
  const next = clone(season);
  next.status = "ACTIVE";
  return { season: next, audit: [{ seasonId: season.id, actor, entityType: "season", entityId: season.id, action: "ACTIVATE" }] };
}

/** Finalize: the last episode is published, so the season becomes read-only history (guide §4). */
export function finalizeSeason(season: Season, actor: string, wagers: WagerEntry[] = []): { season: Season; audit: AuditEvent[] } {
  if (season.status !== "ACTIVE") throw new Error("Only an active season can be finalized.");
  if (season.episodes.some((e) => e.state !== "PUBLISHED")) throw new Error("Publish every episode first.");
  if (season.wagerState === "OPEN") throw new Error("Lock wagering before finalizing, so nobody can change a pick after the result is known.");
  const next = clone(season);
  // The reveal: this is the first moment picks are combined with the season data.
  let winner: string | null = null;
  if (season.wagerState === "LOCKED") {
    winner = findWinner(season);
    if (!winner) throw new Error("Score the Sole Survivor in the finale first, so wagers can be settled.");
    next.wagers = resolveWagers(next, wagers, winner);
  }
  next.status = "ARCHIVED";
  return { season: next, audit: [{ seasonId: season.id, actor, entityType: "season", entityId: season.id, action: "FINALIZE", after: winner ? { winner, wagers: wagers.length } : undefined }] };
}
