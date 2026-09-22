import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, Pill, SectionTitle, Signed, TribeTag } from "@/components/ui";
import { getSeason } from "@/data";
import { castawayEpisodeTotal, castawaySeasonTotal, ownersOf, statusEventFor } from "@/domain/engine";
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
      <Link href={seasonPath(season.id, "/castaways")} className="text-sm text-muted hover:text-ink">← All castaways</Link>
      <PageTitle eyebrow={season.name} title={c.name}>
        <span className="flex flex-wrap items-center gap-3">
          <TribeTag season={season} castaway={c} />
          {exit ? <Pill tone="bad">{exitLabel(exit)} · {episodeLabel(season, exit.afterEpisode)}</Pill> : <Pill tone="good">In the finale</Pill>}
          {exit?.note ? <span className="text-sm">{exit.note}</span> : null}
        </span>
      </PageTitle>

      <div className="mb-8 grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Season points</p>
          <p className="display num mt-1 text-3xl font-extrabold">{total}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Drafted by</p>
          <p className="display num mt-1 text-3xl font-extrabold">{season.teams.filter((t) => t.draft.includes(c.id)).length}<span className="text-base font-semibold text-muted"> / {cap} cap</span></p>
        </Card>
      </div>

      <SectionTitle aside="Scored once, applied to every owner">Episode scoring</SectionTitle>
      <ol className="grid gap-2">
        {rows.map(({ e, pts, entries, owners }) => (
          <li key={e.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={seasonPath(season.id, `/episodes/${e.number}`)} className="font-semibold hover:text-accent">{episodeLabel(season, e.number)}</Link>
              <Signed n={pts} className="display text-lg font-extrabold" />
            </div>
            {entries.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {entries.map((en) => (
                  <li key={en.rule} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs">
                    {ruleName(season, en.rule)} <Signed n={en.points} className="font-semibold" />
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
    </SeasonShell>
  );
}
