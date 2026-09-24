import { notFound } from "next/navigation";
import { CastawayDirectory, type DirectoryCastaway } from "@/components/castaway-directory";
import { IconCastaways } from "@/components/icons";
import { SeasonShell } from "@/components/shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSeason } from "@/data";
import { castawaySeasonTotal, currentTribeId, latestPublished, ownerCount, statusEventFor } from "@/domain/engine";
import { episodeLabel, seasonPath } from "@/lib/format";
import { exitLabel } from "@/lib/view";

export const metadata = { title: "Castaways" };

export default async function Castaways({ params, searchParams }: { params: Promise<{ season: string }>; searchParams: Promise<{ tribe?: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const tribeFilter = (await searchParams).tribe ?? "all";
  const cap = season.config.ownershipCap;
  const published = latestPublished(season);
  // Ownership "now" is the roster in effect for the next episode to be scored (the last one once a season is over).
  const nowEp = Math.max(1, Math.min(published + 1, season.episodes.length));

  const castaways: DirectoryCastaway[] = season.castaways.map((c) => {
    const exit = statusEventFor(season, c.id);
    const tribe = season.tribes.find((t) => t.id === currentTribeId(season, c.id, Math.max(published, 1)));
    return {
      id: c.id,
      name: c.name,
      href: seasonPath(season.id, `/castaways/${c.id}`),
      startTribeId: c.initialTribeId,
      tribe: { name: tribe?.name ?? "", color: tribe?.color ?? "var(--muted)" },
      total: castawaySeasonTotal(season, c.id),
      owners: season.episodes.length ? ownerCount(season, c.id, nowEp) : 0,
      cap,
      drafted: season.teams.filter((t) => t.draft.includes(c.id)).length,
      ...(season.archive?.finalRostersOnly ? { ownershipNote: `On ${season.teams.filter((t) => t.draft.includes(c.id)).length} final rosters` } : {}),
      peak: season.episodes.length ? Math.max(...season.episodes.map((e) => ownerCount(season, c.id, e.number))) : 0,
      out: exit ? `${exitLabel(exit)} · ${episodeLabel(season, exit.afterEpisode)}` : undefined,
    };
  });
  const startingTribes = season.tribes.filter((t) => season.castaways.some((c) => c.initialTribeId === t.id));

  return (
    <SeasonShell season={season} active="/castaways">
      <PageHeader eyebrow={season.name} title="Castaways">
        {season.castaways.length ? `Season points, how many teams own each castaway (the cap is ${cap} teams), and who's still in the game.` : null}
      </PageHeader>
      {season.castaways.length === 0 ? (
        <EmptyState icon={<IconCastaways size={22} />} title="The cast hasn't been announced">
          Castaways appear here once the commissioner adds this season&apos;s cast in Setup.
        </EmptyState>
      ) : (
        <CastawayDirectory castaways={castaways} tribes={startingTribes} initialTribe={startingTribes.some((t) => t.id === tribeFilter) ? tribeFilter : "all"} finished={season.status === "ARCHIVED"} />
      )}
    </SeasonShell>
  );
}
