import Link from "next/link";
import type { ReactNode } from "react";
import type { Season } from "@/domain/types";
import { signOutAction } from "@/server/actions";
import { requireAccess, requireAdmin, usingDefaultPasscode } from "@/server/auth";
import { IconAlert, IconArrowRight, IconShield, TorchMark } from "./icons";

const tabs = [
  { path: "", label: "Overview" },
  { path: "/setup", label: "Setup" },
  { path: "/members", label: "Members" },
  { path: "/audit", label: "Audit log" },
];

const shellWidth = "mx-auto w-full max-w-6xl px-4 sm:px-6";

/**
 * Frame for commissioner pages. Authorization is checked here on every render, not just at sign-in: a season page
 * accepts the admin login or a member holding the commissioner role for that season; the admin home (no season) is
 * admin-only, since roles and new seasons are only managed there.
 */
export async function AdminShell({ season, active, children }: { season?: Season; active?: string; children: ReactNode }) {
  const access = season ? await requireAccess(season.id) : await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[60] rounded-full bg-accent px-4 py-2 font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className={`${shellWidth} flex h-16 items-center gap-3`}>
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <TorchMark size={34} />
            <span className="min-w-0 leading-none">
              <span className="eyebrow flex items-center gap-1 whitespace-nowrap text-[9.5px] text-accent"><IconShield size={11} /> Commissioner<span className="hidden sm:inline"> tools</span></span>
              <span className="display mt-0.5 block truncate text-lg font-extrabold uppercase tracking-wide">{season ? season.name : "All seasons"}</span>
            </span>
          </Link>
          <span className="flex-1" />
          <span className="hidden text-sm text-muted md:inline">Signed in as {access.label}</span>
          <Link href={season ? `/${season.id}` : "/"} aria-label="Public site" className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:px-3">
            <span className="hidden sm:inline">Public site</span> <IconArrowRight size={16} />
          </Link>
          <form action={signOutAction} className="shrink-0">
            <button className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-line-strong px-3 text-sm font-semibold text-ink-2 transition-colors hover:border-accent/60 hover:text-ink">Sign out</button>
          </form>
        </div>
        {season ? (
          <nav aria-label="Commissioner sections" className={shellWidth}>
            <ul className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
              {tabs.map((t) => (
                <li key={t.path}>
                  <Link
                    href={`/admin/${season.id}${t.path}`}
                    aria-current={t.path === active ? "page" : undefined}
                    className={`relative flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full ${t.path === active ? "text-ink after:bg-accent" : "text-muted after:bg-transparent hover:text-ink"}`}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      <main id="main" className={`${shellWidth} flex-1 animate-fade pb-24 pt-6 sm:pt-8`}>
        {access.kind === "admin" && usingDefaultPasscode() ? (
          <p className="mb-6 flex gap-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
            <IconAlert size={18} className="mt-px" />
            <span>The admin login is still using the default password. Set <code>COMMISSIONER_PASSCODE</code> in the environment before this site is public — anyone who knows the default can sign in as admin.</span>
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
