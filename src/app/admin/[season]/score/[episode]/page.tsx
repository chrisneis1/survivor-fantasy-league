import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ScoringGrid } from "@/components/scoring-grid";
import { PageHeader, StatusBadge, PolicyPill } from "@/components/ui";
import { getSeason } from "@/data";
import { currentTribeId, isActiveAt, ownersOf, rosterForEpisode } from "@/domain/engine";
import { AUTO_SCORER } from "@/domain/auto-scoring";
import { rowsFromPublished, rulesForPhase, validatePublish } from "@/domain/scoring";

export const metadata = { title: "Score episode" };

export default async function ScoreEpisode({ params }: { params: Promise<{ season: string; episode: string }> }) {
  const p = await params;
  const season = await getSeason(p.season);
  const episode = season?.episodes.find((e) => String(e.number) === p.episode);
  if (!season || !episode) notFound();

  const draft = season.drafts.find((d) => d.episode === episode.number);
  const published = episode.state === "PUBLISHED";

  // Publish blockers that do not depend on what is typed in the grid (that part is checked live in the browser).
  const blockers = published ? [] : validatePublish(season, episode.number).filter((b) => !/No scoring has been saved/.test(b));
  // Once a pick window has opened for this episode, its eligibility was computed from who left — that can't move here.
  const exitsLocked = published && season.windows.some((w) => w.afterEpisode === episode.number);

  const castaways = season.castaways
    .filter((c) => isActiveAt(season, c.id, episode.number))
    .map((c) => ({
      id: c.id,
      name: c.name,
      tribeId: currentTribeId(season, c.id, episode.number),
      owners: ownersOf(season, c.id, episode.number).map((id) => season.teams.find((t) => t.id === id)!.member),
    }));

  let teams: { id: string; member: string; roster: string[] }[] = [];
  try {
    teams = season.teams.map((t) => ({ id: t.id, member: t.member, roster: rosterForEpisode(season, t.id, episode.number).filter(Boolean) }));
  } catch {
    // An invalid roster policy is reported in the blockers list.
  }

  return (
    <AdminShell season={season} active="">
      <Link href={`/admin/${season.id}`} className="text-sm text-muted hover:text-ink">← Overview</Link>
      <PageHeader eyebrow={`${season.name} · ${episode.phase}`} title={published ? `Edit scoring · ${episode.title}` : `Score ${episode.title}`}>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={published ? "good" : episode.state === "SCORING" ? "accent" : "neutral"}>{published ? "Published" : episode.state === "SCORING" ? "Scoring in progress" : "Not scored"}</StatusBadge>
          <PolicyPill episode={episode} />
          {episode.excludeFromStandings ? <StatusBadge tone="accent">Doesn&apos;t count toward standings</StatusBadge> : null}
          <span className="text-sm">
            {published ? "Everything here is editable, the same as when you first scored it. Changes need a reason and recalculate standings right away." : "Score each castaway once. Team totals are worked out for you."}
          </span>
        </span>
      </PageHeader>

      {!published && draft?.savedBy === AUTO_SCORER ? (
        <section aria-labelledby="auto-notes" className="mb-5 rounded-xl border border-accent/40 bg-accent/5 p-3 sm:p-4">
          <h2 id="auto-notes" className="font-semibold">Scored automatically — check before publishing</h2>
          <p className="mt-0.5 text-sm text-muted">The weekly auto-scorer researched this episode and saved it as progress on {draft ? new Date(draft.savedAt).toLocaleString("en-US", { timeZone: season.config.timezone, dateStyle: "medium", timeStyle: "short" }) : ""}. Nothing is public until you publish.</p>
          {draft.note ? <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{draft.note}</p> : null}
        </section>
      ) : null}

      <ScoringGrid
        seasonId={season.id}
        episode={episode.number}
        episodeTitle={episode.title}
        phase={episode.phase}
        rules={rulesForPhase(season, episode.phase)}
        tribes={season.tribes}
        castaways={castaways}
        teams={teams}
        initialRows={published ? rowsFromPublished(season, episode.number) : (draft?.rows ?? [])}
        blockers={blockers}
        lastSaved={draft ? new Date(draft.savedAt).toLocaleString("en-US", { timeZone: season.config.timezone, dateStyle: "medium", timeStyle: "short" }) : undefined}
        mode={published ? "edit" : "score"}
        exitsLocked={exitsLocked}
      />
    </AdminShell>
  );
}
