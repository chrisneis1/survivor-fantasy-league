import Link from "next/link";
import { notFound } from "next/navigation";
import { EpisodeBars } from "@/components/episode-bars";
import { IconChevronLeft } from "@/components/icons";
import { SeasonShell } from "@/components/shell";
import { Card, EmptyState, OwnershipMeter, PageHeader, ScoreChange, SectionHeader, StatCard, StatusBadge, TribeTag } from "@/components/ui";
import { getSeason } from "@/data";
import { castawayEpisodeTotal, castawaySeasonTotal, latestPublished, ownerCount, ownersOf, statusEventFor } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { exitLabel, ruleName, teamOf } from "@/lib/view";

export default async function CastawayPage({ params }: { params: Promise<{ season: string; castaway: string }> }) {
  const p = await params;
  const season = await getSeason(p.season);
  const c = season?.castaways.find((x) => x.id === p.castaway);
  if (!season || !c) notFound();

  const exit = statusEventFor(season, c.id);
  const total = castawaySeasonTotal(season, c.id);
  const cap = season.config.ownershipCap;
  const published = latestPublished(season);
  const nowEp = Math.max(1, Math.min(published + 1, season.episodes.length));
  const drafted = season.teams.filter((t) => t.draft.includes(c.id)).length;
  const rows = season.episodes
    .filter((e) => e.state === "PUBLISHED")
    .map((e) => ({
      e,
      pts: castawayEpisodeTotal(season, c.id, e.number),
      entries: season.scores.find((s) => s.episode === e.number && s.castaway === c.id)?.entries ?? [],
      owners: ownersOf(season, c.id, e.number),
    }))
    // Nothing to show for episodes after the castaway left and nobody scored them.
    .filter((r) => r.entries.length > 0 || !exit || r.e.number <= exit.afterEpisode);

  return (
    <SeasonShell season={season} active="/castaways">
      <Link href={seasonPath(season.id, "/castaways")} className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <IconChevronLeft size={16} /> All castaways
      </Link>
      <PageHeader
        eyebrow={season.name}
        title={c.name}
        meta={
          <>
            <TribeTag season={season} castaway={c} className="text-sm" />
            {exit ? <StatusBadge tone="bad">✕ {exitLabel(exit)} · {episodeLabel(season, exit.afterEpisode)}</StatusBadge> : <StatusBadge tone="good">● {season.status === "ARCHIVED" ? "Made the finale" : "Still in the game"}</StatusBadge>}
            {exit?.note ? <span className="text-sm text-ink-2">{exit.note}</span> : null}
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatCard tone="sand" label="Season points" value={total} sub={`through ${published ? episodeLabel(season, published) : "—"}`} />
        <StatCard label="Drafted by" value={<>{drafted}<span className="text-base text-muted"> / {cap}</span></>} sub="opening rosters" />
        <StatCard className="col-span-2 sm:col-span-1" label="Owners now" value={<OwnershipMeter owners={season.episodes.length ? ownerCount(season, c.id, nowEp) : 0} cap={cap} />} sub={`Cap ${cap} teams per castaway`} />
      </div>

      <section aria-labelledby="scoring-title">
        <SectionHeader id="scoring-title" aside="Scored once, applied to every owner">Episode scoring</SectionHeader>
        {rows.length === 0 ? (
          <EmptyState compact>Scoring appears here once an episode is published.</EmptyState>
        ) : (
          <>
            <Card className="mb-3 p-4 sm:p-5">
              <EpisodeBars items={rows.map((r) => ({ label: r.e.phase === "finale" ? "F" : String(r.e.number), value: r.pts }))} />
            </Card>
            <ol className="grid gap-2">
              {rows.map(({ e, pts, entries, owners }) => (
                <li key={e.id} className="rounded-xl border border-line bg-surface px-3 py-2.5 sm:px-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={seasonPath(season.id, `/episodes/${e.number}`)} className="display text-lg font-bold uppercase hover:text-accent">{episodeLabel(season, e.number)}</Link>
                    <ScoreChange n={pts} className="display text-xl font-extrabold" />
                  </div>
                  {entries.length ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {entries.map((en) => (
                        <li key={en.rule} className="rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">
                          {ruleName(season, en.rule)} <ScoreChange n={en.points} className="font-semibold" />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted">No scoring this episode.</p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {owners.length === 0
                      ? "On no team's scoring roster"
                      : `On ${owners.length} ${owners.length === 1 ? "team" : "teams"}: ${owners.map((id) => teamOf(season, id).member).join(", ")}`}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </SeasonShell>
  );
}
