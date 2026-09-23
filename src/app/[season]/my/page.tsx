import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { btnGhostCls, inputCls } from "@/components/styles";
import { PickPanel } from "@/components/pick-panel";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, Pill, SectionTitle } from "@/components/ui";
import { getSeason } from "@/data";
import { effectiveRoster, isActiveAt, latestPublished, standings } from "@/domain/engine";
import { currentTurn, openWindow, openingSequence, openingTurn, picksRemaining } from "@/domain/picks";
import { episodeLabel, plural, seasonPath } from "@/lib/format";
import { openingPanel, replacementPanel } from "@/lib/picker";
import { castawayName, teamOf } from "@/lib/view";
import { wagerCandidates } from "@/domain/wager";
import { store } from "@/server";
import { placeWagerAction, renameMyTeamAction, userSignOutAction } from "@/server/actions";
import { getMember, getUser } from "@/server/auth";
import type { Season } from "@/domain/types";

export const metadata = { title: "My Team" };

export default async function MyTeam({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const [teamId, user] = await Promise.all([getMember(season.id), getUser()]);

  if (!teamId) {
    return (
      <SeasonShell season={season} active="/my">
        <PageTitle eyebrow={season.name} title="My Team">
          {user ? (
            <>This page is for team owners. Your account isn&apos;t assigned to a team in {season.name} yet — ask your commissioner to assign it from Members.</>
          ) : (
            <>
              This page is for team owners.{" "}
              <Link href={`/login?next=${encodeURIComponent(seasonPath(season.id, "/my"))}`} className="text-accent hover:underline">Sign in</Link>
              {" "}or{" "}
              <Link href={`/signup?next=${encodeURIComponent(seasonPath(season.id, "/my"))}`} className="text-accent hover:underline">create an account</Link>
              , then ask your commissioner to assign it to your team.
            </>
          )}
        </PageTitle>
      </SeasonShell>
    );
  }

  const team = teamOf(season, teamId);
  const draftTurn = openingTurn(season);
  const win = openWindow(season);
  const turn = win && currentTurn(win);
  const myTurnToDraft = draftTurn?.teamId === teamId;
  const myTurnToSwap = !!win && turn?.teamId === teamId;
  const effEp = win ? win.afterEpisode + 1 : latestPublished(season) + 1;
  const roster = season.status === "OPENING_SELECTION" ? team.draft : effectiveRoster(season, teamId, Math.min(effEp, season.episodes.length));
  const row = standings(season).find((r) => r.teamId === teamId);
  const myTurns = win?.turns.find((t) => t.teamId === teamId);
  const swapsUsed = season.transactions.filter((t) => t.team === teamId && !t.free).length;
  const limit = season.config.swapCreditLimit;
  const myTx = season.transactions.filter((t) => t.team === teamId).sort((a, b) => (b.order ?? 0) - (a.order ?? 0));

  return (
    <SeasonShell season={season} active="/my">
      <PageTitle eyebrow={`${team.member}'s team`} title={team.name}>
        {season.status === "OPENING_SELECTION"
          ? "The draft is under way."
          : row
            ? `Rank ${row.rank} · ${row.total} points · ${swapsUsed} ${swapsUsed === 1 ? "swap" : "swaps"} used${limit === null ? "" : ` of ${limit}`}`
            : ""}
      </PageTitle>

      {/* The action comes first on a phone: banner, then the picker, then everything else. */}
      {season.status === "OPENING_SELECTION" && draftTurn ? (
        <section className="mb-8">
          <Card className={`mb-4 p-4 ${myTurnToDraft ? "border-accent/60 bg-accent/10" : ""}`}>
            <p className="flex flex-wrap items-center gap-2">
              <Pill tone={myTurnToDraft ? "accent" : "neutral"}>{myTurnToDraft ? "▶ You're up" : "○ Waiting"}</Pill>
              <span className="font-semibold">Pick {draftTurn.index + 1} of {draftTurn.total} · Round {draftTurn.round}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {myTurnToDraft ? "Choose a slot, then a castaway. There's no time limit." : `${teamOf(season, draftTurn.teamId).member} is picking. You have ${plural(openingSequence(season).slice(draftTurn.index).filter((t) => t === teamId).length, "pick")} to go.`}
            </p>
          </Card>
          {myTurnToDraft ? <PickPanel seasonId={season.id} mode="opening" {...openingPanel(season, teamId)} /> : null}
        </section>
      ) : null}

      {win ? (
        <section className="mb-8">
          <Card className={`mb-4 p-4 ${myTurnToSwap ? "border-accent/60 bg-accent/10" : ""}`}>
            <p className="flex flex-wrap items-center gap-2">
              <Pill tone={myTurnToSwap ? "accent" : "neutral"}>{myTurnToSwap ? "▶ You're up" : myTurns ? "○ " + (myTurns.status === "WAITING" ? "Waiting" : myTurns.status === "AUTO_SKIPPED" ? "Nothing to pick" : "Done") : "○ Not in this window"}</Pill>
              <span className="font-semibold">Pick window after {episodeLabel(season, win.afterEpisode)}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {myTurnToSwap
                ? `You can make ${plural(picksRemaining(season, teamId, effEp), "replacement")}. There's no time limit; finish with Done when you're happy.`
                : turn
                  ? `${teamOf(season, turn.teamId).member} is picking${myTurns?.status === "WAITING" ? `. You're number ${myTurns.sequence} in the saved order.` : "."}`
                  : "The window is wrapping up."}
              {myTurns?.skipReason && !myTurnToSwap ? ` ${myTurns.skipReason}.` : ""}
            </p>
          </Card>
          {myTurnToSwap ? <PickPanel seasonId={season.id} mode="replace" remaining={picksRemaining(season, teamId, effEp)} {...replacementPanel(season, teamId, effEp)} /> : null}
        </section>
      ) : null}

      {season.status === "ACTIVE" && season.wagerState !== "OFF" ? <WagerCard season={season} teamId={teamId} /> : null}

      <SectionTitle aside={<Link className="hover:text-ink" href={seasonPath(season.id, `/teams/${teamId}`)}>Full team page →</Link>}>Roster</SectionTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        {season.slots.map((slot, i) => {
          const cid = roster[i];
          const out = cid && !isActiveAt(season, cid, Math.min(effEp, season.episodes.length));
          return (
            <Card key={slot.id} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">{slot.name} slot</p>
              {cid ? (
                <p className={`display text-lg font-bold ${out ? "text-muted line-through" : ""}`}>
                  {castawayName(season, cid)} {out ? <span className="text-sm font-normal no-underline">· out of the game</span> : null}
                </p>
              ) : (
                <p className="text-muted">Not picked yet</p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <SectionTitle>Team name</SectionTitle>
        <Card className="p-4">
          <p className="mb-3 text-sm text-muted">Yours to change whenever you like — no rush, and no need to wait for anyone else's.</p>
          <ActionForm action={renameMyTeamAction} submit="Save" ghost className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="seasonId" value={season.id} />
            <input name="name" defaultValue={team.name} required maxLength={60} className={`${inputCls} max-w-xs`} />
          </ActionForm>
        </Card>
      </div>

      <div className="mt-8">
        <form action={userSignOutAction}>
          <button className={btnGhostCls}>Sign out</button>
        </form>
      </div>

      {myTx.length ? (
        <div className="mt-8">
          <SectionTitle>My swaps</SectionTitle>
          <ul className="grid gap-2">
            {myTx.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                {castawayName(season, t.out)} → <strong>{castawayName(season, t.in)}</strong>
                <span className="text-muted"> · {season.slots[t.slot].name} slot · from {episodeLabel(season, t.effectiveEpisode)}{t.free ? " · free" : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SeasonShell>
  );
}

/** The member's own secret wager. Nobody else's pick, and no summary of picks, is ever loaded here. */
async function WagerCard({ season, teamId }: { season: Season; teamId: string }) {
  const mine = await store().ownWager(season.id, teamId);
  const w = season.config.wager;
  const open = season.wagerState === "OPEN";
  const candidates = wagerCandidates(season);
  const stillIn = mine ? candidates.some((c) => c.id === mine.castaway) : true;
  return (
    <section className="mb-8">
      <SectionTitle aside={<Pill tone={open ? "accent" : "neutral"}>{open ? "Open" : "Locked"}</Pill>}>Final wager</SectionTitle>
      <Card className="p-4">
        <p className="mb-3 text-sm text-muted">
          Back the castaway you think will win the season and wager {w.minStake}–{w.maxStake} points. If you&apos;re right you gain what you wagered; if you&apos;re wrong you lose it. Everyone&apos;s pick is hidden from everyone, including the commissioner, until the season ends.
        </p>
        {mine ? (
          <p className="mb-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            Your wager: <strong>{plural(mine.stake, "point")}</strong> on <strong>{castawayName(season, mine.castaway)}</strong>
            {stillIn ? "" : " — they're out of the game, so this can't win any more."}
            <span className="block text-xs text-muted">Only you can see this.</span>
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">{open ? "You haven't placed a wager yet." : "You didn't place a wager, so this won't change your total."}</p>
        )}
        {open ? (
          <ActionForm action={placeWagerAction} submit={mine ? "Change my wager" : "Place my wager"} confirm="Save this wager? You can change it until wagering is locked.">
            <input type="hidden" name="seasonId" value={season.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Who wins the season?">
                <select name="castaway" required defaultValue={mine && stillIn ? mine.castaway : ""} className={inputCls}>
                  <option value="" disabled>Choose a castaway</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label={`Points to wager (${w.minStake}–${w.maxStake})`}>
                <input name="stake" type="number" min={w.minStake} max={w.maxStake} step={1} required defaultValue={mine?.stake ?? ""} inputMode="numeric" className={inputCls} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>
    </section>
  );
}
