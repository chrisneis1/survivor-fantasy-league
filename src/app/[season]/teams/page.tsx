import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, RankMark, TribeTag } from "@/components/ui";
import { getSeason } from "@/data";
import { effectiveRoster, isActiveAt, standings } from "@/domain/engine";
import { seasonPath } from "@/lib/format";
import { castawayName, teamOf } from "@/lib/view";

export const metadata = { title: "Teams" };

export default async function Teams({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const last = season.episodes.length;
  const rows = standings(season);
  return (
    <SeasonShell season={season} active="/teams">
      <PageTitle eyebrow={season.name} title="Teams">
        Every team&apos;s roster at the end of the season, in slot order. Struck-through castaways are out of the game.
      </PageTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const t = teamOf(season, r.teamId);
          const roster = effectiveRoster(season, t.id, last);
          return (
            <Link key={t.id} href={seasonPath(season.id, `/teams/${t.id}`)} className="group block">
              <Card className="p-4 transition-colors group-hover:border-accent/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <RankMark rank={r.rank} tied={r.tied} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className="text-sm text-muted">{t.member}</p>
                    </div>
                  </div>
                  <p className="display num text-2xl font-extrabold">{r.total}</p>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {roster.map((cid, i) => {
                    const c = season.castaways.find((x) => x.id === cid)!;
                    return (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className={isActiveAt(season, cid, last + 1) ? "" : "text-muted line-through"}>{castawayName(season, cid)}</span>
                        <TribeTag season={season} castaway={c} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Link>
          );
        })}
      </div>
    </SeasonShell>
  );
}
