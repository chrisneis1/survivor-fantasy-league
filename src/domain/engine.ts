// The rules engine: pure functions over a Season. No season number, castaway name or point value
// appears here — only the shapes in types.ts (guide §5, §12.1).
import type {
  Availability,
  Castaway,
  Episode,
  QueueEntry,
  Season,
  StandingRow,
  StatusEvent,
  Transaction,
} from "./types";

export interface SeasonModel {
  season: Season;
  castaway: Map<string, Castaway>;
  team: Map<string, Season["teams"][number]>;
  tribe: Map<string, Season["tribes"][number]>;
  rule: Map<string, Season["rules"][number]>;
  episode: (n: number) => Episode;
  /** Every published episode's number, ascending. */
  published: number[];
}

export function buildModel(season: Season): SeasonModel {
  return {
    season,
    castaway: new Map(season.castaways.map((c) => [c.id, c])),
    team: new Map(season.teams.map((t) => [t.id, t])),
    tribe: new Map(season.tribes.map((t) => [t.id, t])),
    rule: new Map(season.rules.map((r) => [r.key, r])),
    episode: (n) => {
      const e = season.episodes.find((x) => x.number === n);
      if (!e) throw new Error(`no episode ${n}`);
      return e;
    },
    published: season.episodes.map((e) => e.number),
  };
}

// ---------- scoring ----------

const totalCache = new WeakMap<Season, Map<string, number>>();

/** Castaway episode total = sum of resolved scoring entries. */
export function castawayEpisodeTotal(season: Season, castawayId: string, episode: number): number {
  let cache = totalCache.get(season);
  if (!cache) {
    cache = new Map();
    for (const s of season.scores) {
      const k = `${s.castaway}:${s.episode}`;
      cache.set(k, (cache.get(k) ?? 0) + s.entries.reduce((sum, e) => sum + e.points, 0));
    }
    totalCache.set(season, cache);
  }
  return cache.get(`${castawayId}:${episode}`) ?? 0;
}

export function castawaySeasonTotal(season: Season, castawayId: string, through = Infinity): number {
  return season.episodes
    .filter((e) => e.number <= through)
    .reduce((sum, e) => sum + castawayEpisodeTotal(season, castawayId, e.number), 0);
}

// ---------- roster resolver (guide §5.6) ----------

function orderedTransactions(season: Season, teamId: string): Transaction[] {
  return season.transactions
    .filter((t) => t.team === teamId)
    .sort((a, b) => a.windowAfterEpisode - b.windowAfterEpisode || (a.order ?? 0) - (b.order ?? 0));
}

/** Slot-ordered roster in force at the start of `episode`, from the draft plus every swap effective by then. */
export function effectiveRoster(season: Season, teamId: string, episode: number): string[] {
  const team = season.teams.find((t) => t.id === teamId);
  if (!team) throw new Error(`no team ${teamId}`);
  const roster = [...team.draft];
  for (const tx of orderedTransactions(season, teamId)) {
    if (tx.effectiveEpisode <= episode) roster[tx.slot] = tx.in;
  }
  return roster;
}

/** The roster that counts for `episode`, exactly per that episode's named policy. Never falls back silently. */
export function rosterForEpisode(season: Season, teamId: string, episode: number): string[] {
  const ep = season.episodes.find((e) => e.number === episode);
  if (!ep) throw new Error(`no episode ${episode}`);
  switch (ep.rosterPolicy) {
    case "EFFECTIVE":
      return effectiveRoster(season, teamId, episode);
    case "ORIGINAL_DRAFT":
      return [...season.teams.find((t) => t.id === teamId)!.draft];
    case "SNAPSHOT_AS_OF":
      if (ep.rosterPolicySourceEpisode === undefined || ep.rosterPolicySourceEpisode >= episode)
        throw new Error(`episode ${episode}: SNAPSHOT_AS_OF needs an earlier source episode`);
      return effectiveRoster(season, teamId, ep.rosterPolicySourceEpisode);
  }
}

export function teamEpisodeScore(season: Season, teamId: string, episode: number): number {
  const ep = season.episodes.find((e) => e.number === episode);
  // An episode scored before any team has a roster (e.g. a premiere aired before the draft) never contributes,
  // regardless of what a roster resolver would return for it now or later.
  if (ep?.excludeFromStandings) return 0;
  return rosterForEpisode(season, teamId, episode).reduce((sum, c) => sum + castawayEpisodeTotal(season, c, episode), 0);
}

// ---------- standings ----------

/** Shared competition ranking (1, 2, 2, 4) — equal totals share a rank. */
export function competitionRanks(totals: number[]): number[] {
  return totals.map((t) => 1 + totals.filter((o) => o > t).length);
}

/** Highest episode number N such that episodes 1..N are all published. Public views never look past it. */
export function latestPublished(season: Season): number {
  let n = 0;
  while (n < season.episodes.length && season.episodes[n].state === "PUBLISHED") n++;
  return n;
}

export function standings(season: Season, throughEpisode: number = latestPublished(season)): StandingRow[] {
  const build = (through: number) => {
    const rows = season.teams.map((t) => {
      const episodeScores = season.episodes
        .filter((e) => e.number <= through)
        .map((e) => teamEpisodeScore(season, t.id, e.number));
      return { teamId: t.id, episodeScores, total: episodeScores.reduce((a, b) => a + b, 0) };
    });
    const ranks = competitionRanks(rows.map((r) => r.total));
    return rows.map((r, i) => ({ ...r, rank: ranks[i] }));
  };
  const now = build(throughEpisode);
  const before = throughEpisode > 1 ? new Map(build(throughEpisode - 1).map((r) => [r.teamId, r.rank])) : null;
  return now
    .map<StandingRow>((r) => ({
      ...r,
      tied: now.filter((o) => o.rank === r.rank).length > 1,
      latest: r.episodeScores.at(-1) ?? 0,
      movement: before ? before.get(r.teamId)! - r.rank : null,
    }))
    .sort((a, b) => a.rank - b.rank); // stable: tied teams keep the league's member order
}

/** Optional wager module: shown beside, never inside, the base total (guide §6.3). */
export function standingsAfterWager(season: Season) {
  const base = standings(season);
  const adj = base.map((r) => ({
    teamId: r.teamId,
    baseTotal: r.total,
    wager: season.wagers.find((w) => w.team === r.teamId),
  }));
  const totals = adj.map((a) => a.baseTotal + (a.wager?.points ?? 0));
  const ranks = competitionRanks(totals);
  return adj
    .map((a, i) => ({ ...a, total: totals[i], rank: ranks[i] }))
    .sort((a, b) => a.rank - b.rank || b.total - a.total);
}

// ---------- tribe swaps ----------

/** The tribe id a castaway was on immediately before `episode` (the latest swap strictly earlier, else their start). */
export function tribeBeforeEpisode(season: Season, castawayId: string, episode: number): string {
  const swaps = season.tribeSwaps.filter((s) => s.castaway === castawayId && s.episode < episode);
  const latest = swaps.sort((a, b) => b.episode - a.episode)[0];
  return latest?.tribeId ?? season.castaways.find((c) => c.id === castawayId)!.initialTribeId;
}

/** The tribe id effective for a castaway at `episode` (includes a swap recorded exactly at that episode). */
export function currentTribeId(season: Season, castawayId: string, episode: number): string {
  const swaps = season.tribeSwaps.filter((s) => s.castaway === castawayId && s.episode <= episode);
  const latest = swaps.sort((a, b) => b.episode - a.episode)[0];
  return latest?.tribeId ?? season.castaways.find((c) => c.id === castawayId)!.initialTribeId;
}

// ---------- castaway status (guide §5.5) ----------

export function statusEventFor(season: Season, castawayId: string): StatusEvent | undefined {
  return season.statusEvents.find((e) => e.castaway === castawayId);
}

/** Whether a castaway can be selected for `episode`: derived from ordered status events, never a flag. */
export function isActiveAt(season: Season, castawayId: string, episode: number): boolean {
  const exit = statusEventFor(season, castawayId);
  return !exit || exit.afterEpisode >= episode;
}

// ---------- ownership + availability ----------

export function ownerCount(season: Season, castawayId: string, episode: number): number {
  return season.teams.filter((t) => effectiveRoster(season, t.id, episode).includes(castawayId)).length;
}

export function ownersOf(season: Season, castawayId: string, episode: number): string[] {
  return season.teams.filter((t) => rosterForEpisode(season, t.id, episode).includes(castawayId)).map((t) => t.id);
}

/** League-wide availability for a window that takes effect at `episode`. */
export function availability(season: Season, episode: number): Availability[] {
  const cap = season.config.ownershipCap;
  return season.castaways.map((castaway) => {
    const active = isActiveAt(season, castaway.id, episode);
    const owners = ownerCount(season, castaway.id, episode);
    const capacityLeft = Math.max(cap - owners, 0);
    const blockedReason = !active ? "Eliminated" : capacityLeft === 0 ? "Ownership cap reached" : undefined;
    return { castaway, active, owners, capacityLeft, blockedReason };
  });
}

// ---------- pick window queue (guide §5.2) ----------

/**
 * Snapshot of the reverse-standings queue for the window opened after `afterEpisode`: lowest official total first,
 * ties resolved by the configured rule (never alphabetical). Tied teams keep their shared standings rank.
 */
export function buildPickQueue(season: Season, afterEpisode: number): QueueEntry[] {
  const rows = standings(season, afterEpisode);
  const seed = season.config.openingSeed;
  const seedPos = (teamId: string) => {
    const i = seed.indexOf(teamId);
    if (i < 0) throw new Error(`team ${teamId} is missing from the opening seed`);
    return i;
  };
  const effectiveAt = afterEpisode + 1;
  const ordered = [...rows].sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    // OPENING_SEED_REVERSE: the later opening seed acts first, mirroring the catch-up principle.
    return seedPos(b.teamId) - seedPos(a.teamId);
  });
  return ordered.map((row, i) => {
    const roster = effectiveRoster(season, row.teamId, afterEpisode);
    const openSlots = roster.filter((c) => !isActiveAt(season, c, effectiveAt)).length;
    const credits = season.config.swapCreditLimit;
    const used = season.transactions.filter((t) => t.team === row.teamId && !t.free && t.windowAfterEpisode < afterEpisode).length;
    const noCredit = credits !== null && used >= credits;
    // A free replacement (e.g. after a medical evacuation) needs no swap credit.
    const freeOpen = roster.filter((c) => {
      const exit = c && !isActiveAt(season, c, effectiveAt) ? statusEventFor(season, c) : undefined;
      return !!exit && (season.config.freeReplacementStatuses ?? []).includes(exit.type);
    }).length;
    const eligible = openSlots > 0 && (freeOpen > 0 || !noCredit);
    return {
      sequence: i + 1,
      teamId: row.teamId,
      pointsAtOpen: row.total,
      rankAtOpen: row.rank,
      eligible,
      openSlots,
      skipReason: eligible ? undefined : openSlots === 0 ? "No eligible pick — no replaceable slot" : "No eligible pick — no swap credits left",
    };
  });
}

/** Windows that produced at least one recorded pick, ascending. */
export function pickWindows(season: Season): number[] {
  return [...new Set(season.transactions.map((t) => t.windowAfterEpisode))].sort((a, b) => a - b);
}
