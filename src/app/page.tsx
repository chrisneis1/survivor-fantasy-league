import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { btnCls, btnGhostCls } from "@/components/styles";
import { getCurrentSeason } from "@/data";
import { getMember, getUser } from "@/server/auth";
import { seasonPath } from "@/lib/format";

// The landing page: signed-in visitors go straight where they're headed; everyone else gets sign-in/sign-up plus
// a direct way in to browse the current season without an account (guide §9.1 — the site stays public by default).
export default async function Home() {
  const season = await getCurrentSeason();
  const user = await getUser();

  if (user && season) {
    const teamId = await getMember(season.id);
    redirect(seasonPath(season.id, teamId ? "/my" : ""));
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <PageTitle eyebrow="Welcome to the league" title="Survivor Fantasy League" />
      {user ? (
        <p className="mb-6 max-w-md text-muted">You&apos;re signed in as <strong>{user.username}</strong>, but no season has been set up yet.</p>
      ) : (
        <>
          <p className="mb-6 max-w-md text-muted">Sign in to make picks for your team, or just browse — standings, rosters and rules are open to everyone.</p>
          <Card className="mb-8 flex w-full max-w-sm flex-col gap-3 p-5">
            <Link href="/login" className={btnCls}>Sign in</Link>
            <Link href="/signup" className={btnGhostCls}>Create an account</Link>
          </Card>
        </>
      )}
      {season ? (
        <Link href={seasonPath(season.id)} className="text-accent hover:underline">
          View {season.name}, the current season →
        </Link>
      ) : (
        <p className="text-muted">No season has been set up yet.</p>
      )}
    </div>
  );
}
