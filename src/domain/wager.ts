// Final wager (guide §6.3, §7.3). Each member secretly backs one castaway to win, staking up to the season's maximum;
// a correct pick gains the stake, a wrong pick loses it (1:1 unless the season says otherwise).
// Picks are NOT part of the season document: they live in their own table and are read only by the owning member and by
// finalize, so nothing on the public site or in the commissioner's screens can show them before the season ends.
import { competitionRanks, isActiveAt, latestPublished, standings } from "./engine";
import type { AuditEvent, Castaway, Season, Wager } from "./types";

export interface WagerEntry {
  team: string;
  castaway: string;
  stake: number;
}

type Result = { season: Season; audit: AuditEvent[] };
const ev = (s: Season, actor: string, action: string): AuditEvent => ({ seasonId: s.id, actor, entityType: "wager", entityId: s.id, action });

/** The episode whose publication closes wagering. */
export const wagerDeadlineEpisode = (season: Season) => season.config.wager.lockAtEpisode ?? 2;

/** True once the deadline episode is published: wagers can no longer be opened or changed. */
export const wagerDeadlinePassed = (season: Season) => latestPublished(season) >= wagerDeadlineEpisode(season);

/** Castaways a member may still back: those in the game for the next episode to be scored. */
export function wagerCandidates(season: Season): Castaway[] {
  const next = latestPublished(season) + 1;
  return season.castaways.filter((c) => isActiveAt(season, c.id, next));
}

/** Why this wager cannot be placed right now, or null if it can. The server runs this at commit time. */
export function wagerProblem(season: Season, castawayId: string, stake: number): string | null {
  const w = season.config.wager;
  if (season.wagerState !== "OPEN") return "Wagering isn't open.";
  if (wagerDeadlinePassed(season)) return `Wagering closed when Episode ${wagerDeadlineEpisode(season)} was scored.`;
  if (!Number.isInteger(stake) || stake < w.minStake || stake > w.maxStake) return `Stake a whole number of points from ${w.minStake} to ${w.maxStake}.`;
  if (!wagerCandidates(season).some((c) => c.id === castawayId)) return "That castaway isn't in the game any more.";
  return null;
}

export function openWagers(season: Season, actor: string): Result {
  if (season.status !== "ACTIVE") throw new Error("Wagering can open once the season is active.");
  if (season.wagerState === "OPEN") throw new Error("Wagering is already open.");
  if (wagerDeadlinePassed(season)) throw new Error(`Wagering closed when Episode ${wagerDeadlineEpisode(season)} was scored, so it can't be opened now.`);
  const next = structuredClone(season);
  next.wagerState = "OPEN";
  return { season: next, audit: [ev(season, actor, season.wagerState === "LOCKED" ? "REOPEN" : "OPEN")] };
}

export function lockWagers(season: Season, actor: string): Result {
  if (season.wagerState !== "OPEN") throw new Error("Wagering isn't open.");
  const next = structuredClone(season);
  next.wagerState = "LOCKED";
  return { season: next, audit: [ev(season, actor, "LOCK")] };
}

/** The castaway who won the season: the one the winner rule was scored for. Null if nobody, or if it is ambiguous. */
export function findWinner(season: Season): string | null {
  const rule = season.config.wager.winnerRule;
  const totals = new Map<string, number>();
  for (const s of season.scores) for (const e of s.entries) if (e.rule === rule) totals.set(s.castaway, (totals.get(s.castaway) ?? 0) + e.points);
  const best = [...totals.entries()].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  if (best.length === 0 || (best.length > 1 && best[0][1] === best[1][1])) return null;
  return best[0][0];
}

/** Turns every team's pick into its wager result and the after-wager total and shared rank. */
export function resolveWagers(season: Season, entries: WagerEntry[], winner: string | null): Wager[] {
  const w = season.config.wager;
  const base = new Map(standings(season).map((r) => [r.teamId, r.total]));
  const rows = season.teams.map((t) => {
    const entry = entries.find((e) => e.team === t.id);
    const points = !entry ? 0 : entry.castaway === winner ? entry.stake * w.correctMultiplier : -entry.stake * w.wrongMultiplier;
    return { t, entry, points, total: (base.get(t.id) ?? 0) + points };
  });
  const ranks = competitionRanks(rows.map((r) => r.total));
  return rows.map((r, i) => ({
    team: r.t.id,
    castaway: r.entry?.castaway ?? null,
    points: r.points,
    pointsAfterWager: r.total,
    rankAfterWager: ranks[i],
    ...(r.entry ? { stake: r.entry.stake } : {}),
  }));
}
