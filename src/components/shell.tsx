import Link from "next/link";
import type { ReactNode } from "react";
import { userSignOutAction } from "@/server/actions";
import { getAccess, getMember, getUser } from "@/server/auth";
import type { Season } from "@/domain/types";
import { seasonPath } from "@/lib/format";

const nav = [
  { path: "", label: "Leaderboard" },
  { path: "/this-week", label: "This Week" },
  { path: "/teams", label: "Teams" },
  { path: "/castaways", label: "Castaways" },
  { path: "/episodes", label: "Episodes" },
  { path: "/rules", label: "Rules" },
];

const statusLabel: Record<Season["status"], string> = {
  SETUP: "Setting up",
  OPENING_SELECTION: "Opening picks",
  ACTIVE: "In progress",
  ARCHIVED: "Final",
};

/** Page frame for one season. `active` is the nav path of the current page. */
export async function SeasonShell({ season, active, children }: { season: Season; active: string; children: ReactNode }) {
  const [access, member, user] = await Promise.all([getAccess(season.id), getMember(season.id), getUser()]);
  const admin = !!access;
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-16 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/90 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href={seasonPath(season.id)} className="flex items-center gap-2.5" aria-label={`${season.name} leaderboard`}>
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2c1 3.5 4.5 5 4.5 9.2a4.5 4.5 0 0 1-9 0c0-1.6.7-2.7 1.5-3.7.3 1.2 1 1.9 1.7 2.2C10.3 6.6 11 4 12 2Z" /><path d="M5 20h14v2H5z" /></svg>
            </span>
            <span className="display text-lg font-extrabold leading-none">
              {season.name}
              <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-widest text-muted">{statusLabel[season.status]}</span>
            </span>
          </Link>
          <span className="flex items-center gap-4 text-sm font-medium text-muted">
            {admin ? <Link href={`/admin/${season.id}`} className="text-accent hover:underline">Commissioner tools</Link> : null}
            <Link href="/seasons" className="hover:text-ink">Archive</Link>
            {user ? (
              <span className="flex items-center gap-2">
                <span className="hidden sm:inline">{user.username}</span>
                <form action={userSignOutAction}><button className="hover:text-ink">Sign out</button></form>
              </span>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(seasonPath(season.id, "/my"))}`} className="hover:text-ink">Sign in</Link>
            )}
          </span>
        </div>
        <nav aria-label="Sections" className="no-scrollbar -mx-4 mt-2 flex gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          {[...nav, ...(member ? [{ path: "/my", label: "My Team" }] : [])].map((n) => (
            <Link
              key={n.path}
              href={seasonPath(season.id, n.path)}
              aria-current={n.path === active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-semibold transition-colors ${
                n.path === active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 pt-6">{children}</main>
      <footer className="mt-16 border-t border-line pt-4 text-xs text-muted">
        Scores are entered once per castaway and applied to each team&apos;s roster for that episode. Past episodes never change when a roster does.
      </footer>
    </div>
  );
}
