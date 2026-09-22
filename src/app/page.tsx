import { LeaderboardView, type LeaderboardQuery } from "@/components/leaderboard-view";
import { getCurrentSeason } from "@/data";

// The league landing page: the current season's Leaderboard, public by default (guide §9.1).
export default async function Home({ searchParams }: { searchParams: Promise<LeaderboardQuery> }) {
  const season = await getCurrentSeason();
  if (!season) return <p className="p-8 text-muted">No season has been set up yet.</p>;
  return <LeaderboardView season={season} query={await searchParams} />;
}
