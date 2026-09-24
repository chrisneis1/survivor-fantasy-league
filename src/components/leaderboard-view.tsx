import Link from "next/link";
import { PointsRace } from "@/components/points-race";
import { SeasonShell } from "@/components/shell";
import { IconArrowRight, IconFlame, IconStandings, IconTrendUp, IconTrophy, IconWeek } from "@/components/icons";
import { Card, EmptyState, FilterChips, Movement, PageHeader, PolicyPill, RankBadge, ScoreChange, SectionHeader, Sparkbars, StatCard, StatusBadge, YouBadge } from "@/components/ui";
import { latestPublished, pickWindows, standings, standingsAfterWager } from "@/domain/engine";
import type { Season } from "@/domain/types";
import { episodeLabel, plural, seasonPath } from "@/lib/format";
import { getMember } from "@/server/auth";

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

export async function LeaderboardView({ season, query }: { season: Season; query: LeaderboardQuery }) {
  const last = latestPublished(season);
  const me = await getMember(season.id);
  if (last === 0) {
    return (
      <SeasonShell season={season} active="">
        <PageHeader eyebrow={season.name} title="Leaderboard" />
        <EmptyState
          icon={<IconStandings size={22} />}
          title={season.status === "SETUP" ? "The island is being prepared" : season.status === "OPENING_SELECTION" ? "The draft is under way" : "No scores yet"}
          action={
            season.status === "OPENING_SELECTION" ? (
              <Link href={seasonPath(season.id, "/this-week")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                Follow the draft <IconArrowRight size={16} />
              </Link>
            ) : null
          }
        >
          {season.status === "SETUP" ? "This season is being set up. " : season.status === "OPENING_SELECTION" ? "Teams are drafting their opening rosters. " : "No episode has been scored yet. "}
          Standings will appear here after the commissioner publishes Episode 1.
        </EmptyState>
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
          // Archived sheets sometimes record a bonus or a typed-in total without saying who was picked (see the notes).
          wagerNote: !w || !w.points ? "No wager" : `${cast ?? "Final adjustment"} ${w.points > 0 ? "+" : "−"}${Math.abs(w.points)}`,
        };
      })
    : base;
  const tiedRanks = new Set(rows.filter((r, _, all) => all.filter((o) => o.rank === r.rank).length > 1).map((r) => r.rank));

  const leader = rows[0];
  const second = rows.find((r) => r.rank > leader.rank);
  const swaps = (id: string) => season.transactions.filter((t) => t.team === id && t.effectiveEpisode <= ep).length;
  const coLeaders = tiedRanks.has(leader.rank);
  const high = [...base].sort((a, b) => b.latest - a.latest)[0];
  const climber = [...base].filter((r) => (r.movement ?? 0) > 0).sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0))[0];

  const top3 = base.slice(0, 3).map((r) => r.teamId);
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
  const epLabel = episodeLabel(season, ep);

  return (
    <SeasonShell season={season} active="">
      <PageHeader
        eyebrow={<>{season.name} <span className="text-muted">·</span> {isFinal ? "Final standings" : `After ${epLabel}`}</>}
        title={wagerView ? "Final standings after wagers" : isFinal ? "Leaderboard" : `Standings after ${epLabel}`}
      >
        {isFinal
          ? `${coLeaders ? "Co-leaders" : teamName(leader.teamId).name} took the season${second ? ` by ${leader.total - second.total} points` : ""}.`
          : "Official published scoring only. Ties share a rank."}
      </PageHeader>

      {/* Controls: which episode, and base vs. after-wager totals. */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="eyebrow hidden shrink-0 text-muted sm:inline">As of</span>
          <div className="min-w-0 flex-1">
            <FilterChips
              label="Standings as of episode"
              active={ep}
              href={(v) => (v === last ? seasonPath(season.id) : `${seasonPath(season.id)}?ep=${v}`)}
              items={season.episodes.filter((e) => e.number <= last).map((e) => ({ value: e.number, label: e.phase === "finale" ? "Finale" : String(e.number) }))}
            />
          </div>
        </div>
        {ep === last && hasWager ? (
          <FilterChips
            variant="segmented"
            label="Total shown"
            active={wagerView ? "wager" : "base"}
            href={(v) => (v === "wager" ? `${seasonPath(season.id)}?view=wager` : seasonPath(season.id))}
            items={[{ value: "base", label: "Base points" }, { value: "wager", label: "After wager" }]}
          />
        ) : null}
      </div>

      {/* At-a-glance summary of the standings below. */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          tone="sand"
          className="col-span-2 lg:col-span-1"
          icon={<IconTrophy size={14} />}
          label={coLeaders ? "Co-leaders" : isFinal ? "Champion" : "Leader"}
          value={<span className="font-sans text-lg font-bold normal-case sm:text-xl">{teamName(leader.teamId).name}</span>}
          sub={`${teamName(leader.teamId).member} · ${leader.total} pts`}
        />
        <StatCard label="Lead" value={second ? `+${leader.total - second.total}` : "—"} sub={second ? `over ${teamName(second.teamId).name}` : "No one else ranked"} />
        <StatCard
          icon={<IconFlame size={14} className="text-ember" />}
          label={`${epLabel} high`}
          value={<ScoreChange n={high.latest} />}
          sub={`${teamName(high.teamId).name} · ${teamName(high.teamId).member}`}
        />
        <StatCard
          className="col-span-2 lg:col-span-1"
          icon={<IconTrendUp size={14} className="text-good" />}
          label="Biggest climb"
          value={climber ? <span className="text-good">▲{climber.movement}</span> : "—"}
          sub={climber ? `${teamName(climber.teamId).name} · now #${climber.rank}` : ep === 1 ? "Movement starts after Ep 2" : "No team moved up"}
        />
      </div>

      {lastWindow ? (
        <Link
          href={seasonPath(season.id, "/this-week")}
          className="group mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-4 py-3 transition-colors hover:border-accent/70"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><IconWeek size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{season.status === "ARCHIVED" ? "Replay the last pick window" : "This Week: pick order, activity and who's available"}</span>
            <span className="block text-xs text-muted">{plural(windows.length, "pick window")} this season</span>
          </span>
          <IconArrowRight size={18} className="text-accent transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[3.5rem_minmax(0,1fr)_4.75rem_5.5rem] items-center gap-x-4 border-b border-line bg-surface-2/60 px-4 py-2.5 text-muted md:grid lg:grid-cols-[3.5rem_minmax(0,1fr)_auto_4.75rem_5.5rem_3.5rem]">
          <span className="eyebrow">Rank</span>
          <span className="eyebrow">Team</span>
          <span className="eyebrow hidden lg:block">By episode</span>
          <span className="eyebrow text-right">{epLabel}</span>
          <span className="eyebrow text-right">{wagerView ? "Base + wager" : "Total"}</span>
          <span className="eyebrow hidden text-right lg:block">Swaps</span>
        </div>
        <ol>
          {rows.map((r) => {
            const t = teamName(r.teamId);
            const mine = r.teamId === me;
            return (
              <li key={r.teamId} className="border-b border-line last:border-b-0">
                <Link
                  href={seasonPath(season.id, `/teams/${t.id}`)}
                  aria-label={`${t.name}, ${t.member}. ${tiedRanks.has(r.rank) ? "Tied for" : "Rank"} ${r.rank}, ${r.total} points${mine ? ". Your team" : ""}`}
                  className={`relative grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-3 transition-colors hover:bg-surface-2 sm:px-4 md:grid-cols-[3.5rem_minmax(0,1fr)_4.75rem_5.5rem] md:gap-x-4 lg:grid-cols-[3.5rem_minmax(0,1fr)_auto_4.75rem_5.5rem_3.5rem] ${
                    mine ? "bg-accent/[0.07] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-accent" : r.rank === 1 ? "bg-gold/[0.04]" : ""
                  }`}
                >
                  <span className="flex flex-col items-center gap-1">
                    <RankBadge rank={r.rank} tied={tiedRanks.has(r.rank)} size={r.rank <= 3 ? "md" : "sm"} />
                    <Movement value={r.movement} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink sm:text-base">{t.name}</span>
                      {mine ? <YouBadge /> : null}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {t.member}
                      {r.wagerNote ? <span> · {r.wagerNote}</span> : null}
                    </span>
                  </span>
                  <span className="hidden lg:block"><Sparkbars values={r.episodeScores} highlight={ep} /></span>
                  <span className="hidden text-right md:block"><ScoreChange n={r.latest} className="font-semibold" /></span>
                  <span className="text-right">
                    <span className="display num block text-[1.65rem] font-extrabold leading-none text-ink">{r.total}</span>
                    {r.baseTotal !== undefined ? <span className="num block text-xs text-muted">{r.baseTotal} base</span> : null}
                    <span className="mt-0.5 block text-xs md:hidden"><ScoreChange n={r.latest} className="font-semibold" /> <span className="text-muted">{epLabel}</span></span>
                  </span>
                  <span className="num hidden text-right text-sm text-muted lg:block">{swaps(r.teamId)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <PolicyPill episode={episode} />
        {tiedRanks.size ? <StatusBadge>T = tied rank</StatusBadge> : null}
        {me ? <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-1 rounded-full bg-accent" /> Your team</span> : null}
        {season.config.swapCreditLimit === null ? <span className="hidden lg:inline">Swaps counts roster replacements made through this episode.</span> : null}
      </div>

      <section className="mt-10" aria-labelledby="race-title">
        <SectionHeader id="race-title" aside={<span className="hidden sm:inline">Hover or tap for exact totals</span>}>Points race</SectionHeader>
        <Card className="p-3 sm:p-5">
          <PointsRace series={race} labels={labels} />
        </Card>
      </section>

      {season.archive ? <ArchiveNotes season={season} /> : null}
    </SeasonShell>
  );
}

/** Where an archived season's record came from, and what its spreadsheet couldn't keep. */
export function ArchiveNotes({ season }: { season: Season }) {
  if (!season.archive?.notes.length) return null;
  return (
    <section className="mt-10" aria-labelledby="archive-notes-title">
      <SectionHeader id="archive-notes-title">About this season&apos;s record</SectionHeader>
      <Card className="p-4 sm:p-5">
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-ink-2 marker:text-muted">
          {season.archive.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </Card>
    </section>
  );
}
