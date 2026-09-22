import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { SeasonShell } from "@/components/shell";
import { Card, Chips, EmptyNote, Movement, PageTitle, Pill, RankMark, SectionTitle, Signed } from "@/components/ui";
import { getSeason } from "@/data";
import { availability, buildPickQueue, castawaySeasonTotal, pickWindows, standings, teamEpisodeScore } from "@/domain/engine";
import { currentTurn, openWindow, openingSequence, openingTurn, picksRemaining } from "@/domain/picks";
import type { QueueStatus, Season } from "@/domain/types";
import { episodeLabel, plural, seasonPath } from "@/lib/format";
import { reminderMailto, siteOrigin } from "@/lib/mail";
import { castawayName, exitLabel, teamOf } from "@/lib/view";
import { closeWindowAction, skipTurnAction } from "@/server/actions";
import { getAccess, getMember } from "@/server/auth";

export const metadata = { title: "This Week" };

const statusView: Record<QueueStatus, { icon: string; label: string; tone: "neutral" | "accent" | "good" | "bad" }> = {
  WAITING: { icon: "○", label: "Waiting", tone: "neutral" },
  UP_NOW: { icon: "▶", label: "Up now", tone: "accent" },
  COMPLETED: { icon: "✓", label: "Picked", tone: "good" },
  PASSED: { icon: "↷", label: "Passed", tone: "neutral" },
  AUTO_SKIPPED: { icon: "⏭", label: "Auto-skipped", tone: "neutral" },
};

interface QueueRow {
  sequence: number;
  teamId: string;
  pointsAtOpen: number;
  rankAtOpen: number;
  openSlots: number;
  status: QueueStatus;
  note?: string;
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
        <PageTitle eyebrow={season.name} title="This Week" />
        <EmptyNote>
          No pick window has been opened yet. After an episode is published, the commissioner opens a window; the pick order, activity and who&apos;s available appear here.
        </EmptyNote>
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

  const avail = availability(season, effectiveEp)
    .map((a) => ({ ...a, pts: castawaySeasonTotal(season, a.castaway.id, W) }))
    .filter((a) => (show === "open" ? !a.blockedReason : show === "out" ? !!a.blockedReason : true))
    .sort((a, b) => Number(!!a.blockedReason) - Number(!!b.blockedReason) || b.pts - a.pts);

  // Activity grouped by consecutive picks from the same team, in the order they were made.
  const turns = picks.reduce<{ team: string; items: typeof picks }[]>((acc, p) => {
    const last = acc.at(-1);
    if (last && last.team === p.team) last.items.push(p);
    else acc.push({ team: p.team, items: [p] });
    return acc;
  }, []);
  const cap = season.config.ownershipCap;
  const href = (over: Record<string, string | number>) => {
    const sp = new URLSearchParams({ window: String(W), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    if (sp.get("show") === "all") sp.delete("show");
    return `${seasonPath(season.id, "/this-week")}?${sp}`;
  };

  const up = pw && currentTurn(pw);
  const origin = admin && up ? await siteOrigin() : "";

  return (
    <SeasonShell season={season} active="/this-week">
      <PageTitle eyebrow={`${season.name} · pick window`} title={`After ${episodeLabel(season, W)}`}>
        Picks made here count from {episodeLabel(season, effectiveEp)}. Earlier episodes keep the rosters they were scored with.
      </PageTitle>

      {up ? (
        <Card className="mb-6 border-accent/60 bg-accent/10 p-4">
          <p className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">▶ Up now</Pill>
            <span className="display text-xl font-bold">{teamOf(season, up.teamId).name}</span>
            <span className="text-muted">· {teamOf(season, up.teamId).member}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Position {up.sequence} of {pw!.turns.length} · {plural(up.picks, "pick")} made · {plural(picksRemaining(season, up.teamId, effectiveEp), "replacement")} available. No time limit.
          </p>
          {me === up.teamId ? (
            <Link href={seasonPath(season.id, "/my")} className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">Make your picks →</Link>
          ) : null}
          {admin ? (
            <div className="mt-4 grid gap-3 border-t border-accent/30 pt-4">
              <div className="flex flex-wrap gap-2">
                <a
                  className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2"
                  href={reminderMailto({ member: teamOf(season, up.teamId).member, seasonName: season.name, what: `make your pick${picksRemaining(season, up.teamId, effectiveEp) > 1 ? "s" : ""} after ${episodeLabel(season, W)}`, url: `${origin}${seasonPath(season.id, "/my")}` })}
                >
                  ✉ Email a reminder
                </a>
                <span className="self-center text-xs text-muted">Optional. Opens your email app with the message written.</span>
              </div>
              <ActionForm action={skipTurnAction} submit="Skip this team" ghost confirm={`Skip ${teamOf(season, up.teamId).member}'s turn? They lose the rest of this window.`}>
                <input type="hidden" name="seasonId" value={season.id} />
                <Field label="Reason (optional)"><input name="reason" className={inputCls} /></Field>
              </ActionForm>
              <ActionForm action={closeWindowAction} submit="Close this window" ghost confirm="Close the window now? Teams that haven't picked are marked as passed.">
                <input type="hidden" name="seasonId" value={season.id} />
              </ActionForm>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">Window</span>
        <Chips label="Pick window" active={W} href={(v) => `${seasonPath(season.id, "/this-week")}?window=${v}`} items={windows.map((w) => ({ value: w, label: `Ep ${w}` }))} />
      </div>

      <Card className="mb-8 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={closed ? "neutral" : "accent"}>{closed ? "■ Window closed" : "▶ Window open"}</Pill>
          <span className="text-sm text-muted">
            {plural(picks.length, "pick")} by {plural(new Set(picks.map((p) => p.team)).size, "team")} · {plural(skipped, "team")} auto-skipped
          </span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted">Left the game</dt>
            <dd className="mt-0.5">{exits.length ? exits.map((x) => `${castawayName(season, x.castaway)} (${exitLabel(x).toLowerCase()})`).join(", ") : "No one"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted">Episode high</dt>
            <dd className="mt-0.5">{high.t.member} <Signed n={high.pts} className="font-semibold" /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted">Biggest climb</dt>
            <dd className="mt-0.5">{climber ? <>{teamOf(season, climber.teamId).member} <Movement value={climber.movement} /></> : "None"}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle aside="Fewest points picks first">Pick order</SectionTitle>
          <Card className="overflow-hidden">
            <ol>
              {rows.map((e) => {
                // An archived window only records who picked; a team with no pick may have passed or run out of time.
                const v = archivedView && e.status === "PASSED" ? { ...statusView.PASSED, label: "No pick recorded" } : statusView[e.status];
                const mine = picksByTeam(e.teamId);
                const t = teamOf(season, e.teamId);
                return (
                  <li key={e.teamId} className={`flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0 ${e.status === "UP_NOW" ? "bg-accent/[0.07]" : ""}`}>
                    <span className="display num w-6 pt-0.5 text-center text-base font-bold text-muted">{e.sequence}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className="text-sm text-muted">
                        {t.member} · <span className="num">{e.pointsAtOpen}</span> pts · rank <span className="num">{e.rankAtOpen}</span>
                      </p>
                      {mine.length ? (
                        <p className="mt-0.5 text-sm">{mine.map((p) => `${castawayName(season, p.out)} → ${castawayName(season, p.in)}`).join("; ")}</p>
                      ) : e.status === "AUTO_SKIPPED" || e.note ? (
                        <p className="mt-0.5 text-sm text-muted">{e.note}</p>
                      ) : e.status === "WAITING" || e.status === "UP_NOW" ? (
                        <p className="mt-0.5 text-sm text-muted">Has {plural(e.openSlots, "open slot")}</p>
                      ) : (
                        <p className="mt-0.5 text-sm text-muted">Had {plural(e.openSlots, "open slot")}; {archivedView ? "no pick recorded" : "passed"}</p>
                      )}
                    </div>
                    <Pill tone={v.tone}><span aria-hidden>{v.icon}</span> {v.label}</Pill>
                  </li>
                );
              })}
            </ol>
          </Card>
          {archivedView ? (
            <p className="mt-2 text-xs text-muted">
              The reference workbook recorded who picked, but not the queue used at the time. This order is rebuilt from the published standings and the season&apos;s tie rule.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">This order was saved when the window opened and doesn&apos;t change if a score is corrected later.</p>
          )}
        </section>

        <section>
          <SectionTitle aside={<Link href={seasonPath(season.id)} className="hover:text-ink">Full leaderboard →</Link>}>Standings after {episodeLabel(season, W)}</SectionTitle>
          <Card className="overflow-hidden">
            <ol>
              {snapshot.map((r) => (
                <li key={r.teamId} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <span className="flex w-11 flex-col items-center leading-none">
                    <RankMark rank={r.rank} tied={r.tied} />
                    <Movement value={r.movement} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{teamOf(season, r.teamId).name}</span>
                    <span className="block text-sm text-muted">{teamOf(season, r.teamId).member}</span>
                  </span>
                  <Signed n={r.latest} className="text-sm" />
                  <span className="display num w-12 text-right text-xl font-extrabold">{r.total}</span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle aside="Order picked, as recorded">Activity</SectionTitle>
        {turns.length === 0 ? (
          <EmptyNote>No picks have been made yet.</EmptyNote>
        ) : (
          <ol className="relative ml-2 border-l border-line pl-5">
            {turns.map((turn, i) => (
              <li key={i} className="mb-4 last:mb-0">
                <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-accent" />
                <p className="font-semibold">
                  {teamOf(season, turn.team).member}
                  {turn.items.length > 1 ? <span className="ml-2 align-middle"><Pill tone="accent">{turn.items.length} picks in one turn</Pill></span> : null}
                </p>
                <ul className="text-sm">
                  {turn.items.map((p) => (
                    <li key={p.id}>
                      Took <strong>{castawayName(season, p.in)}</strong> for {castawayName(season, p.out)}
                      <span className="text-muted">
                        {" "}· {season.slots[p.slot].name} slot{p.date ? ` · ${p.date}` : ""}
                        {p.free ? " · free pick, no swap used" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Availability season={season} avail={avail} cap={cap} show={show} href={href} caption={`After this window · cap ${cap} owners`} />
    </SeasonShell>
  );
}

function Availability({
  season,
  avail,
  cap,
  show,
  href,
  caption,
}: {
  season: Season;
  avail: { castaway: { id: string; name: string }; owners: number; capacityLeft: number; blockedReason?: string; pts: number }[];
  cap: number;
  show: string;
  href: (over: Record<string, string | number>) => string;
  caption: string;
}) {
  return (
    <section className="mt-10">
      <SectionTitle aside={caption}>Who&apos;s available</SectionTitle>
      <div className="mb-3">
        <Chips label="Availability filter" active={show} href={(v) => href({ show: v })} items={[{ value: "all", label: "Everyone" }, { value: "open", label: "Selectable" }, { value: "out", label: "Unavailable" }]} />
      </div>
      <Card className="overflow-hidden">
        <ul>
          {avail.map((a) => (
            <li key={a.castaway.id} className={`flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 ${a.blockedReason ? "opacity-60" : ""}`}>
              <span className="min-w-0 flex-1">
                <Link href={seasonPath(season.id, `/castaways/${a.castaway.id}`)} className="block truncate font-semibold hover:text-accent">{a.castaway.name}</Link>
                <span className="block text-sm text-muted">
                  <span className="num">{a.owners}</span> of <span className="num">{cap}</span> owners · <span className="num">{a.pts}</span> pts
                </span>
              </span>
              {a.blockedReason ? <Pill tone="bad">✕ {a.blockedReason}</Pill> : <Pill tone="good">✓ {plural(a.capacityLeft, "spot")} left</Pill>}
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-2 text-xs text-muted">League-wide capacity only. When it&apos;s your turn, your own pick list also shows what&apos;s legal for your roster.</p>
    </section>
  );
}

/** The opening draft, shown publicly: the order, who is up, and every pick so far. */
async function DraftBoard({ season, admin, me }: { season: Season; admin: boolean; me: string | null }) {
  const turn = openingTurn(season);
  const seq = openingSequence(season);
  const picks = season.opening.picks;
  const avail = availability(season, 1).map((a) => ({ ...a, pts: 0 })).sort((a, b) => Number(!!a.blockedReason) - Number(!!b.blockedReason) || a.castaway.name.localeCompare(b.castaway.name));
  const origin = admin && turn ? await siteOrigin() : "";
  const n = season.teams.length;

  return (
    <SeasonShell season={season} active="/this-week">
      <PageTitle eyebrow={`${season.name} · opening draft`} title="The draft">
        One castaway per turn, {season.config.openingRoundMode === "SNAKE" ? "reversing the order every round" : "in the same order every round"}. There&apos;s no time limit on a pick.
      </PageTitle>

      {turn ? (
        <Card className="mb-8 border-accent/60 bg-accent/10 p-4">
          <p className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">▶ Up now</Pill>
            <span className="display text-xl font-bold">{teamOf(season, turn.teamId).name}</span>
            <span className="text-muted">· {teamOf(season, turn.teamId).member}</span>
          </p>
          <p className="mt-1 text-sm text-muted">Pick {turn.index + 1} of {turn.total} · Round {turn.round} of {season.slots.length}</p>
          {me === turn.teamId ? <Link href={seasonPath(season.id, "/my")} className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">Make your pick →</Link> : null}
          {admin ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-accent/30 pt-4">
              <a
                className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2"
                href={reminderMailto({ member: teamOf(season, turn.teamId).member, seasonName: season.name, what: "make your draft pick", url: `${origin}${seasonPath(season.id, "/my")}` })}
              >
                ✉ Email a reminder
              </a>
              <span className="text-xs text-muted">Optional. Opens your email app with the message written.</span>
            </div>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle aside={`${picks.length} of ${seq.length} picks made`}>Pick order</SectionTitle>
      <Card className="overflow-hidden">
        <ol>
          {seq.map((teamId, i) => {
            const pick = picks[i];
            const t = teamOf(season, teamId);
            const now = turn?.index === i;
            return (
              <li key={i}>
                {i % n === 0 ? <p className="border-b border-line bg-surface-2 px-4 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Round {i / n + 1}</p> : null}
                <div className={`flex items-center gap-3 border-b border-line px-4 py-2 text-sm last:border-b-0 ${now ? "bg-accent/[0.07]" : ""}`}>
                  <span className="display num w-6 text-center font-bold text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{t.member}</span>
                    <span className="text-muted"> · {t.name}</span>
                  </span>
                  {pick ? (
                    <span><strong>{castawayName(season, pick.castaway)}</strong> <span className="text-muted">· {season.slots[pick.slot].name}</span></span>
                  ) : now ? (
                    <Pill tone="accent">▶ Up now</Pill>
                  ) : (
                    <Pill>○ Waiting</Pill>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Availability season={season} avail={avail} cap={season.config.ownershipCap} show="all" href={() => seasonPath(season.id, "/this-week")} caption={`Cap ${season.config.ownershipCap} owners`} />
    </SeasonShell>
  );
}
