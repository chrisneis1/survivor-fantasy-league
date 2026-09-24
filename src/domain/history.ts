// League history across seasons: champions and every member's career, worked out from the seasons themselves so it
// updates on its own whenever a season is archived. Members are matched across seasons by name.
import { latestPublished, standings, standingsAfterWager } from "./engine";
import type { Season } from "./types";

/** The season number in a name or id like "Survivor 47" / "survivor-47"; null when there isn't one. */
export function seasonNumber(s: Pick<Season, "id" | "name">): number | null {
  const m = s.name.match(/(\d+)\s*$/) ?? s.id.match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Seasons in league order: numbered seasons by number, then any others in the order given. */
export function bySeasonNumber<T extends Pick<Season, "id" | "name">>(seasons: T[]): T[] {
  return seasons
    .map((s, i) => ({ s, i, n: seasonNumber(s) }))
    .sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.i - b.i)
    .map((x) => x.s);
}

export const memberKey = (name: string) =>
  name.trim().normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface FinalRow {
  teamId: string;
  total: number;
  rank: number;
}

/**
 * How a season finished: after any final wager or bonus when the season has one (that's what the league ranked),
 * otherwise the base standings. Ties share a rank.
 */
export function finalStandings(season: Season): FinalRow[] {
  if (season.wagers.some((w) => w.points !== 0)) return standingsAfterWager(season).map((r) => ({ teamId: r.teamId, total: r.total, rank: r.rank }));
  return standings(season).map((r) => ({ teamId: r.teamId, total: r.total, rank: r.rank }));
}

export interface Finish {
  seasonId: string;
  seasonName: string;
  teamId: string;
  teamName: string;
  member: string;
  rank: number;
  tied: boolean;
  /** Teams in the season. */
  of: number;
  total: number;
  /** False while the season is still being played. */
  final: boolean;
}

export interface MemberCareer {
  key: string;
  /** The member's name as most recently spelled. */
  name: string;
  /** Completed seasons, oldest first. */
  finishes: Finish[];
  /** Where they stand in a season still being played, if they're in one. */
  current: Finish[];
  titles: number;
  podiums: number;
  lastPlaces: number;
  /** Mean finishing position over completed seasons; null before any. */
  averageFinish: number | null;
  bestFinish: number | null;
}

export interface Champion {
  season: Season;
  /** More than one when a season ended in a tie for first. */
  winners: Finish[];
}

export interface LeagueHistory {
  champions: Champion[];
  members: MemberCareer[];
  completedSeasons: number;
}

function finishesOf(season: Season, final: boolean): Finish[] {
  const rows = final ? finalStandings(season) : standings(season).map((r) => ({ teamId: r.teamId, total: r.total, rank: r.rank }));
  return rows.map((r) => {
    const team = season.teams.find((t) => t.id === r.teamId)!;
    return {
      seasonId: season.id,
      seasonName: season.name,
      teamId: team.id,
      teamName: team.name,
      member: team.member.trim(),
      rank: r.rank,
      tied: rows.filter((o) => o.rank === r.rank).length > 1,
      of: season.teams.length,
      total: r.total,
      final,
    };
  });
}

export function leagueHistory(seasons: Season[]): LeagueHistory {
  const ordered = bySeasonNumber(seasons);
  const completed = ordered.filter((s) => s.status === "ARCHIVED" && latestPublished(s) > 0);
  const live = ordered.filter((s) => s.status !== "ARCHIVED" && latestPublished(s) > 0);

  const members = new Map<string, MemberCareer>();
  const career = (name: string) => {
    const key = memberKey(name);
    let c = members.get(key);
    if (!c) members.set(key, (c = { key, name, finishes: [], current: [], titles: 0, podiums: 0, lastPlaces: 0, averageFinish: null, bestFinish: null }));
    c.name = name;
    return c;
  };

  const champions: Champion[] = [];
  for (const s of completed) {
    const rows = finishesOf(s, true);
    const last = Math.max(...rows.map((r) => r.rank));
    champions.push({ season: s, winners: rows.filter((r) => r.rank === 1) });
    for (const f of rows) {
      const c = career(f.member);
      c.finishes.push(f);
      if (f.rank === 1) c.titles++;
      if (f.rank <= 3) c.podiums++;
      if (f.rank === last && rows.length > 1) c.lastPlaces++;
    }
  }
  for (const s of live) for (const f of finishesOf(s, false)) career(f.member).current.push(f);

  for (const c of members.values()) {
    if (c.finishes.length) {
      c.averageFinish = c.finishes.reduce((sum, f) => sum + f.rank, 0) / c.finishes.length;
      c.bestFinish = Math.min(...c.finishes.map((f) => f.rank));
    }
  }
  const list = [...members.values()].sort(
    (a, b) =>
      b.titles - a.titles ||
      b.podiums - a.podiums ||
      (a.averageFinish ?? Infinity) - (b.averageFinish ?? Infinity) ||
      b.finishes.length - a.finishes.length ||
      a.name.localeCompare(b.name),
  );
  return { champions: champions.reverse(), members: list, completedSeasons: completed.length };
}
