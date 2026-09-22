import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, Pill, PolicyPill, RankMark, SectionTitle, Signed, Sparkbars } from "@/components/ui";
import { getSeason } from "@/data";
import { castawayEpisodeTotal, effectiveRoster, rosterForEpisode, standings, statusEventFor } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { castawayName, exitLabel } from "@/lib/view";

export default async function TeamPage({ params }: { params: Promise<{ season: string; team: string }> }) {
  const p = await params;
  const season = await getSeason(p.season);
  const team = season?.teams.find((t) => t.id === p.team);
  if (!season || !team) notFound();

  const last = season.episodes.length;
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

  return (
    <SeasonShell season={season} active="/teams">
      <Link href={seasonPath(season.id, "/teams")} className="text-sm text-muted hover:text-ink">← All teams</Link>
      <PageTitle eyebrow={`${team.member}'s team`} title={team.name} />

      <div className="mb-8 grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Rank</p>
          <p className="mt-1"><RankMark rank={row.rank} tied={row.tied} /></p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Total</p>
          <p className="display num mt-1 text-2xl font-extrabold">{row.total}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Swaps</p>
          <p className="display num mt-1 text-2xl font-extrabold">{txs.length}</p>
        </Card>
      </div>

      <SectionTitle aside={draftEpisodes.length ? `Original draft scored from ${episodeLabel(season, draftEpisodes[0].number)}` : undefined}>Roster</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {season.slots.map((slot, i) => {
          const cid = current[i];
          const c = season.castaways.find((x) => x.id === cid);
          if (!c) {
            return (
              <Card key={slot.id} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{slot.name} slot</p>
                <p className="text-muted">Not picked yet</p>
              </Card>
            );
          }
          const exit = statusEventFor(season, cid);
          const tribe = season.tribes.find((t) => t.id === c.initialTribeId)!;
          return (
            <Card key={slot.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{slot.name} slot</p>
                <Link href={seasonPath(season.id, `/castaways/${cid}`)} className="display block truncate text-lg font-bold hover:text-accent">{c.name}</Link>
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: tribe.color }} />
                  {tribe.name}
                  {exit ? <span>· {exitLabel(exit)} after {episodeLabel(season, exit.afterEpisode)}</span> : null}
                </p>
              </div>
              <div className="text-right">
                <p className="display num text-xl font-extrabold">{slotPoints(i)}</p>
                <p className="text-xs text-muted">from this slot</p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-10">
        <SectionTitle aside={<Sparkbars values={row.episodeScores} />}>Episode by episode</SectionTitle>
        <ol className="grid gap-2">
          {perEpisode.map(({ e, roster }) => {
            const score = roster.reduce((s, r) => s + r.pts, 0);
            const swapped = txs.filter((t) => t.effectiveEpisode === e.number);
            return (
              <li key={e.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={seasonPath(season.id, `/episodes/${e.number}`)} className="font-semibold hover:text-accent">{episodeLabel(season, e.number)}</Link>
                    <PolicyPill episode={e} />
                    {swapped.length ? <Pill>{swapped.length === 1 ? "1 swap in" : `${swapped.length} swaps in`}</Pill> : null}
                  </div>
                  <Signed n={score} className="display text-lg font-extrabold" />
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  {roster.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted">{castawayName(season, r.id)}</span>
                      <Signed n={r.pts} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-10">
        <SectionTitle>Roster history</SectionTitle>
        <ol className="relative ml-2 border-l border-line pl-5">
          <li className="mb-4">
            <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-accent" />
            <p className="font-semibold">Opening draft</p>
            <p className="text-sm text-muted">{team.draft.map((c) => castawayName(season, c)).join(" · ")}</p>
          </li>
          {txs.map((t) => (
            <li key={t.id} className="mb-4">
              <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-muted" />
              <p className="font-semibold">
                {castawayName(season, t.out)} <span className="text-muted">→</span> {castawayName(season, t.in)}
                {t.free ? <span className="ml-2 align-middle"><Pill tone="good">Free pick</Pill></span> : null}
              </p>
              <p className="text-sm text-muted">
                {season.slots[t.slot].name} slot · window after {episodeLabel(season, t.windowAfterEpisode)}, scores from {episodeLabel(season, t.effectiveEpisode)}
                {t.date ? ` · ${t.date}` : ""}
                {t.note ? ` · ${t.note}` : ""}
              </p>
            </li>
          ))}
          {draftEpisodes.length ? (
            <li>
              <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-accent" />
              <p className="font-semibold">Back to the original draft</p>
              <p className="text-sm text-muted">From {episodeLabel(season, draftEpisodes[0].number)} the league scores every team&apos;s opening roster, so swaps no longer count.</p>
            </li>
          ) : null}
        </ol>
      </div>

      {wager?.castaway ? (
        <div className="mt-10">
          <SectionTitle>Final wager</SectionTitle>
          <Card className="flex items-center justify-between gap-3 p-4">
            <p>
              Picked <span className="font-semibold">{castawayName(season, wager.castaway)}</span> to win.
              <span className="block text-sm text-muted">Shown beside the base total, never inside it.</span>
            </p>
            <Signed n={wager.points} className="display text-2xl font-extrabold" />
          </Card>
        </div>
      ) : null}
    </SeasonShell>
  );
}
