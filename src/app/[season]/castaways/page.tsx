import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, Chips, PageTitle, Pill, TribeTag } from "@/components/ui";
import { getSeason } from "@/data";
import { castawaySeasonTotal, ownerCount, statusEventFor } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { exitLabel } from "@/lib/view";

export const metadata = { title: "Castaways" };

export default async function Castaways({ params, searchParams }: { params: Promise<{ season: string }>; searchParams: Promise<{ tribe?: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const tribeFilter = (await searchParams).tribe ?? "all";
  const cap = season.config.ownershipCap;

  const list = season.castaways
    .filter((c) => tribeFilter === "all" || c.initialTribeId === tribeFilter)
    .map((c) => ({
      c,
      total: castawaySeasonTotal(season, c.id),
      exit: statusEventFor(season, c.id),
      drafted: season.teams.filter((t) => t.draft.includes(c.id)).length,
      peak: Math.max(...season.episodes.map((e) => ownerCount(season, c.id, e.number))),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <SeasonShell season={season} active="/castaways">
      <PageTitle eyebrow={season.name} title="Castaways">
        Season points scored, how many teams drafted each castaway, and when they left the game. The ownership cap is {cap} teams per castaway.
      </PageTitle>
      <div className="mb-4">
        <Chips
          label="Filter by starting tribe"
          active={tribeFilter}
          href={(v) => (v === "all" ? seasonPath(season.id, "/castaways") : `${seasonPath(season.id, "/castaways")}?tribe=${v}`)}
          items={[{ value: "all", label: "All" }, ...season.tribes.map((t) => ({ value: t.id, label: t.name }))]}
        />
      </div>
      <Card className="overflow-hidden">
        <ul>
          {list.map(({ c, total, exit, drafted, peak }) => (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <Link href={seasonPath(season.id, `/castaways/${c.id}`)} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_9rem_7rem_4rem]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <TribeTag season={season} castaway={c} />
                    <span className="sm:hidden">
                      {exit ? `${exitLabel(exit)} · ${episodeLabel(season, exit.afterEpisode)}` : "Made the finale"} · drafted by {drafted}
                    </span>
                  </span>
                </span>
                <span className="hidden text-sm sm:block">
                  {exit ? <Pill tone="bad">{exitLabel(exit)} · {episodeLabel(season, exit.afterEpisode)}</Pill> : <Pill tone="good">In the finale</Pill>}
                </span>
                <span className="num hidden text-sm text-muted sm:block">
                  Drafted by {drafted}
                  <span className="block text-xs">peak {peak}/{cap} owners</span>
                </span>
                <span className="display num text-right text-xl font-extrabold">{total}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </SeasonShell>
  );
}
