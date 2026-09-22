import Link from "next/link";
import { PointsRace } from "@/components/points-race";
import { SeasonShell } from "@/components/shell";
import { Card, Chips, EmptyNote, Movement, PageTitle, Pill, PolicyPill, RankMark, SectionTitle, Signed, Sparkbars } from "@/components/ui";
import { latestPublished, pickWindows, standings, standingsAfterWager } from "@/domain/engine";
import type { Season } from "@/domain/types";
import { episodeLabel, plural, seasonPath } from "@/lib/format";

export interface LeaderboardQuery {
  ep?: string;
  view?: string;
}

interface Row {
  teamId: string;
  rank: number;
  tied: boolean;
  total: number;
  latest: number;
  movement: number | null;
  episodeScores: number[];
  wagerNote?: string;
  baseTotal?: number;
}

export function LeaderboardView({ season, query }: { season: Season; query: LeaderboardQuery }) {
  const last = latestPublished(season);
  if (last === 0) {
    return (
      <SeasonShell season={season} active="">
        <PageTitle eyebrow={season.name} title="Leaderboard" />
        <EmptyNote>
          {season.status === "SETUP" ? "This season is being set up." : season.status === "OPENING_SELECTION" ? "The draft is under way. Follow it on the This Week tab." : "No episode has been scored yet."} Standings appear here once the commissioner publishes the first episode.
        </EmptyNote>
      </SeasonShell>
    );
  }
  const ep = Math.min(Math.max(Number(query.ep) || last, 1), last);
  const episode = season.episodes[ep - 1];
  const isFinal = ep === last && season.status === "ARCHIVED";
  const hasWager = season.wagers.some((w) => w.points !== 0);
  const wagerView = query.view === "wager" && ep === last && hasWager;

  const base = standings(season, ep);
  const teamName = (id: string) => season.teams.find((t) => t.id === id)!;
  const rows: Row[] = wagerView
    ? standingsAfterWager(season).map((r) => {
        const b = base.find((x) => x.teamId === r.teamId)!;
        const w = r.wager;
        const cast = w?.castaway ? season.castaways.find((c) => c.id === w.castaway)?.name : null;
        return {
          teamId: r.teamId,
          rank: r.rank,
          tied: false,
          total: r.total,
          latest: b.latest,
          movement: null,
          episodeScores: b.episodeScores,
          baseTotal: r.baseTotal,
          wagerNote: !w || !cast ? "No wager" : `${cast} ${w.points > 0 ? "+" : "−"}${Math.abs(w.points)}`,
        };
      })
    : base;
  const tiedRanks = new Set(rows.filter((r, _, all) => all.filter((o) => o.rank === r.rank).length > 1).map((r) => r.rank));

  const leader = rows[0];
  const second = rows.find((r) => r.rank > leader.rank);
  const swaps = (id: string) => season.transactions.filter((t) => t.team === id && t.effectiveEpisode <= ep).length;

  const top3 = base.slice(0, 3).map((r, i) => r.teamId);
  const race = season.teams.map((t) => {
    const s = base.find((r) => r.teamId === t.id)!;
    let run = 0;
    const idx = top3.indexOf(t.id);
    return {
      id: t.id,
      name: t.member,
      values: s.episodeScores.map((v) => (run += v)),
      slot: (idx >= 0 ? idx + 1 : 0) as 0 | 1 | 2 | 3,
    };
  });
  const labels = season.episodes.filter((e) => e.number <= ep).map((e) => (e.phase === "finale" ? "F" : String(e.number)));
  const windows = pickWindows(season);
  const lastWindow = windows.at(-1);

  return (
    <SeasonShell season={season} active="">
      <PageTitle
        eyebrow={`${season.name} · ${isFinal ? "Final standings" : `After ${episodeLabel(season, ep)}`}`}
        title={wagerView ? "Final standings after wagers" : isFinal ? "Leaderboard" : `Standings after ${episodeLabel(season, ep)}`}
      >
        {isFinal
          ? `${leader.tied || tiedRanks.has(leader.rank) ? "Co-leaders" : teamName(leader.teamId).name} took the season${second ? ` by ${leader.total - second.total} points` : ""}.`
          : "Official published scoring only. Ties share a rank."}
      </PageTitle>

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">As of</span>
          <Chips
            label="Standings as of episode"
            active={ep}
            href={(v) => (v === last ? seasonPath(season.id) : `${seasonPath(season.id)}?ep=${v}`)}
            items={season.episodes.filter((e) => e.number <= last).map((e) => ({ value: e.number, label: e.phase === "finale" ? "Finale" : String(e.number) }))}
          />
        </div>
        {ep === last && hasWager ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">Total</span>
            <Chips
              label="Wager view"
              active={wagerView ? "wager" : "base"}
              href={(v) => (v === "wager" ? `${seasonPath(season.id)}?view=wager` : seasonPath(season.id))}
              items={[{ value: "base", label: "Base points" }, { value: "wager", label: "After wager" }]}
            />
          </div>
        ) : null}
      </div>

      {lastWindow ? (
        <Link
          href={seasonPath(season.id, "/this-week")}
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/15"
        >
          <span>
            {season.status === "ARCHIVED" ? "Replay the last pick window" : "This Week: pick order, activity and who's available"}
            <span className="ml-2 font-normal text-muted">{plural(windows.length, "window")} this season</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      ) : null}

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[3rem_1fr_auto_4.5rem_5rem_4rem] items-center gap-x-3 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted md:grid">
          <span>Rank</span>
          <span>Team</span>
          <span>By episode</span>
          <span className="text-right">{episodeLabel(season, ep)}</span>
          <span className="text-right">{wagerView ? "Base + wager" : "Total"}</span>
          <span className="text-right">Swaps</span>
        </div>
        <ol>
          {rows.map((r) => {
            const t = teamName(r.teamId);
            return (
              <li key={r.teamId} className="border-b border-line last:border-b-0">
                <Link
                  href={seasonPath(season.id, `/teams/${t.id}`)}
                  className={`grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[3rem_1fr_auto_4.5rem_5rem_4rem] ${
                    r.rank === 1 ? "bg-accent/[0.06]" : ""
                  }`}
                >
                  <span className="flex flex-col items-center leading-none">
                    <RankMark rank={r.rank} tied={tiedRanks.has(r.rank)} />
                    <Movement value={r.movement} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {t.member}
                      <span className="md:hidden"> · {episodeLabel(season, ep)} <Signed n={r.latest} /></span>
                      {r.wagerNote ? <span> · {r.wagerNote}</span> : null}
                    </span>
                  </span>
                  <span className="hidden md:block"><Sparkbars values={r.episodeScores} highlight={ep} /></span>
                  <span className="hidden text-right md:block"><Signed n={r.latest} className="font-semibold" /></span>
                  <span className="text-right">
                    <span className="display num block text-2xl font-extrabold leading-none">{r.total}</span>
                    {r.baseTotal !== undefined ? <span className="num block text-xs text-muted">{r.baseTotal} base</span> : null}
                  </span>
                  <span className="num hidden text-right text-sm text-muted md:block">{swaps(r.teamId)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <PolicyPill episode={episode} />
        {tiedRanks.size ? <Pill>T = tied rank</Pill> : null}
        {season.config.swapCreditLimit === null ? <span>Swaps counts roster replacements made through this episode.</span> : null}
      </div>

      <div className="mt-10">
        <SectionTitle aside="Hover or tap the chart for exact totals">Points race</SectionTitle>
        <Card className="p-3 sm:p-5">
          <PointsRace series={race} labels={labels} />
        </Card>
      </div>
    </SeasonShell>
  );
}
