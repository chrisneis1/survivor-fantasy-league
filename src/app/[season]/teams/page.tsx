import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowRight, IconTeams } from "@/components/icons";
import { RosterSlot } from "@/components/league";
import { SeasonShell } from "@/components/shell";
import { EmptyState, Monogram, PageHeader, RankBadge, YouBadge } from "@/components/ui";
import { getSeason } from "@/data";
import { currentTribeId, effectiveRoster, isActiveAt, latestPublished, standings, statusEventFor } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { castawayName, exitLabel, teamOf } from "@/lib/view";
import { getMember } from "@/server/auth";

export const metadata = { title: "Teams" };

export default async function Teams({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const me = await getMember(season.id);
  const last = season.episodes.length;
  const scored = latestPublished(season) > 0;
  const rows = standings(season);
  const tribeEp = Math.max(latestPublished(season), 1);

  return (
    <SeasonShell season={season} active="/teams">
      <PageHeader eyebrow={season.name} title="Teams">
        {season.teams.length
          ? `${season.teams.length} teams, ranked by total points. Each card shows the current roster in slot order; castaways marked Out have left the game.`
          : null}
      </PageHeader>

      {season.teams.length === 0 ? (
        <EmptyState icon={<IconTeams size={22} />} title="No teams yet">
          Teams appear here once the commissioner adds this season&apos;s players in Setup.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const t = teamOf(season, r.teamId);
            const roster = effectiveRoster(season, t.id, last);
            const mine = t.id === me;
            return (
              <li key={t.id}>
                <Link
                  href={seasonPath(season.id, `/teams/${t.id}`)}
                  className={`group flex h-full flex-col rounded-[var(--radius-card)] border bg-surface p-4 shadow-card transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-surface-2 ${mine ? "border-accent/50" : "border-line"}`}
                >
                  <div className="flex items-start gap-3">
                    {scored ? <RankBadge rank={r.rank} tied={r.tied} /> : <Monogram name={t.name} size="md" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="line-clamp-2 font-semibold leading-snug text-ink">{t.name}</span>
                        {mine ? <YouBadge /> : null}
                      </p>
                      <p className="truncate text-sm text-muted">{t.member}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="display num text-3xl font-extrabold leading-none">{scored ? r.total : "—"}</p>
                      <p className="mt-0.5 text-[11px] text-muted">pts</p>
                    </div>
                  </div>
                  <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] border-t border-line pt-2">
                    {season.slots.map((slot, i) => {
                      const cid = roster[i];
                      if (!cid) return <RosterSlot key={slot.id} compact slotName={slot.name} />;
                      const tribe = season.tribes.find((x) => x.id === currentTribeId(season, cid, tribeEp));
                      const exit = !isActiveAt(season, cid, last + 1) ? statusEventFor(season, cid) : undefined;
                      return (
                        <RosterSlot
                          key={slot.id}
                          compact
                          slotName={slot.name}
                          name={castawayName(season, cid)}
                          tribe={tribe}
                          out={exit ? `${exitLabel(exit)} after ${episodeLabel(season, exit.afterEpisode)}` : undefined}
                        />
                      );
                    })}
                  </ul>
                  <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold text-muted transition-colors group-hover:text-accent">
                    Team profile <IconArrowRight size={14} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SeasonShell>
  );
}
