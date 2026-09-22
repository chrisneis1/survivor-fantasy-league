import { notFound } from "next/navigation";
import { LeaderboardView, type LeaderboardQuery } from "@/components/leaderboard-view";
import { getSeason } from "@/data";

export default async function SeasonHome({ params, searchParams }: { params: Promise<{ season: string }>; searchParams: Promise<LeaderboardQuery> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  return <LeaderboardView season={season} query={await searchParams} />;
}
