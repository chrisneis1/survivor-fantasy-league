import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { inputCls } from "@/components/styles";
import { ScoringGrid } from "@/components/scoring-grid";
import { PageHeader, StatusBadge, PolicyPill } from "@/components/ui";
import { getSeason } from "@/data";
import { currentTribeId, isActiveAt, ownersOf, rosterForEpisode } from "@/domain/engine";
import { rowsFromPublished, rulesForPhase, validatePublish } from "@/domain/scoring";
import { dissolvedTribes } from "@/domain/setup";
import { addTribeAction } from "@/server/actions";

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

  // Tribes a swap or the merge left empty stay off the grid (unless a row is still on one).
  const dissolved = dissolvedTribes(season, episode.number);

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

      {season.status !== "ARCHIVED" ? (
        <details className="mb-4 rounded-2xl border border-line bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Tribe swap or merge? Add the new tribe</summary>
          <p className="mt-2 text-muted">
            Add any new tribe here, then tick it for each castaway who&apos;s on it in this episode (the tribe boxes in each row). Tribes nobody is on any more drop off the grid by themselves.
            {episode.phase === "pre-merge" ? <> If this is the merge, also set it as the first post-merge episode in <Link className="underline" href={`/admin/${season.id}/setup#episodes`}>Setup → Episodes</Link>.</> : null}
          </p>
          <ActionForm action={addTribeAction} submit="Add tribe" ghost resetOnSuccess className="mt-3 grid gap-3">
            <input type="hidden" name="seasonId" value={season.id} />
            <div className="grid max-w-md grid-cols-[1fr_5rem] gap-3">
              <Field label="Tribe name"><input name="name" required className={inputCls} /></Field>
              <Field label="Colour"><input name="color" type="color" defaultValue="#d6453d" className={`${inputCls} h-[38px] p-1`} /></Field>
            </div>
          </ActionForm>
        </details>
      ) : null}

      <ScoringGrid
        seasonId={season.id}
        episode={episode.number}
        episodeTitle={episode.title}
        phase={episode.phase}
        rules={rulesForPhase(season, episode.phase)}
        tribes={season.tribes.map((t) => ({ ...t, dissolved: dissolved.has(t.id) }))}
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
