import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { AvailabilityBoard, type AvailabilityRow } from "@/components/availability-board";
import { IconArrowRight, IconFlame, IconPlay, IconTrendUp, IconUsers, IconWeek, IconX } from "@/components/icons";
import { ActivityItem, QueueItem, StandingsMini, SwapLine } from "@/components/league";
import { SeasonShell } from "@/components/shell";
import { btnCls, btnGhostCls, inputCls } from "@/components/styles";
import { Card, EmptyState, FilterChips, Movement, PageHeader, ScoreChange, SectionHeader, StatCard, StatusBadge, YouBadge } from "@/components/ui";
import { getSeason } from "@/data";
import { availability, buildPickQueue, castawaySeasonTotal, currentTribeId, latestPublished, pickWindows, standings, teamEpisodeScore } from "@/domain/engine";
import { currentTurn, openWindow, openingSequence, openingTurn, picksRemaining } from "@/domain/picks";
import type { QueueStatus, Season } from "@/domain/types";
import { episodeLabel, plural, seasonPath } from "@/lib/format";
import { reminderMailto, siteOrigin } from "@/lib/mail";
import { castawayName, exitLabel, teamOf } from "@/lib/view";
import { closeWindowAction, skipTurnAction } from "@/server/actions";
import { getAccess, getMember } from "@/server/auth";

export const metadata = { title: "This Week" };

interface QueueRow {
  sequence: number;
  teamId: string;
  pointsAtOpen: number;
  rankAtOpen: number;
  openSlots: number;
  status: QueueStatus;
  note?: string;
}

/** Availability rows for the board: league-wide capacity from the engine, plus where each castaway is now. */
function availabilityRows(season: Season, effectiveEp: number, ptsThrough: number | null): AvailabilityRow[] {
  const tribeEp = Math.max(latestPublished(season), 1);
  return availability(season, effectiveEp)
    .map((a) => {
      const tribe = season.tribes.find((t) => t.id === currentTribeId(season, a.castaway.id, tribeEp));
      return {
        id: a.castaway.id,
        name: a.castaway.name,
        href: seasonPath(season.id, `/castaways/${a.castaway.id}`),
        tribeName: tribe?.name ?? "",
        tribeColor: tribe?.color ?? "var(--muted)",
        pts: ptsThrough === null ? null : castawaySeasonTotal(season, a.castaway.id, ptsThrough),
        owners: a.owners,
        cap: season.config.ownershipCap,
        capacityLeft: a.capacityLeft,
        blockedReason: a.blockedReason,
      };
    })
    .sort((a, b) => Number(!!a.blockedReason) - Number(!!b.blockedReason) || (ptsThrough === null ? a.name.localeCompare(b.name) : (b.pts ?? 0) - (a.pts ?? 0)));
}

export default async function ThisWeek({ params, searchParams }: { params: Promise<{ season: string }>; searchParams: Promise<{ window?: string; show?: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const q = await searchParams;
  const [access, me] = await Promise.all([getAccess(season.id), getMember(season.id)]);
  const admin = !!access;

  if (season.status === "OPENING_SELECTION") return <DraftBoard season={season} admin={admin} me={me} />;

  const windows = [...new Set([...pickWindows(season), ...season.windows.map((w) => w.afterEpisode)])].sort((a, b) => a - b);
  if (windows.length === 0) {
    return (
      <SeasonShell season={season} active="/this-week">
        <PageHeader eyebrow={season.name} title="This Week" />
        <EmptyState icon={<IconWeek size={22} />} title="No pick window yet">
          {season.status === "SETUP"
            ? "This season is still being set up. Once the draft is done and an episode is published, the commissioner opens a pick window and the pick order, activity and who's available appear here."
            : "After an episode is published, the commissioner opens a pick window. The pick order, activity and who's available appear here."}
        </EmptyState>
      </SeasonShell>
    );
  }

  const live = openWindow(season);
  const requested = Number(q.window);
  const W = windows.includes(requested) ? requested : (live?.afterEpisode ?? windows[windows.length - 1]);
  const effectiveEp = W + 1;
  const show = q.show === "open" || q.show === "out" ? q.show : "all";
  const pw = season.windows.find((w) => w.afterEpisode === W);
  const archivedView = !pw; // older seasons only recorded who picked, so their queue is rebuilt
  const closed = pw ? pw.status === "CLOSED" : true;

  const snapshot = standings(season, W);
  const picks = season.transactions.filter((t) => t.windowAfterEpisode === W).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const picksByTeam = (id: string) => picks.filter((p) => p.team === id);
  const exits = season.statusEvents.filter((s) => s.afterEpisode === W);
  const high = season.teams.map((t) => ({ t, pts: teamEpisodeScore(season, t.id, W) })).sort((a, b) => b.pts - a.pts)[0];
  const climber = [...snapshot].filter((r) => (r.movement ?? 0) > 0).sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0))[0];

  const rows: QueueRow[] = pw
    ? pw.turns.map((t) => ({ sequence: t.sequence, teamId: t.teamId, pointsAtOpen: t.pointsAtOpen, rankAtOpen: t.rankAtOpen, openSlots: t.openSlots, status: t.status, note: t.skipReason }))
    : buildPickQueue(season, W).map((e) => ({
        sequence: e.sequence,
        teamId: e.teamId,
        pointsAtOpen: e.pointsAtOpen,
        rankAtOpen: e.rankAtOpen,
        openSlots: e.openSlots,
        status: picksByTeam(e.teamId).length ? "COMPLETED" : e.eligible ? "PASSED" : "AUTO_SKIPPED",
        note: e.eligible ? undefined : e.skipReason,
      }));
  const skipped = rows.filter((r) => r.status === "AUTO_SKIPPED").length;
  const remaining = rows.filter((r) => r.status === "WAITING" || r.status === "UP_NOW").length;
  const pickers = new Set(picks.map((p) => p.team)).size;

  // Activity grouped by consecutive picks from the same team, in the order they were made.
  const turns = picks.reduce<{ team: string; items: typeof picks }[]>((acc, p) => {
    const last = acc.at(-1);
    if (last && last.team === p.team) last.items.push(p);
    else acc.push({ team: p.team, items: [p] });
    return acc;
  }, []);
  const cap = season.config.ownershipCap;

  const up = pw && currentTurn(pw);
  const origin = admin && up ? await siteOrigin() : "";
  const mineInQueue = me ? rows.find((r) => r.teamId === me) : undefined;

  return (
    <SeasonShell season={season} active="/this-week">
      <PageHeader
        eyebrow={<>{season.name} <span className="text-muted">·</span> Pick window</>}
        title={`After ${episodeLabel(season, W)}`}
        meta={
          <>
            <StatusBadge tone={closed ? "neutral" : "accent"}>
              {closed ? "■ Window closed" : <><span aria-hidden className="size-1.5 animate-shimmer rounded-full bg-accent-strong" /> Window open</>}
            </StatusBadge>
            <StatusBadge>Picks count from {episodeLabel(season, effectiveEp)}</StatusBadge>
          </>
        }
      >
        Earlier episodes keep the rosters they were scored with. There&apos;s no time limit on a turn — the league picks at its own pace.
      </PageHeader>

      {windows.length > 1 ? (
        <div className="mb-5 flex min-w-0 items-center gap-3">
          <span className="eyebrow hidden shrink-0 text-muted sm:inline">Window</span>
          <div className="min-w-0 flex-1">
            <FilterChips label="Pick window" active={W} href={(v) => `${seasonPath(season.id, "/this-week")}?window=${v}`} items={windows.map((w) => ({ value: w, label: `Ep ${w}` }))} />
          </div>
        </div>
      ) : null}

      {/* Weekly status board */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Picks made" value={picks.length} sub={`by ${plural(pickers, "team")}`} />
        <StatCard label="Teams remaining" value={closed ? "—" : remaining} sub={closed ? "Window closed" : `of ${rows.length} in the queue`} tone={!closed && remaining ? "accent" : "default"} />
        <StatCard label="Auto-skipped" value={skipped} sub="nothing to replace" />
        <StatCard
          icon={<IconX size={13} className="text-bad" />}
          label="Left the game"
          value={exits.length}
          sub={exits.length ? exits.map((x) => castawayName(season, x.castaway)).join(", ") : "No one"}
        />
        <StatCard icon={<IconFlame size={13} className="text-ember" />} label={`${episodeLabel(season, W)} high`} value={high ? <ScoreChange n={high.pts} /> : "—"} sub={high ? high.t.member : undefined} />
        <StatCard icon={<IconTrendUp size={13} className="text-good" />} label="Biggest climb" value={climber ? <Movement value={climber.movement} className="text-[1.5rem]" /> : "—"} sub={climber ? teamOf(season, climber.teamId).member : "None"} />
      </div>

      {exits.length ? (
        <ul className="-mt-3 mb-6 flex flex-wrap gap-2" aria-label="Left the game">
          {exits.map((x) => (
            <li key={x.castaway}>
              <Link href={seasonPath(season.id, `/castaways/${x.castaway}`)} className="inline-flex items-center gap-1.5 rounded-full border border-bad/40 bg-bad/10 px-3 py-1 text-xs font-semibold text-bad hover:bg-bad/15">
                {castawayName(season, x.castaway)} · {exitLabel(x)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {up ? (
        <Card tone="accent" className="mb-8 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1.5 text-accent-strong"><IconPlay size={12} /> Up now · position {up.sequence} of {pw!.turns.length}</p>
              <p className="display mt-1 flex flex-wrap items-center gap-x-2 text-2xl font-extrabold uppercase leading-tight sm:text-3xl">
                {teamOf(season, up.teamId).name}
                {me === up.teamId ? <YouBadge /> : null}
              </p>
              <p className="text-sm text-ink-2">
                {teamOf(season, up.teamId).member} · {plural(up.picks, "pick")} made · {plural(picksRemaining(season, up.teamId, effectiveEp), "replacement")} available · no time limit
              </p>
            </div>
            {me === up.teamId ? (
              <Link href={seasonPath(season.id, "/my")} className={btnCls}>
                Make your picks <IconArrowRight size={16} />
              </Link>
            ) : null}
          </div>
          {admin ? (
            <div className="mt-4 grid gap-3 border-t border-accent/25 pt-4">
              <p className="eyebrow text-muted">Commissioner</p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  className={btnGhostCls}
                  href={reminderMailto({ member: teamOf(season, up.teamId).member, seasonName: season.name, what: `make your pick${picksRemaining(season, up.teamId, effectiveEp) > 1 ? "s" : ""} after ${episodeLabel(season, W)}`, url: `${origin}${seasonPath(season.id, "/my")}` })}
                >
                  ✉ Email a reminder
                </a>
                <span className="text-xs text-muted">Optional. Opens your email app with the message written.</span>
              </div>
              <ActionForm action={skipTurnAction} submit="Skip this team" ghost confirm={`Skip ${teamOf(season, up.teamId).member}'s turn? They lose the rest of this window.`}>
                <input type="hidden" name="seasonId" value={season.id} />
                <Field label="Reason (optional)"><input name="reason" className={`${inputCls} max-w-md`} /></Field>
              </ActionForm>
              <ActionForm action={closeWindowAction} submit="Close this window" ghost confirm="Close the window now? Teams that haven't picked are marked as passed.">
                <input type="hidden" name="seasonId" value={season.id} />
              </ActionForm>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="queue-title">
          <SectionHeader id="queue-title" aside={mineInQueue ? <span className="flex items-center gap-1.5">You pick <strong className="num text-ink">#{mineInQueue.sequence}</strong></span> : "Fewest points picks first"}>
            Pick order
          </SectionHeader>
          <ol>
            {rows.map((e) => {
              const mine = picksByTeam(e.teamId);
              const t = teamOf(season, e.teamId);
              return (
                <QueueItem
                  key={e.teamId}
                  position={e.sequence}
                  status={e.status}
                  // An archived window only records who picked; a team with no pick may have passed or run out of time.
                  label={archivedView && e.status === "PASSED" ? "No pick recorded" : undefined}
                  team={t.name}
                  member={t.member}
                  meta={<><span className="num">{e.pointsAtOpen}</span> pts · rank <span className="num">{e.rankAtOpen}</span></>}
                  mine={e.teamId === me}
                >
                  {mine.length ? (
                    <ul className="grid gap-1">
                      {mine.map((p) => (
                        <li key={p.id}><SwapLine out={castawayName(season, p.out)} into={castawayName(season, p.in)} slot={season.slots[p.slot].name} free={p.free} /></li>
                      ))}
                    </ul>
                  ) : e.status === "WAITING" || e.status === "UP_NOW" ? (
                    <p className="text-muted">Has {plural(e.openSlots, "open slot")} to fill</p>
                  ) : e.status === "PASSED" && e.note ? (
                    <p className="text-muted">{e.note}</p>
                  ) : e.status === "PASSED" && e.openSlots > 0 ? (
                    <p className="text-muted">Had {plural(e.openSlots, "open slot")}; {archivedView ? "no pick recorded" : "passed"}</p>
                  ) : null}
                </QueueItem>
              );
            })}
          </ol>
          {skipped ? (
            <p className="mt-3 text-xs text-muted">
              Auto-skipped: {[...new Set(rows.filter((r) => r.status === "AUTO_SKIPPED").map((r) => r.note ?? "no eligible pick"))].join("; ")}.
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-muted">
            {archivedView
              ? "The reference workbook recorded who picked, but not the queue used at the time. This order is rebuilt from the published standings and the season's tie rule."
              : "This order was saved when the window opened and doesn't change if a score is corrected later."}
          </p>
        </section>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8">
          <section aria-labelledby="activity-title">
            <SectionHeader id="activity-title" aside="In the order picked">Activity</SectionHeader>
            {turns.length === 0 ? (
              <EmptyState compact icon={<IconUsers size={20} />}>No picks have been made in this window yet.</EmptyState>
            ) : (
              <Card>
                <ol className="divide-y divide-line">
                  {turns.map((turn, i) => (
                    <ActivityItem key={i} member={teamOf(season, turn.team).member} team={teamOf(season, turn.team).name} count={turn.items.length}>
                      {turn.items.map((p) => (
                        <li key={p.id}>
                          <SwapLine out={castawayName(season, p.out)} into={castawayName(season, p.in)} slot={season.slots[p.slot].name} free={p.free} />
                          {p.date ? <span className="text-xs text-muted">{p.date}</span> : null}
                        </li>
                      ))}
                    </ActivityItem>
                  ))}
                </ol>
              </Card>
            )}
          </section>

          <section aria-labelledby="snapshot-title">
            <SectionHeader id="snapshot-title" aside={<Link href={seasonPath(season.id)} className="hover:text-ink">Full leaderboard →</Link>}>
              Standings · {episodeLabel(season, W)}
            </SectionHeader>
            <Card className="overflow-hidden">
              <StandingsMini season={season} rows={snapshot} me={me} />
            </Card>
          </section>
        </div>
      </div>

      <section className="mt-10" aria-labelledby="avail-title">
        <SectionHeader id="avail-title" description="League-wide capacity only. When it's your turn, your own pick list also shows what's legal for your roster." aside={`Cap ${cap} owners per castaway`}>
          Who&apos;s available
        </SectionHeader>
        <AvailabilityBoard rows={availabilityRows(season, effectiveEp, W)} initialShow={show} />
      </section>
    </SeasonShell>
  );
}

/** The opening draft, shown publicly: the order, who is up, and every pick so far. */
async function DraftBoard({ season, admin, me }: { season: Season; admin: boolean; me: string | null }) {
  const turn = openingTurn(season);
  const seq = openingSequence(season);
  const picks = season.opening.picks;
  const origin = admin && turn ? await siteOrigin() : "";
  const n = season.teams.length;
  const rounds = Array.from({ length: Math.ceil(seq.length / Math.max(n, 1)) }, (_, r) => seq.slice(r * n, r * n + n).map((teamId, i) => ({ teamId, i: r * n + i })));
  const myNext = me ? seq.findIndex((t, i) => t === me && i >= picks.length) : -1;

  return (
    <SeasonShell season={season} active="/this-week">
      <PageHeader
        eyebrow={<>{season.name} <span className="text-muted">·</span> Opening draft</>}
        title="The draft"
        meta={<StatusBadge tone="accent"><span aria-hidden className="size-1.5 animate-shimmer rounded-full bg-accent-strong" /> Draft live</StatusBadge>}
      >
        One castaway per turn, {season.config.openingRoundMode === "SNAKE" ? "reversing the order every round" : "in the same order every round"}. There&apos;s no time limit on a pick.
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Picks made" value={`${picks.length}`} sub={`of ${seq.length}`} />
        <StatCard label="Round" value={turn ? turn.round : "—"} sub={`of ${season.slots.length}`} />
        <StatCard label="Teams" value={n} sub={`${season.slots.length} slots each`} />
        <StatCard label="Your next pick" value={myNext >= 0 ? `#${myNext + 1}` : "—"} sub={me ? (myNext >= 0 ? (myNext === picks.length ? "You're up" : `${plural(myNext - picks.length, "pick")} away`) : "All done") : "Sign in to see yours"} tone={me && myNext === picks.length ? "accent" : "default"} />
      </div>

      {turn ? (
        <Card tone="accent" className="mb-8 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1.5 text-accent-strong"><IconPlay size={12} /> Up now · pick {turn.index + 1} of {turn.total} · round {turn.round} of {season.slots.length}</p>
              <p className="display mt-1 flex flex-wrap items-center gap-x-2 text-2xl font-extrabold uppercase leading-tight sm:text-3xl">
                {teamOf(season, turn.teamId).name}
                {me === turn.teamId ? <YouBadge /> : null}
              </p>
              <p className="text-sm text-ink-2">{teamOf(season, turn.teamId).member}</p>
            </div>
            {me === turn.teamId ? <Link href={seasonPath(season.id, "/my")} className={btnCls}>Make your pick <IconArrowRight size={16} /></Link> : null}
          </div>
          {admin ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-accent/25 pt-4">
              <a className={btnGhostCls} href={reminderMailto({ member: teamOf(season, turn.teamId).member, seasonName: season.name, what: "make your draft pick", url: `${origin}${seasonPath(season.id, "/my")}` })}>
                ✉ Email a reminder
              </a>
              <span className="text-xs text-muted">Optional. Opens your email app with the message written.</span>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="draft-order">
          <SectionHeader id="draft-order" aside={`${picks.length} of ${seq.length} picks made`}>Pick order</SectionHeader>
          <div className="grid gap-5">
            {rounds.map((round, r) => (
              <div key={r}>
                <p className="eyebrow mb-2 text-muted">Round {r + 1}</p>
                <ol>
                  {round.map(({ teamId, i }) => {
                    const pick = picks[i];
                    const t = teamOf(season, teamId);
                    const now = turn?.index === i;
                    return (
                      <QueueItem key={i} position={i + 1} status={pick ? "COMPLETED" : now ? "UP_NOW" : "WAITING"} team={t.name} member={t.member} mine={teamId === me}>
                        {pick ? (
                          <p>
                            <strong className="text-ink">{castawayName(season, pick.castaway)}</strong> <span className="text-muted">· {season.slots[pick.slot].name} slot</span>
                          </p>
                        ) : null}
                      </QueueItem>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="draft-avail">
          <SectionHeader id="draft-avail" aside={`Cap ${season.config.ownershipCap} owners`}>Who&apos;s available</SectionHeader>
          <AvailabilityBoard rows={availabilityRows(season, 1, null)} />
        </section>
      </div>
    </SeasonShell>
  );
}
