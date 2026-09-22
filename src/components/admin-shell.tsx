import Link from "next/link";
import type { ReactNode } from "react";
import type { Season } from "@/domain/types";
import { signOutAction } from "@/server/actions";
import { requireAccess, requireAdmin, usingDefaultPasscode } from "@/server/auth";

const tabs = [
  { path: "", label: "Overview" },
  { path: "/setup", label: "Setup" },
  { path: "/members", label: "Members" },
  { path: "/audit", label: "Audit log" },
];

/**
 * Frame for commissioner pages. Authorization is checked here on every render, not just at sign-in: a season page
 * accepts the admin login or a member holding the commissioner role for that season; the admin home (no season) is
 * admin-only, since roles and new seasons are only managed there.
 */
export async function AdminShell({ season, active, children }: { season?: Season; active?: string; children: ReactNode }) {
  const access = season ? await requireAccess(season.id) : await requireAdmin();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-24 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/90 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin" className="display text-lg font-extrabold">
            Commissioner{season ? <span className="text-muted"> · {season.name}</span> : null}
          </Link>
          <span className="flex items-center gap-4 text-sm font-medium text-muted">
            <span className="hidden sm:inline">{access.label}</span>
            {season ? <Link href={`/${season.id}`} className="hover:text-ink">Public site</Link> : <Link href="/" className="hover:text-ink">Public site</Link>}
            <form action={signOutAction}>
              <button className="hover:text-ink">Sign out</button>
            </form>
          </span>
        </div>
        {season ? (
          <nav aria-label="Commissioner sections" className="no-scrollbar -mx-4 mt-2 flex gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            {tabs.map((t) => (
              <Link
                key={t.path}
                href={`/admin/${season.id}${t.path}`}
                aria-current={t.path === active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-semibold ${t.path === active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="h-3" />
        )}
      </header>
      <main className="flex-1 pt-6">
        {access.kind === "admin" && usingDefaultPasscode() ? (
          <p className="mb-6 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
            The admin login is still using the default password. Set <code>COMMISSIONER_PASSCODE</code> in the environment before this site is public — anyone who knows the default can sign in as admin.
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
