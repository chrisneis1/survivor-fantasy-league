import Link from "next/link";
import { notFound } from "next/navigation";
import { IconEpisodes, IconFlame, IconMedical, IconTrophy } from "@/components/icons";
import { SeasonShell } from "@/components/shell";
import { EmptyState, PageHeader, PolicyPill, StatCard, StatusBadge } from "@/components/ui";
import { getSeason } from "@/data";
import { latestPublished, teamEpisodeScore } from "@/domain/engine";
import type { Episode, Season } from "@/domain/types";
import { episodeLabel, phaseLabel, seasonPath } from "@/lib/format";
import { castawayName, exitLabel } from "@/lib/view";

export const metadata = { title: "Episodes" };

export default async function Episodes({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();

  // Consecutive episodes of the same phase form one stretch of the timeline.
  const groups = season.episodes.reduce<{ phase: Episode["phase"]; episodes: Episode[] }[]>((acc, e) => {
    const last = acc.at(-1);
    if (last && last.phase === e.phase) last.episodes.push(e);
    else acc.push({ phase: e.phase, episodes: [e] });
    return acc;
  }, []);

  return (
    <SeasonShell season={season} active="/episodes">
      <PageHeader eyebrow={season.name} title="Episodes">
        {season.episodes.length ? "The season in order. Each recap lists who left, the episode's high-scoring team and every castaway's scoring." : null}
      </PageHeader>
      {season.episodes.length === 0 ? (
        <EmptyState icon={<IconEpisodes size={22} />} title="No episodes scheduled">
          The episode schedule appears here once the commissioner sets it up.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          {groups.map((g, gi) => (
            <section key={gi} aria-label={phaseLabel[g.phase]} className="mb-6">
              {g.phase !== "finale" ? (
                <h2 className="eyebrow mb-3 flex items-center gap-3 text-muted">
                  {phaseLabel[g.phase]}
                  <span aria-hidden className="h-px flex-1 bg-line" />
                </h2>
              ) : null}
              <ol className="relative">
                {g.episodes.map((e) => (
                  <EpisodeCard key={e.id} season={season} episode={e} />
                ))}
              </ol>
            </section>
          ))}
        </div>
        <SeasonGlance season={season} />
        </div>
      )}
    </SeasonShell>
  );
}

/** A few season-level counts beside the timeline. Only published results are counted. */
function SeasonGlance({ season }: { season: Season }) {
  const published = latestPublished(season);
  const exits = season.statusEvents.filter((x) => x.afterEpisode <= published);
  const merge = season.episodes.find((e) => e.phase === "post-merge");
  const special = exits.filter((x) => x.type !== "VOTED_OUT").length;
  return (
    <aside aria-label="Season at a glance" className="grid content-start gap-2.5 sm:grid-cols-2 lg:sticky lg:top-32 lg:grid-cols-1">
      <StatCard label="Episodes scored" value={<>{published}<span className="text-base text-muted"> / {season.episodes.length}</span></>} sub={published ? `Latest: ${episodeLabel(season, published)}` : "None yet"} />
      <StatCard label="Castaways out" value={<>{exits.length}<span className="text-base text-muted"> / {season.castaways.length}</span></>} sub={special ? `${special} not by vote` : "All by vote"} />
      {merge ? <StatCard label="The merge" value={`Ep ${merge.number}`} sub={merge.number <= published ? "Merged" : "Still to come"} /> : null}
    </aside>
  );
}

function EpisodeCard({ season, episode: e }: { season: Season; episode: Episode }) {
  const exits = season.statusEvents.filter((s) => s.afterEpisode === e.number);
  const scored = e.state === "PUBLISHED";
  const best = scored && !e.excludeFromStandings && season.teams.length
    ? season.teams.map((t) => ({ t, pts: teamEpisodeScore(season, t.id, e.number) })).sort((a, b) => b.pts - a.pts)[0]
    : null;
  const finale = e.phase === "finale";

  return (
    <li className="relative flex gap-3 pb-2.5 before:absolute before:bottom-0 before:left-[21px] before:top-11 before:w-px before:bg-line last:before:hidden sm:gap-4">
      <span
        aria-hidden
        className={`display num relative z-10 grid size-11 shrink-0 place-items-center rounded-full border text-lg font-extrabold ${
          finale ? "border-gold/70 bg-gold/15 text-gold" : scored ? "border-line-strong bg-surface-2 text-ink" : "border-dashed border-line-strong bg-bg text-muted"
        }`}
      >
        {finale ? <IconTrophy size={20} /> : e.number}
      </span>
      <Link
        href={seasonPath(season.id, `/episodes/${e.number}`)}
        className={`group min-w-0 flex-1 rounded-[var(--radius-card)] border px-4 py-3 shadow-card transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 ${
          finale ? "border-sand-line bg-sand text-sand-ink hover:bg-sand-2" : scored ? "border-line bg-surface hover:border-accent/60 hover:bg-surface-2" : "border-dashed border-line bg-bg-2/60 hover:border-line-strong"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display text-xl font-bold uppercase leading-none">{finale ? "Finale" : `Episode ${e.number}`}</h3>
            <PolicyPill episode={e} onSand={finale} />
            {e.excludeFromStandings ? <StatusBadge>Not counted in standings</StatusBadge> : null}
            {!scored ? <StatusBadge>{e.state === "SCORING" ? "Scoring in progress" : "Not scored yet"}</StatusBadge> : null}
          </div>
          {best ? (
            <p className={`flex items-center gap-1.5 text-sm ${finale ? "text-sand-muted" : "text-muted"}`}>
              <IconFlame size={14} className="text-ember" />
              High <span className={`display num text-lg font-extrabold ${finale ? "text-sand-ink" : "text-ink"}`}>{best.pts}</span>
              <span className="max-w-40 truncate">{best.t.name}</span>
            </p>
          ) : null}
        </div>
        <div className={`mt-2 text-sm ${finale ? "text-sand-muted" : "text-muted"}`}>
          {!scored ? (
            "Results appear here once the commissioner publishes this episode."
          ) : exits.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Left the game">
              {exits.map((x) => {
                const special = x.type !== "VOTED_OUT";
                return (
                  <li key={x.castaway}>
                    <StatusBadge tone={special ? "warn" : "bad"}>
                      {x.type === "MEDICAL_EVACUATION" ? <IconMedical size={12} /> : "✕"} {castawayName(season, x.castaway)} · {exitLabel(x).toLowerCase()}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          ) : finale ? (
            "Season finished."
          ) : (
            "No one left the game."
          )}
        </div>
      </Link>
    </li>
  );
}
