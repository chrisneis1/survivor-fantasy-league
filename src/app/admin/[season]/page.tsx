import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageTitle, Pill, PolicyPill, SectionTitle } from "@/components/ui";
import { getSeason } from "@/data";
import { latestPublished } from "@/domain/engine";
import { currentTurn, openWindow, openingTurn, windowBlock } from "@/domain/picks";
import { validateSetup } from "@/domain/setup";
import { episodeLabel } from "@/lib/format";
import { teamOf } from "@/lib/view";
import { store } from "@/server";
import { activateSeasonAction, adminOpeningPickAction, finalizeSeasonAction, lockWagersAction, openOpeningSelectionAction, openWagersAction, openWindowAction } from "@/server/actions";

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
  const fullIssues = season.status === "SETUP" ? validateSetup(season) : [];
  const fullErrors = fullIssues.filter((i) => i.level === "error");
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
      <PageTitle eyebrow="Commissioner" title={season.name}>
        {season.status === "SETUP"
          ? "This season is being set up. Activate it once setup is complete."
          : season.status === "OPENING_SELECTION"
            ? "The draft is under way. Members pick after signing in."
            : season.status === "ACTIVE"
            ? nextUnpublished
              ? `Next up: score ${nextUnpublished.title}.`
              : "Every episode is published."
            : "This season is archived and read-only."}
      </PageTitle>

      {season.status === "SETUP" ? (
        <Card className="mb-8 p-4">
          <SectionTitle aside={<Link href={`/admin/${season.id}/setup`} className="font-semibold text-accent hover:underline">Open setup →</Link>}>Publish teams &amp; pick order</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Set up your teams and the draft order in Setup, then publish here. Once you do, they lock in and each member drafts their own roster after signing in — you don&apos;t need episodes or scoring finished first.
          </p>
          {draftIssues.length === 0 ? (
            <p className="mb-3 text-sm text-good">✓ Ready to publish.</p>
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
            submit="Publish teams & pick order"
            disabled={draftErrors.length > 0 || season.teams.some((t) => t.draft.some(Boolean))}
            confirm="Publish the teams and pick order? Each member can then draft their own roster after signing in."
          >
            <input type="hidden" name="seasonId" value={season.id} />
          </ActionForm>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-ink">Or skip the draft and enter every roster yourself</summary>
            <p className="mb-2 mt-2 text-sm text-muted">No member picking at all — you fill in every team's roster in Setup, then activate directly. This does need episodes and scoring configured too, since the season goes straight to active.</p>
            {fullErrors.length > draftErrors.length ? (
              <ul className="mb-2 grid gap-1 text-sm text-muted">
                {fullIssues.filter((i) => i.level === "error" && !draftErrors.includes(i)).slice(0, 6).map((i, k) => <li key={k}>✕ {i.message}</li>)}
              </ul>
            ) : null}
            <ActionForm action={activateSeasonAction} submit="Activate season" ghost disabled={fullErrors.length > 0} confirm="Activate this season? Rosters, teams and the cast lock; episodes can then be scored.">
              <input type="hidden" name="seasonId" value={season.id} />
            </ActionForm>
          </details>
        </Card>
      ) : null}

      {season.status === "OPENING_SELECTION" && draftTurn ? (
        <Card className="mb-8 p-4">
          <SectionTitle aside={<Link href={`/${season.id}/this-week`} className="font-semibold text-accent hover:underline">Draft board →</Link>}>The draft</SectionTitle>
          <p className="mb-1 text-sm">
            Pick {draftTurn.index + 1} of {draftTurn.total} · Round {draftTurn.round}. Up now: <strong>{teamOf(season, draftTurn.teamId).member}</strong>.
          </p>
          <p className="mb-4 text-sm text-muted">Each member needs their login (see Members). If someone can&apos;t get to the site, you can pick for them below; it is logged with your reason.</p>
          <ActionForm action={adminOpeningPickAction} submit="Pick for this team" ghost resetOnSuccess confirm="Make this pick on the team's behalf?">
            <input type="hidden" name="seasonId" value={season.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Slot">
                <select name="slot" className={inputCls}>
                  {season.slots.map((sl, i) => (teamOf(season, draftTurn.teamId).draft[i] ? null : <option key={sl.id} value={i}>{sl.name}</option>))}
                </select>
              </Field>
              <Field label="Castaway">
                <select name="castaway" className={inputCls}>
                  {season.castaways.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Reason (required)"><input name="reason" required className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {season.status === "ACTIVE" ? (
        <Card className="mb-8 p-4">
          <SectionTitle aside={<Link href={`/${season.id}/this-week`} className="font-semibold text-accent hover:underline">This Week →</Link>}>Weekly pick window</SectionTitle>
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
          <SectionTitle aside={<Pill tone={season.wagerState === "OPEN" ? "accent" : season.wagerState === "LOCKED" ? "good" : "neutral"}>{season.wagerState === "OFF" ? "Not started" : season.wagerState === "OPEN" ? "Open" : "Locked"}</Pill>}>Final wager</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Each member secretly backs a winner and wagers {season.config.wager.minStake}–{season.config.wager.maxStake} points at {season.config.wager.correctMultiplier}:{season.config.wager.wrongMultiplier}. Picks stay hidden from everyone, including you, until you finalize the season.
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

      <SectionTitle>Episodes</SectionTitle>
      <ol className="grid gap-2">
        {season.episodes.map((e) => {
          const blocked = season.status !== "ACTIVE" || (e.state !== "PUBLISHED" && season.episodes.some((x) => x.number < e.number && x.state !== "PUBLISHED"));
          return (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="display w-16 font-bold">{e.phase === "finale" ? "Finale" : `Ep ${e.number}`}</span>
                <Pill>{e.phase}</Pill>
                <PolicyPill episode={e} />
                <Pill tone={stateTone[e.state]}>{stateLabel[e.state]}</Pill>
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
          <SectionTitle>Finish the season</SectionTitle>
          <p className="mb-3 text-sm text-muted">The final episode is published. Finalizing moves the season to the archive as read-only history.{season.wagerState === "LOCKED" ? " It also settles every wager and reveals who picked whom." : season.wagerState === "OPEN" ? " Lock wagering first." : ""}</p>
          <ActionForm action={finalizeSeasonAction} submit="Finalize and archive" confirm="Finalize this season? It becomes read-only.">
            <input type="hidden" name="seasonId" value={season.id} />
          </ActionForm>
        </Card>
      ) : null}
    </AdminShell>
  );
}
