import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { btnCls, btnGhostCls, inputCls } from "@/components/styles";
import { PickPanel } from "@/components/pick-panel";
import { SeasonShell } from "@/components/shell";
import { IconArrowRight, IconMyTeam } from "@/components/icons";
import { RosterSlot, SwapLine } from "@/components/league";
import { Card, EmptyState, PageHeader, RankBadge, StatCard, StatusBadge, SectionHeader } from "@/components/ui";
import { getSeason } from "@/data";
import { currentTribeId, effectiveRoster, isActiveAt, latestPublished, standings, statusEventFor } from "@/domain/engine";
import { currentTurn, openWindow, openingSequence, openingTurn, openingTurnStuck, picksRemaining } from "@/domain/picks";
import { episodeLabel, plural, seasonPath } from "@/lib/format";
import { openingPanel, replacementPanel } from "@/lib/picker";
import { castawayName, exitLabel, teamOf } from "@/lib/view";
import { wagerCandidates, wagerDeadlineEpisode } from "@/domain/wager";
import { store } from "@/server";
import { changeMyPasswordAction, placeWagerAction, renameMyTeamAction, userSignOutAction } from "@/server/actions";
import { getMember, getUser } from "@/server/auth";
import { MIN_PASSWORD_LENGTH } from "@/server/session";
import type { Season } from "@/domain/types";

export const metadata = { title: "My Team" };

export default async function MyTeam({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const [teamId, user] = await Promise.all([getMember(season.id), getUser()]);

  if (!teamId) {
    return (
      <SeasonShell season={season} active="/my">
        <PageHeader eyebrow={season.name} title="My Team" />
        <EmptyState
          icon={<IconMyTeam size={22} />}
          title={user ? "No team assigned yet" : "This page is for team owners"}
          action={
            user ? null : (
              <span className="flex flex-wrap justify-center gap-2">
                <Link href={`/login?next=${encodeURIComponent(seasonPath(season.id, "/my"))}`} className={btnCls}>Sign in</Link>
                <Link href={`/signup?next=${encodeURIComponent(seasonPath(season.id, "/my"))}`} className={btnGhostCls}>Create an account</Link>
              </span>
            )
          }
        >
          {user
            ? <>Your account isn&apos;t assigned to a team in {season.name} yet — ask your commissioner to assign it from Members.</>
            : "Sign in or create an account, then ask your commissioner to assign it to your team."}
        </EmptyState>
        {user ? <div className="mt-8 max-w-2xl"><PasswordCard /></div> : null}
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
      <PageHeader
        eyebrow={<>My team <span className="text-muted">·</span> {team.member}</>}
        title={team.name}
        actions={<Link href={seasonPath(season.id, `/teams/${teamId}`)} className={btnGhostCls}>Team profile <IconArrowRight size={16} /></Link>}
      >
        {season.status === "OPENING_SELECTION" ? "The draft is under way." : null}
      </PageHeader>

      {season.status !== "OPENING_SELECTION" && row ? (
        <div className="-mt-2 mb-6 grid grid-cols-3 gap-2.5">
          <StatCard label="Rank" value={latestPublished(season) ? <RankBadge rank={row.rank} tied={row.tied} size="sm" /> : "—"} sub={`of ${season.teams.length}`} />
          <StatCard label="Points" value={latestPublished(season) ? row.total : "—"} sub={latestPublished(season) ? `through ${episodeLabel(season, latestPublished(season))}` : "Not scored yet"} />
          <StatCard label="Swaps used" value={<>{swapsUsed}{limit === null ? null : <span className="text-base text-muted"> / {limit}</span>}</>} sub={limit === null ? "no credit limit recorded" : "swap credits"} />
        </div>
      ) : null}

      {/* The action comes first on a phone: banner, then the picker, then everything else. */}
      {season.status === "OPENING_SELECTION" && draftTurn ? (
        <section className="mb-8">
          <Card tone={myTurnToDraft ? "accent" : "default"} className="mb-4 p-4">
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={myTurnToDraft ? "accent" : "neutral"}>{myTurnToDraft ? "▶ You're up" : "○ Waiting"}</StatusBadge>
              <span className="font-semibold">Pick {draftTurn.index + 1} of {draftTurn.total} · Round {draftTurn.round}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {myTurnToDraft ? "Choose a slot, then a castaway. There's no time limit." : `${teamOf(season, draftTurn.teamId).member} is picking. You have ${plural(openingSequence(season).slice(draftTurn.index).filter((t) => t === teamId).length, "pick")} to go.`}
            </p>
          </Card>
          {myTurnToDraft && openingTurnStuck(season) ? (
            <p role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              None of the remaining castaways can go in your open slots, so the draft is stuck on your turn. Let your commissioner know — they can reset the draft and fix the setup.
            </p>
          ) : null}
          {myTurnToDraft ? <PickPanel seasonId={season.id} mode="opening" {...openingPanel(season, teamId)} /> : null}
        </section>
      ) : null}

      {win ? (
        <section className="mb-8">
          <Card tone={myTurnToSwap ? "accent" : "default"} className="mb-4 p-4">
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={myTurnToSwap ? "accent" : "neutral"}>{myTurnToSwap ? "▶ You're up" : myTurns ? "○ " + (myTurns.status === "WAITING" ? "Waiting" : myTurns.status === "AUTO_SKIPPED" ? "Nothing to pick" : "Done") : "○ Not in this window"}</StatusBadge>
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

      <SectionHeader aside={<Link className="hover:text-ink" href={seasonPath(season.id, `/teams/${teamId}`)}>Full team page →</Link>}>Roster</SectionHeader>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
        {season.slots.map((slot, i) => {
          const cid = roster[i];
          if (!cid) return <li key={slot.id}><RosterSlot slotName={slot.name} /></li>;
          const out = !isActiveAt(season, cid, Math.min(effEp, season.episodes.length));
          const exit = out ? statusEventFor(season, cid) : undefined;
          const tribe = season.tribes.find((t) => t.id === currentTribeId(season, cid, Math.max(latestPublished(season), 1)));
          return (
            <li key={slot.id}>
              <RosterSlot
                slotName={slot.name}
                name={castawayName(season, cid)}
                href={seasonPath(season.id, `/castaways/${cid}`)}
                tribe={tribe}
                out={out ? (exit ? `${exitLabel(exit)} · ${episodeLabel(season, exit.afterEpisode)}` : "Out of the game") : undefined}
              />
            </li>
          );
        })}
      </ul>

      {myTx.length ? (
        <section className="mt-8" aria-label="My swaps">
          <SectionHeader>My swaps</SectionHeader>
          <ul className="grid gap-2">
            {myTx.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
                <SwapLine out={castawayName(season, t.out)} into={castawayName(season, t.in)} slot={`${season.slots[t.slot].name} slot`} free={t.free} />
                <span className="text-xs text-muted">Counts from {episodeLabel(season, t.effectiveEpisode)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2">
        <section aria-label="Team name">
          <SectionHeader>Team name</SectionHeader>
          <Card className="p-4">
            <p className="mb-3 text-sm text-muted">Yours to change whenever you like — no rush, and no need to wait for anyone else&apos;s.</p>
            <ActionForm action={renameMyTeamAction} submit="Save" ghost className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="seasonId" value={season.id} />
              <input name="name" defaultValue={team.name} required maxLength={60} aria-label="Team name" className={`${inputCls} max-w-xs`} />
            </ActionForm>
          </Card>
          <form action={userSignOutAction} className="mt-4">
            <button className={btnGhostCls}>Sign out</button>
          </form>
        </section>
        <PasswordCard />
      </div>
    </SeasonShell>
  );
}

/** Change your own password. Needs the current one; other devices signed in as you are signed out. */
function PasswordCard() {
  return (
    <section aria-label="Password">
      <SectionHeader>Password</SectionHeader>
      <Card className="p-4">
        <p className="mb-3 text-sm text-muted">If the commissioner gave you a temporary password, change it here. Any other device signed in as you will be signed out.</p>
        <ActionForm action={changeMyPasswordAction} submit="Change password" ghost resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Field label="Current password">
              <input name="current" type="password" autoComplete="current-password" required className={inputCls} />
            </Field>
            <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
              <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={inputCls} />
            </Field>
            <Field label="New password again">
              <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={inputCls} />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </section>
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
      <SectionHeader aside={<StatusBadge tone={open ? "accent" : "neutral"}>{open ? "Open" : "Locked"}</StatusBadge>}>Final wager</SectionHeader>
      <Card className="p-4">
        <p className="mb-3 text-sm text-muted">
          Back the castaway you think will win the season and wager {w.minStake}–{w.maxStake} points. If you&apos;re right you gain what you wagered; if you&apos;re wrong you lose it. Everyone&apos;s pick is hidden from everyone, including the commissioner, until the season ends.{open ? ` Wagering closes automatically once Episode ${wagerDeadlineEpisode(season)} is scored.` : ""}
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
