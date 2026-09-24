import { wagerDeadlineEpisode, wagerDeadlinePassed } from "@/domain/wager";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageHeader, StatusBadge, PolicyPill, SectionHeader } from "@/components/ui";
import { getSeason } from "@/data";
import { latestPublished } from "@/domain/engine";
import { currentTurn, openWindow, openingTurn, windowBlock } from "@/domain/picks";
import { validateSetup } from "@/domain/setup";
import { episodeLabel } from "@/lib/format";
import { teamOf } from "@/lib/view";
import { store } from "@/server";
import { finalizeSeasonAction, lockWagersAction, openOpeningSelectionAction, openWagersAction, openWindowAction } from "@/server/actions";

export const metadata = { title: "Commissioner" };

const stateTone = { SCHEDULED: "neutral", SCORING: "accent", PUBLISHED: "good" } as const;
const stateLabel = { SCHEDULED: "Not scored", SCORING: "Scoring in progress", PUBLISHED: "Published" } as const;

export default async function AdminSeason({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  // What's needed to publish the draft (teams, cast, pick order) is deliberately looser than a full activation:
  // rosters start empty (that's what the draft is for), and episodes/scoring can be filled in later, closer to
  // when the season actually airs.
  const draftIssues = season.status === "SETUP" ? validateSetup(season, { rosters: false, episodes: false, scoring: false }) : [];
  const draftErrors = draftIssues.filter((i) => i.level === "error");
  const allPublished = season.episodes.length > 0 && season.episodes.every((e) => e.state === "PUBLISHED");
  const nextUnpublished = season.episodes.find((e) => e.state !== "PUBLISHED");
  const draftTurn = openingTurn(season);
  const liveWindow = openWindow(season);
  const up = liveWindow && currentTurn(liveWindow);
  const published = latestPublished(season);
  // Only how many teams have wagered is loaded here, never who picked whom: the commissioner plays too.
  const wagered = season.status === "ACTIVE" && season.wagerState !== "OFF" ? (await store().wagerPlacedBy(season.id)).size : 0;
  const canOpen = season.status === "ACTIVE" && published > 0 ? windowBlock(season, published) : "No episode is published yet.";

  return (
    <AdminShell season={season} active="">
      <PageHeader eyebrow="Commissioner" title={season.name}>
        {season.status === "SETUP"
          ? "This season is being set up. Activate it once setup is complete."
          : season.status === "OPENING_SELECTION"
            ? "The draft is under way. Members pick after signing in."
            : season.status === "ACTIVE"
            ? nextUnpublished
              ? `Next up: score ${nextUnpublished.title}.`
              : "Every episode is published."
            : "This season is archived and read-only."}
      </PageHeader>

      {season.status === "SETUP" ? (
        <Card className="mb-8 p-4">
          <SectionHeader aside={<Link href={`/admin/${season.id}/setup`} className="font-semibold text-accent hover:underline">Open setup →</Link>}>Launch to the draft phase</SectionHeader>
          <p className="mb-3 text-sm text-muted">
            Finish everything in Setup except opening rosters — those are what the draft is for. Launching locks in the teams and pick order and opens the draft board; you don&apos;t need episodes or scoring finished first.
          </p>
          {draftIssues.length === 0 ? (
            <p className="mb-3 text-sm text-good">✓ Ready to launch.</p>
          ) : (
            <ul className="mb-3 grid gap-1.5 text-sm">
              {draftIssues.slice(0, 8).map((i, k) => (
                <li key={k} className={i.level === "error" ? "text-bad" : "text-muted"}>
                  {i.level === "error" ? "✕" : "!"} {i.message}
                </li>
              ))}
              {draftIssues.length > 8 ? <li className="text-muted">…and {draftIssues.length - 8} more.</li> : null}
            </ul>
          )}
          <ActionForm
            action={openOpeningSelectionAction}
            submit="Launch to draft phase"
            disabled={draftErrors.length > 0 || season.teams.some((t) => t.draft.some(Boolean))}
            confirm="Launch the draft? Teams and the pick order lock in, and the draft board opens."
          >
            <input type="hidden" name="seasonId" value={season.id} />
          </ActionForm>
        </Card>
      ) : null}

      {season.status === "OPENING_SELECTION" && draftTurn ? (
        <Card className="mb-8 p-4">
          <SectionHeader>The draft</SectionHeader>
          <p className="mb-3 text-sm">
            Pick {draftTurn.index + 1} of {draftTurn.total} · Round {draftTurn.round}. Up now: <strong>{teamOf(season, draftTurn.teamId).member}</strong>.
          </p>
          <Link href={`/admin/${season.id}/draft`} className="inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink">
            Open the draft board →
          </Link>
        </Card>
      ) : null}

      {season.status === "ACTIVE" ? (
        <Card className="mb-8 p-4">
          <SectionHeader aside={<Link href={`/${season.id}/this-week`} className="font-semibold text-accent hover:underline">This Week →</Link>}>Weekly pick window</SectionHeader>
          {liveWindow ? (
            <p className="text-sm">
              A window is open after <strong>{episodeLabel(season, liveWindow.afterEpisode)}</strong>{up ? <>. Up now: <strong>{teamOf(season, up.teamId).member}</strong>.</> : "."} Skip, remind or close it from This Week.
            </p>
          ) : canOpen === null ? (
            <>
              <p className="mb-3 text-sm text-muted">{episodeLabel(season, published)} is published. Open a window when you&apos;re ready for teams to replace eliminated castaways. The order is frozen from the standings right now.</p>
              <ActionForm action={openWindowAction} submit={`Open pick window after ${episodeLabel(season, published)}`} confirm="Open the window? The reverse-standings order is saved now.">
                <input type="hidden" name="seasonId" value={season.id} />
                <input type="hidden" name="afterEpisode" value={published} />
              </ActionForm>
            </>
          ) : (
            <p className="text-sm text-muted">{canOpen}</p>
          )}
        </Card>
      ) : null}

      {season.status === "ACTIVE" ? (
        <Card className="mb-8 p-4">
          <SectionHeader aside={<StatusBadge tone={season.wagerState === "OPEN" ? "accent" : season.wagerState === "LOCKED" ? "good" : "neutral"}>{season.wagerState === "OFF" ? "Not started" : season.wagerState === "OPEN" ? "Open" : "Locked"}</StatusBadge>}>Final wager</SectionHeader>
          <p className="mb-3 text-sm text-muted">
            Each member secretly backs a winner and wagers {season.config.wager.minStake}–{season.config.wager.maxStake} points at {season.config.wager.correctMultiplier}:{season.config.wager.wrongMultiplier}. Picks stay hidden from everyone, including you, until you finalize the season. Wagering closes by itself once Episode {wagerDeadlineEpisode(season)} is scored.
          </p>
          {season.wagerState !== "OFF" ? <p className="mb-3 text-sm"><strong>{wagered}</strong> of {season.teams.length} teams have placed a wager.</p> : null}
          {season.wagerState === "OFF" ? (
            <ActionForm action={openWagersAction} submit="Open wagering">
              <input type="hidden" name="seasonId" value={season.id} />
            </ActionForm>
          ) : season.wagerState === "OPEN" ? (
            <ActionForm action={lockWagersAction} submit="Lock wagering" ghost confirm="Lock wagering? Members can no longer place or change a wager.">
              <input type="hidden" name="seasonId" value={season.id} />
            </ActionForm>
          ) : wagerDeadlinePassed(season) ? (
            <p className="text-sm text-muted">Wagering closed automatically when Episode {wagerDeadlineEpisode(season)} was scored, and can&apos;t be reopened.</p>
          ) : (
            <ActionForm action={openWagersAction} submit="Reopen wagering" ghost confirm="Reopen wagering so members can change their wager again?">
              <input type="hidden" name="seasonId" value={season.id} />
            </ActionForm>
          )}
        </Card>
      ) : null}

      <Card className="mb-8 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-semibold">Export this season</p>
          <p className="text-sm text-muted">Standings, rosters, castaway totals, episode scoring, swaps and corrections, as one CSV.</p>
        </div>
        <a href={`/admin/${season.id}/export`} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">Download CSV</a>
      </Card>

      <SectionHeader>Episodes</SectionHeader>
      <ol className="grid gap-2">
        {season.episodes.map((e) => {
          const blocked = season.status !== "ACTIVE" || (e.state !== "PUBLISHED" && season.episodes.some((x) => x.number < e.number && x.state !== "PUBLISHED"));
          return (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="display w-16 font-bold">{e.phase === "finale" ? "Finale" : `Ep ${e.number}`}</span>
                <StatusBadge>{e.phase}</StatusBadge>
                <PolicyPill episode={e} />
                <StatusBadge tone={stateTone[e.state]}>{stateLabel[e.state]}</StatusBadge>
              </div>
              {e.state === "PUBLISHED" ? (
                <span className="flex gap-4 text-sm font-semibold">
                  <Link href={`/${season.id}/episodes/${e.number}`} className="text-muted hover:text-ink">View</Link>
                  <Link href={`/admin/${season.id}/score/${e.number}`} className="text-accent hover:underline">Edit scoring</Link>
                </span>
              ) : blocked ? (
                <span className="text-sm text-muted">{season.status === "ACTIVE" ? "Publish the earlier episode first" : "Activate the season to score"}</span>
              ) : (
                <Link href={`/admin/${season.id}/score/${e.number}`} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink">
                  {e.state === "SCORING" ? "Continue scoring" : "Score episode"}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {season.status === "ACTIVE" && allPublished ? (
        <Card className="mt-8 p-4">
          <SectionHeader>Finish the season</SectionHeader>
          <p className="mb-3 text-sm text-muted">The final episode is published. Finalizing moves the season to the archive as read-only history.{season.wagerState === "LOCKED" ? " It also settles every wager and reveals who picked whom." : season.wagerState === "OPEN" ? " Lock wagering first." : ""}</p>
          <ActionForm action={finalizeSeasonAction} submit="Finalize and archive" confirm="Finalize this season? It becomes read-only.">
            <input type="hidden" name="seasonId" value={season.id} />
          </ActionForm>
        </Card>
      ) : null}
    </AdminShell>
  );
}
