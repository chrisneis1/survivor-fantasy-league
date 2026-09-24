import Link from "next/link";
import { notFound } from "next/navigation";
import { EpisodeBars } from "@/components/episode-bars";
import { IconChevronDown, IconChevronLeft, IconSwap } from "@/components/icons";
import { RosterSlot, SwapLine } from "@/components/league";
import { SeasonShell } from "@/components/shell";
import { Card, EmptyState, Monogram, PageHeader, PolicyPill, RankBadge, ScoreChange, SectionHeader, StatCard, StatusBadge, YouBadge } from "@/components/ui";
import { getSeason } from "@/data";
import { castawayEpisodeTotal, currentTribeId, effectiveRoster, isActiveAt, latestPublished, rosterForEpisode, standings, statusEventFor } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { castawayName, exitLabel } from "@/lib/view";
import { getMember } from "@/server/auth";

export default async function TeamPage({ params }: { params: Promise<{ season: string; team: string }> }) {
  const p = await params;
  const season = await getSeason(p.season);
  const team = season?.teams.find((t) => t.id === p.team);
  if (!season || !team) notFound();
  const me = await getMember(season.id);

  const last = season.episodes.length;
  const published = latestPublished(season);
  const row = standings(season).find((r) => r.teamId === team.id)!;
  const wager = season.wagers.find((w) => w.team === team.id);
  const txs = season.transactions
    .filter((t) => t.team === team.id)
    .sort((a, b) => a.windowAfterEpisode - b.windowAfterEpisode || (a.order ?? 0) - (b.order ?? 0));

  // Points come from the roster that actually scored each episode, per that episode's roster policy.
  const perEpisode = season.episodes.filter((e) => e.state === "PUBLISHED").map((e) => ({
    e,
    roster: rosterForEpisode(season, team.id, e.number).map((c) => ({ id: c, pts: castawayEpisodeTotal(season, c, e.number) })),
  }));
  const current = effectiveRoster(season, team.id, last);
  const slotPoints = (slot: number) => perEpisode.reduce((sum, pe) => sum + (pe.roster[slot]?.pts ?? 0), 0);
  const draftEpisodes = season.episodes.filter((e) => e.rosterPolicy === "ORIGINAL_DRAFT");
  const tribeEp = Math.max(published, 1);

  const scores = row.episodeScores;
  const best = scores.length ? Math.max(...scores) : null;
  const bestEp = best === null ? null : scores.indexOf(best) + 1;
  const running = scores.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []);

  return (
    <SeasonShell season={season} active="/teams">
      <Link href={seasonPath(season.id, "/teams")} className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <IconChevronLeft size={16} /> All teams
      </Link>

      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Monogram name={team.name} size="lg" className="hidden sm:inline-flex" />
          <div className="min-w-0">
            <PageHeader eyebrow={<>{team.member}&apos;s team {team.id === me ? <YouBadge /> : null}</>} title={team.name} />
          </div>
        </div>
      </div>

      <div className="-mt-4 mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard tone={row.rank === 1 && published ? "sand" : "default"} label="Rank" value={published ? <span className="flex items-center gap-2"><RankBadge rank={row.rank} tied={row.tied} size="sm" onSand={row.rank === 1} />{row.tied ? "Tied" : ""}</span> : "—"} sub={`of ${season.teams.length} teams`} />
        <StatCard label="Points" value={published ? row.total : "—"} sub={published ? `through ${episodeLabel(season, published)}` : "No episodes scored"} />
        <StatCard label="Swaps" value={txs.length} sub={season.config.swapCreditLimit === null ? "roster replacements" : `of ${season.config.swapCreditLimit} credits`} />
        <StatCard label="Best episode" value={best === null ? "—" : <ScoreChange n={best} />} sub={bestEp ? episodeLabel(season, bestEp) : "—"} />
      </div>

      <section aria-labelledby="roster-title">
        <SectionHeader id="roster-title" aside={draftEpisodes.length ? `Original draft scored from ${episodeLabel(season, draftEpisodes[0].number)}` : undefined}>Roster</SectionHeader>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
          {season.slots.map((slot, i) => {
            const cid = current[i];
            const c = season.castaways.find((x) => x.id === cid);
            if (!c) return <li key={slot.id}><RosterSlot slotName={slot.name} /></li>;
            const exit = statusEventFor(season, cid);
            const tribe = season.tribes.find((t) => t.id === currentTribeId(season, cid, tribeEp));
            return (
              <li key={slot.id}>
                <RosterSlot
                  slotName={slot.name}
                  name={c.name}
                  href={seasonPath(season.id, `/castaways/${cid}`)}
                  tribe={tribe}
                  out={exit && !isActiveAt(season, cid, last + 1) ? `${exitLabel(exit)} after ${episodeLabel(season, exit.afterEpisode)}` : undefined}
                  points={slotPoints(i)}
                  pointsLabel="from this slot"
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="episodes-title">
        <SectionHeader id="episodes-title" aside="Tap an episode for its breakdown">Episode by episode</SectionHeader>
        {perEpisode.length === 0 ? (
          <EmptyState compact>Episode scoring appears here once the first episode is published.</EmptyState>
        ) : (
          <>
            <Card className="mb-3 p-4 sm:p-5">
              <EpisodeBars items={scores.map((v, i) => ({ label: season.episodes[i]?.phase === "finale" ? "F" : String(i + 1), value: v, highlight: i + 1 === bestEp }))} />
            </Card>
            <ol className="grid gap-1.5">
              {perEpisode.map(({ e, roster }, idx) => {
                const score = roster.reduce((s, r) => s + r.pts, 0);
                const swapped = txs.filter((t) => t.effectiveEpisode === e.number);
                return (
                  <li key={e.id}>
                    <details className="group rounded-xl border border-line bg-surface transition-colors open:border-line-strong open:bg-surface-2/60" open={idx === perEpisode.length - 1}>
                      <summary className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2 sm:px-4">
                        <span className="display num w-14 shrink-0 text-lg font-bold uppercase">{episodeLabel(season, e.number)}</span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <PolicyPill episode={e} />
                          {swapped.length ? <StatusBadge><IconSwap size={12} /> {swapped.length === 1 ? "1 swap in" : `${swapped.length} swaps in`}</StatusBadge> : null}
                        </span>
                        <span className="num hidden text-xs text-muted sm:inline">total {running[e.number - 1] ?? "—"}</span>
                        <ScoreChange n={score} className="display w-12 text-right text-xl font-extrabold" />
                        <IconChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-line px-3 pb-3 pt-2 sm:px-4">
                        <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                          {roster.map((r, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 py-0.5">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="w-10 shrink-0 truncate text-[10px] font-bold uppercase tracking-wider text-muted">{season.slots[i]?.name}</span>
                                <span className="truncate text-ink-2">{r.id ? castawayName(season, r.id) : "—"}</span>
                              </span>
                              <ScoreChange n={r.pts} className="font-semibold" />
                            </li>
                          ))}
                        </ul>
                        <Link href={seasonPath(season.id, `/episodes/${e.number}`)} className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">
                          {episodeLabel(season, e.number)} recap →
                        </Link>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      <section className="mt-10" aria-labelledby="history-title">
        <SectionHeader id="history-title" aside={`${txs.length} ${txs.length === 1 ? "move" : "moves"}`}>Roster history</SectionHeader>
        <ol className="relative ml-3 border-l-2 border-line pl-6">
          <li className="relative mb-5">
            <span aria-hidden className="absolute -left-[33px] top-0.5 grid size-4 place-items-center rounded-full border-2 border-accent bg-bg" />
            <p className="eyebrow text-accent">Opening draft</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {team.draft.map((c, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
                  <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">{season.slots[i]?.name}</span>
                  {c ? castawayName(season, c) : "—"}
                </li>
              ))}
            </ul>
          </li>
          {txs.map((t) => (
            <li key={t.id} className="relative mb-5">
              <span aria-hidden className="absolute -left-[31px] top-1 size-3 rounded-full bg-line-strong ring-4 ring-bg" />
              <p className="eyebrow text-muted">After {episodeLabel(season, t.windowAfterEpisode)} · scores from {episodeLabel(season, t.effectiveEpisode)}</p>
              <div className="mt-1.5 rounded-xl border border-line bg-surface px-3 py-2">
                <SwapLine out={castawayName(season, t.out)} into={castawayName(season, t.in)} slot={`${season.slots[t.slot].name} slot`} free={t.free} />
                {t.date || t.note ? <p className="mt-0.5 text-xs text-muted">{[t.date, t.note].filter(Boolean).join(" · ")}</p> : null}
              </div>
            </li>
          ))}
          {draftEpisodes.length ? (
            <li className="relative">
              <span aria-hidden className="absolute -left-[33px] top-0.5 grid size-4 place-items-center rounded-full border-2 border-accent bg-bg" />
              <p className="eyebrow text-accent">Back to the original draft</p>
              <p className="mt-1 text-sm text-ink-2">From {episodeLabel(season, draftEpisodes[0].number)} the league scores every team&apos;s opening roster, so swaps no longer count.</p>
            </li>
          ) : txs.length === 0 ? (
            <li className="relative text-sm text-muted">
              <span aria-hidden className="absolute -left-[31px] top-1 size-3 rounded-full bg-line ring-4 ring-bg" />
              No swaps yet — still running the opening roster.
            </li>
          ) : null}
        </ol>
      </section>

      {wager?.castaway ? (
        <section className="mt-10" aria-labelledby="wager-title">
          <SectionHeader id="wager-title">Final wager</SectionHeader>
          <Card tone={wager.points > 0 ? "sand" : "default"} className="flex items-center justify-between gap-3 p-4">
            <p>
              Picked <span className="font-semibold">{castawayName(season, wager.castaway)}</span> to win.
              <span className={`block text-sm ${wager.points > 0 ? "text-sand-muted" : "text-muted"}`}>Shown beside the base total, never inside it.</span>
            </p>
            <span className={`display num text-3xl font-extrabold ${wager.points > 0 ? "text-sand-ink" : ""}`}>{wager.points > 0 ? "+" : ""}{wager.points === 0 ? 0 : wager.points < 0 ? `−${Math.abs(wager.points)}` : wager.points}</span>
          </Card>
        </section>
      ) : null}
    </SeasonShell>
  );
}
