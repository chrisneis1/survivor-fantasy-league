import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { PickPanel } from "@/components/pick-panel";
import { Card, PageHeader } from "@/components/ui";
import { getSeason } from "@/data";
import { openingTurn, openingTurnStuck } from "@/domain/picks";
import { openingPanel } from "@/lib/picker";
import { castawayName, teamOf } from "@/lib/view";
import { adminOpeningPickAction } from "@/server/actions";

export const metadata = { title: "Draft board" };

/**
 * The commissioner's live draft screen — built to be shared on a call: one big "who's up" banner, a
 * click-to-pick list (no typing, no reason field, since this is the ordinary way the whole draft gets
 * entered), and a board underneath showing every roster fill in as picks land, in the order set in Setup.
 */
export default async function DraftBoard({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();

  if (season.status === "SETUP") {
    return (
      <AdminShell season={season} active="">
        <PageHeader eyebrow={season.name} title="Draft board">
          The draft hasn&apos;t been launched yet. Finish Setup, then launch it from{" "}
          <Link href={`/admin/${season.id}`} className="text-accent hover:underline">Overview</Link>.
        </PageHeader>
      </AdminShell>
    );
  }

  const turn = openingTurn(season);
  const order = season.config.openingSeed;

  return (
    <AdminShell season={season} active="">
      {turn ? (
        <div className="mb-8">
          <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-accent">Pick {turn.index + 1} of {turn.total} · Round {turn.round}</p>
          <h1 className="display text-4xl font-extrabold uppercase leading-tight sm:text-6xl">{teamOf(season, turn.teamId).member}</h1>
          <p className="mt-1 text-muted">is up — {teamOf(season, turn.teamId).name}. Click a castaway below to fill a slot.</p>
          {openingTurnStuck(season) ? (
            <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              No castaway can legally go in any of this team&apos;s open slots, so the draft can&apos;t continue.{" "}
              <Link href={`/admin/${season.id}`} className="font-semibold underline">Undo the draft from Overview</Link>, fix the slots or ownership cap in Setup, and run it again.
            </p>
          ) : null}
        </div>
      ) : (
        <Card className="mb-8 p-8 text-center">
          <p className="eyebrow mb-1 text-muted">{season.name} · Draft board</p>
          <h1 className="display text-4xl font-extrabold uppercase text-good">Draft complete!</h1>
          <p className="mt-2 text-muted">Every team has a full roster. <Link href={`/admin/${season.id}`} className="text-accent hover:underline">Back to Overview</Link> to keep setting up episodes, or open This Week once an episode is scored.</p>
        </Card>
      )}

      {turn ? (
        <div className="mb-10">
          <PickPanel
            seasonId={season.id}
            mode="opening"
            {...openingPanel(season, turn.teamId)}
            onPick={adminOpeningPickAction.bind(null, season.id, turn.teamId)}
          />
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-bold">Draft board</h2>
        {/* Phones: one row per team with its picks so far, instead of a sideways-scrolling table. */}
        <ul className="grid gap-2 md:hidden">
          {order.map((teamId) => {
            const t = teamOf(season, teamId);
            const isUp = turn?.teamId === teamId;
            return (
              <li key={teamId} className={`rounded-xl border px-3 py-2.5 ${isUp ? "border-accent/60 bg-accent/10" : "border-line bg-surface"}`}>
                <p className="font-semibold">{isUp ? <span className="text-accent">▶ </span> : null}{t.member}</p>
                <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
                  {season.slots.map((sl, i) => (
                    <li key={sl.id} className="rounded-lg border border-line bg-surface-2 px-2 py-0.5">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted">{sl.name}</span>
                      {t.draft[i] ? castawayName(season, t.draft[i]) : <span className="text-muted">—</span>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-line md:block">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2">Team</th>
                {season.slots.map((sl) => <th key={sl.id} className="px-3 py-2">{sl.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {order.map((teamId) => {
                const t = teamOf(season, teamId);
                const isUp = turn?.teamId === teamId;
                return (
                  <tr key={teamId} className={`border-t border-line ${isUp ? "bg-accent/10" : ""}`}>
                    <th scope="row" className={`sticky left-0 z-10 px-3 py-2 text-left font-semibold ${isUp ? "bg-accent/10" : "bg-surface"}`}>
                      {isUp ? <span className="text-accent">▶ </span> : null}{t.member}
                    </th>
                    {season.slots.map((sl, i) => (
                      <td key={sl.id} className="px-3 py-2">{t.draft[i] ? castawayName(season, t.draft[i]) : <span className="text-muted">—</span>}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
