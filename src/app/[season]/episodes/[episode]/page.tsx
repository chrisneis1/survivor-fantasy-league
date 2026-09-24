import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronLeft, IconChevronRight, IconEpisodes, IconMedical } from "@/components/icons";
import { SeasonShell } from "@/components/shell";
import { Card, EmptyState, PageHeader, PolicyPill, RankBadge, ScoreChange, SectionHeader, StatusBadge } from "@/components/ui";
import { getSeason } from "@/data";
import { castawayEpisodeTotal, competitionRanks, teamEpisodeScore } from "@/domain/engine";
import type { Season } from "@/domain/types";
import { episodeLabel, phaseLabel, seasonPath } from "@/lib/format";
import { castawayName, exitLabel, ruleName } from "@/lib/view";
import { getMember } from "@/server/auth";

function EpisodeNav({ season, n }: { season: Season; n: number }) {
  const prev = n > 1 ? n - 1 : null;
  const next = n < season.episodes.length ? n + 1 : null;
  const cls = "inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink";
  return (
    <nav aria-label="Episodes" className="mb-3 flex items-center justify-between gap-2">
      <Link href={seasonPath(season.id, "/episodes")} className={cls}><IconChevronLeft size={16} /> All episodes</Link>
      <span className="flex gap-1">
        {prev ? <Link href={seasonPath(season.id, `/episodes/${prev}`)} className={cls} aria-label={`Previous: ${episodeLabel(season, prev)}`}><IconChevronLeft size={16} /> {episodeLabel(season, prev)}</Link> : null}
        {next ? <Link href={seasonPath(season.id, `/episodes/${next}`)} className={cls} aria-label={`Next: ${episodeLabel(season, next)}`}>{episodeLabel(season, next)} <IconChevronRight size={16} /></Link> : null}
      </span>
    </nav>
  );
}

export default async function EpisodePage({ params }: { params: Promise<{ season: string; episode: string }> }) {
  const p = await params;
  const season = await getSeason(p.season);
  const episode = season?.episodes.find((e) => String(e.number) === p.episode);
  if (!season || !episode) notFound();
  const me = await getMember(season.id);

  const n = episode.number;
  const title = episode.phase === "finale" ? "Finale" : `Episode ${n}`;
  if (episode.state !== "PUBLISHED") {
    return (
      <SeasonShell season={season} active="/episodes">
        <EpisodeNav season={season} n={n} />
        <PageHeader eyebrow={season.name} title={title} meta={<StatusBadge>{phaseLabel[episode.phase]}</StatusBadge>} />
        <EmptyState icon={<IconEpisodes size={22} />} title="Not scored yet">
          Results appear here once the commissioner publishes this episode.
        </EmptyState>
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

  return (
    <SeasonShell season={season} active="/episodes">
      <EpisodeNav season={season} n={n} />
      <PageHeader
        eyebrow={season.name}
        title={title}
        meta={
          <>
            <StatusBadge tone={episode.phase === "finale" ? "sand" : "neutral"}>{phaseLabel[episode.phase]}</StatusBadge>
            <PolicyPill episode={episode} />
            {episode.excludeFromStandings ? <StatusBadge>Not counted in standings</StatusBadge> : null}
          </>
        }
      />

      {episode.rosterPolicy === "ORIGINAL_DRAFT" ? (
        <Card tone="accent" className="mb-6 p-3.5 text-sm">
          Every team was scored on its <strong>original draft roster</strong> this episode, regardless of swaps made earlier in the season.
        </Card>
      ) : null}

      {exits.length ? (
        <section className="mb-8" aria-labelledby="exits-title">
          <SectionHeader id="exits-title">Left the game</SectionHeader>
          <ul className="flex flex-wrap gap-2">
            {exits.map((x) => (
              <li key={x.castaway}>
                <Link
                  href={seasonPath(season.id, `/castaways/${x.castaway}`)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${x.type === "VOTED_OUT" ? "border-bad/40 bg-bad/10 text-bad hover:bg-bad/15" : "border-warn/40 bg-warn/10 text-warn hover:bg-warn/15"}`}
                >
                  {x.type === "MEDICAL_EVACUATION" ? <IconMedical size={16} /> : <span aria-hidden>✕</span>}
                  {castawayName(season, x.castaway)} · {exitLabel(x)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-2">
        <section aria-labelledby="teams-title">
          <SectionHeader id="teams-title" aside="Derived from castaway scores">Team scores</SectionHeader>
          <Card className="overflow-hidden">
            <ol>
              {teamRows.map((r) => (
                <li key={r.t.id} className="border-b border-line last:border-b-0">
                  <Link href={seasonPath(season.id, `/teams/${r.t.id}`)} className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2 sm:px-4 ${r.t.id === me ? "bg-accent/[0.07]" : ""}`}>
                    <RankBadge rank={r.rank} tied={teamRows.filter((o) => o.rank === r.rank).length > 1} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{r.t.name}</span>
                      <span className="block truncate text-sm text-muted">{r.t.member}</span>
                    </span>
                    <ScoreChange n={r.pts} className="display text-2xl font-extrabold" />
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <section aria-labelledby="cast-title">
          <SectionHeader id="cast-title" aside="Entered once per castaway">Castaway scoring</SectionHeader>
          <ul className="grid gap-2">
            {castRows.map(({ c, pts, entries }) => (
              <li key={c.id} className="rounded-xl border border-line bg-surface px-3 py-2.5 sm:px-4">
                <div className="flex items-center justify-between gap-3">
                  <Link href={seasonPath(season.id, `/castaways/${c.id}`)} className="display text-lg font-bold uppercase hover:text-accent">{c.name}</Link>
                  <ScoreChange n={pts} className="display text-xl font-extrabold" />
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {entries.map((en) => (
                    <li key={en.rule} className="rounded-full border border-line-strong bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">
                      {ruleName(season, en.rule)} <ScoreChange n={en.points} className="font-semibold" />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="corr-title">
        <SectionHeader id="corr-title">Correction history</SectionHeader>
        {corrections.length === 0 ? (
          <p className="text-sm text-muted">No corrections have been made to this episode.</p>
        ) : (
          <ol className="grid gap-2">
            {corrections.map((c) => (
              <li key={c.id} className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm">
                <p className="font-semibold">◆ {castawayName(season, c.castaway)} · {ruleName(season, c.rule)}: <ScoreChange n={c.before} /> → <ScoreChange n={c.after} /></p>
                <p className="text-muted">{c.reason} · {new Date(c.at).toLocaleDateString("en-US", { timeZone: season.config.timezone, dateStyle: "medium" })}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </SeasonShell>
  );
}
