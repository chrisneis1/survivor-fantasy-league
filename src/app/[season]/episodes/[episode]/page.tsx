import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, Pill, PolicyPill, RankMark, SectionTitle, Signed } from "@/components/ui";
import { getSeason } from "@/data";
import { castawayEpisodeTotal, competitionRanks, teamEpisodeScore } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { castawayName, exitLabel, ruleName } from "@/lib/view";

export default async function EpisodePage({ params }: { params: Promise<{ season: string; episode: string }> }) {
  const p = await params;
  const season = await getSeason(p.season);
  const episode = season?.episodes.find((e) => String(e.number) === p.episode);
  if (!season || !episode) notFound();

  const n = episode.number;
  if (episode.state !== "PUBLISHED") {
    return (
      <SeasonShell season={season} active="/episodes">
        <Link href={seasonPath(season.id, "/episodes")} className="text-sm text-muted hover:text-ink">← All episodes</Link>
        <PageTitle eyebrow={season.name} title={episode.phase === "finale" ? "Finale" : `Episode ${n}`}>
          Not scored yet. Results appear here once the commissioner publishes this episode.
        </PageTitle>
      </SeasonShell>
    );
  }
  const corrections = season.corrections.filter((c) => c.episode === n);
  const exits = season.statusEvents.filter((s) => s.afterEpisode === n);
  const teamScores = season.teams.map((t) => ({ t, pts: teamEpisodeScore(season, t.id, n) }));
  const ranks = competitionRanks(teamScores.map((x) => x.pts));
  const teamRows = teamScores.map((x, i) => ({ ...x, rank: ranks[i] })).sort((a, b) => a.rank - b.rank);
  const castRows = season.castaways
    .map((c) => ({ c, pts: castawayEpisodeTotal(season, c.id, n), entries: season.scores.find((s) => s.episode === n && s.castaway === c.id)?.entries ?? [] }))
    .filter((r) => r.entries.length > 0)
    .sort((a, b) => b.pts - a.pts);
  const prev = n > 1 ? n - 1 : null;
  const next = n < season.episodes.length ? n + 1 : null;

  return (
    <SeasonShell season={season} active="/episodes">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href={seasonPath(season.id, "/episodes")} className="hover:text-ink">← All episodes</Link>
        <span className="flex gap-4">
          {prev ? <Link href={seasonPath(season.id, `/episodes/${prev}`)} className="hover:text-ink">← {episodeLabel(season, prev)}</Link> : null}
          {next ? <Link href={seasonPath(season.id, `/episodes/${next}`)} className="hover:text-ink">{episodeLabel(season, next)} →</Link> : null}
        </span>
      </div>
      <PageTitle eyebrow={season.name} title={episode.phase === "finale" ? "Finale" : `Episode ${n}`}>
        <span className="flex flex-wrap items-center gap-2">
          <Pill>{episode.phase === "pre-merge" ? "Pre-merge" : episode.phase === "post-merge" ? "Post-merge" : "Finale"}</Pill>
          <PolicyPill episode={episode} />
        </span>
      </PageTitle>

      {episode.rosterPolicy === "ORIGINAL_DRAFT" ? (
        <p className="mb-6 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
          Every team was scored on its <strong>original draft roster</strong> this episode, regardless of swaps made earlier in the season.
        </p>
      ) : null}

      {exits.length ? (
        <div className="mb-8">
          <SectionTitle>Left the game</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {exits.map((x) => (
              <li key={x.castaway}>
                <Link href={seasonPath(season.id, `/castaways/${x.castaway}`)} className="inline-block rounded-full border border-bad/40 bg-bad/10 px-3 py-1 text-sm font-semibold text-bad">
                  {castawayName(season, x.castaway)} · {exitLabel(x)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-2">
        <div>
          <SectionTitle aside="Team scores are derived">Team scores</SectionTitle>
          <Card className="overflow-hidden">
            <ol>
              {teamRows.map((r) => (
                <li key={r.t.id} className="border-b border-line last:border-b-0">
                  <Link href={seasonPath(season.id, `/teams/${r.t.id}`)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <RankMark rank={r.rank} tied={teamRows.filter((o) => o.rank === r.rank).length > 1} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.t.name}</span>
                      <span className="block text-sm text-muted">{r.t.member}</span>
                    </span>
                    <Signed n={r.pts} className="display text-xl font-extrabold" />
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div>
          <SectionTitle aside="Entered once per castaway">Castaway scoring</SectionTitle>
          <ul className="grid gap-2">
            {castRows.map(({ c, pts, entries }) => (
              <li key={c.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={seasonPath(season.id, `/castaways/${c.id}`)} className="font-semibold hover:text-accent">{c.name}</Link>
                  <Signed n={pts} className="display text-lg font-extrabold" />
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {entries.map((en) => (
                    <li key={en.rule} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs">
                      {ruleName(season, en.rule)} <Signed n={en.points} className="font-semibold" />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-10">
        <SectionTitle>Correction history</SectionTitle>
        {corrections.length === 0 ? (
          <p className="text-sm text-muted">No corrections have been made to this episode.</p>
        ) : (
          <ol className="grid gap-2">
            {corrections.map((c) => (
              <li key={c.id} className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
                <p className="font-semibold">◆ {castawayName(season, c.castaway)} · {ruleName(season, c.rule)}: <Signed n={c.before} /> → <Signed n={c.after} /></p>
                <p className="text-muted">{c.reason} · {new Date(c.at).toLocaleDateString("en-US", { timeZone: season.config.timezone, dateStyle: "medium" })}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </SeasonShell>
  );
}
