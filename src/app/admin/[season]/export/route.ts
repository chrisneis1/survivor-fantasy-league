import { notFound } from "next/navigation";
import { getSeason } from "@/data";
import { seasonCsv } from "@/domain/export";
import { requireAccess } from "@/server/auth";

// A CSV snapshot of the season: standings, rosters, castaway totals, episode scoring, transactions, corrections.
// Never includes wager picks before the season is finalized — standings only carry a wager column once results exist.
export async function GET(_req: Request, { params }: { params: Promise<{ season: string }> }) {
  const seasonId = (await params).season;
  await requireAccess(seasonId);
  const season = await getSeason(seasonId);
  if (!season) notFound();
  const csv = seasonCsv(season);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${season.id}.csv"`,
    },
  });
}
