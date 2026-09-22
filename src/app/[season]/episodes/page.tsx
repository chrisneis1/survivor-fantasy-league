import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, Pill, PolicyPill } from "@/components/ui";
import { getSeason } from "@/data";
import { teamEpisodeScore } from "@/domain/engine";
import { seasonPath } from "@/lib/format";
import { castawayName, exitLabel } from "@/lib/view";

export const metadata = { title: "Episodes" };

const phaseLabel = { "pre-merge": "Pre-merge", "post-merge": "Post-merge", finale: "Finale" } as const;

export default async function Episodes({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  return (
    <SeasonShell season={season} active="/episodes">
      <PageTitle eyebrow={season.name} title="Episodes">
        Each recap lists who left, the episode&apos;s high-scoring team and every castaway&apos;s scoring.
      </PageTitle>
      <ol className="grid gap-3">
        {season.episodes.map((e) => {
          const exits = season.statusEvents.filter((s) => s.afterEpisode === e.number);
          const scored = e.state === "PUBLISHED";
          const best = scored
            ? season.teams.map((t) => ({ t, pts: teamEpisodeScore(season, t.id, e.number) })).sort((a, b) => b.pts - a.pts)[0]
            : null;
          return (
            <li key={e.id}>
              <Link href={seasonPath(season.id, `/episodes/${e.number}`)} className="group block">
                <Card className="p-4 transition-colors group-hover:border-accent/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="display text-lg font-bold">{e.phase === "finale" ? "Finale" : `Episode ${e.number}`}</h2>
                      <Pill>{phaseLabel[e.phase]}</Pill>
                      <PolicyPill episode={e} />
                    </div>
                    <p className="text-sm text-muted">
                      {best ? <>High score <span className="num font-semibold text-ink">{best.pts}</span> · {best.t.member}</> : "Not scored yet"}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {!scored
                      ? "Results appear here once the commissioner publishes this episode."
                      : exits.length
                      ? exits.map((x) => `${castawayName(season, x.castaway)} (${exitLabel(x).toLowerCase()})`).join(", ")
                      : e.phase === "finale"
                        ? "Season finished."
                        : "No one left the game."}
                  </p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>
    </SeasonShell>
  );
}
