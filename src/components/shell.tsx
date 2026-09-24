import Link from "next/link";
import type { ReactNode } from "react";
import { allSeasons } from "@/data";
import type { Season } from "@/domain/types";
import { seasonPath, seasonStatusLabel } from "@/lib/format";
import { userSignOutAction } from "@/server/actions";
import { getAccess, getMember, getUser } from "@/server/auth";
import {
  IconArchive,
  IconCastaways,
  IconChevronDown,
  IconEpisodes,
  IconLogin,
  IconLogout,
  IconMenu,
  IconMyTeam,
  IconRules,
  IconShield,
  IconStandings,
  IconTeams,
  IconTrophy,
  IconWeek,
  TorchMark,
} from "./icons";
import { Menu } from "./menu";
import { btnCls, btnGhostCls } from "./styles";
import { StatusBadge } from "./ui";

// ---------------------------------------------------------------------------------------------------------------
// The application shell. Desktop: a sticky top bar (brand, season switcher, account) over a row of section tabs.
// Mobile: a compact top bar plus a bottom tab bar for the most-used sections, with everything else under "More".
// ---------------------------------------------------------------------------------------------------------------

export const statusTone = { SETUP: "warn", OPENING_SELECTION: "accent", ACTIVE: "good", ARCHIVED: "neutral" } as const;

const sections = [
  { path: "", label: "Leaderboard", short: "Standings", Icon: IconStandings },
  { path: "/this-week", label: "This Week", short: "This Week", Icon: IconWeek },
  { path: "/teams", label: "Teams", short: "Teams", Icon: IconTeams },
  { path: "/castaways", label: "Castaways", short: "Castaways", Icon: IconCastaways },
  { path: "/episodes", label: "Episodes", short: "Episodes", Icon: IconEpisodes },
  { path: "/rules", label: "Rules", short: "Rules", Icon: IconRules },
];

const shellWidth = "mx-auto w-full max-w-6xl px-4 sm:px-6";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-xl" aria-label="Survivor Fantasy League home">
      <TorchMark size={34} />
      {compact ? null : (
        <span className="hidden leading-none lg:block">
          <span className="display block text-[15px] font-extrabold uppercase tracking-wider">Survivor</span>
          <span className="eyebrow block text-[9px] text-accent">Fantasy League</span>
        </span>
      )}
    </Link>
  );
}

function SkipLink() {
  return (
    <a href="#main" className="sr-only z-[60] rounded-full bg-accent px-4 py-2 font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
      Skip to content
    </a>
  );
}

const menuItemCls = "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink";

/** Signed-in: an account menu. Signed out: sign in / join. */
async function AccountControls({ next }: { next: string }) {
  const user = await getUser();
  if (!user) {
    return (
      <>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={btnGhostCls}>Sign in</Link>
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className={btnCls}>Join</Link>
        </div>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold text-ink sm:hidden">
          <IconLogin size={16} /> Sign in
        </Link>
      </>
    );
  }
  return (
    <Menu
      label={`Account: ${user.username}`}
      align="right"
      buttonClassName="flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface-2/70 py-1 pl-1 pr-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent/60"
      button={
        <>
          <span aria-hidden className="display grid size-8 place-items-center rounded-full bg-accent text-base font-extrabold uppercase text-accent-ink">{user.username.slice(0, 1)}</span>
          <span className="hidden max-w-32 truncate sm:inline">{user.username}</span>
          <IconChevronDown size={14} className="text-muted" />
        </>
      }
    >
      <p className="px-3 pb-2 pt-1 text-xs text-muted">Signed in as <strong className="text-ink">{user.username}</strong>{user.isAdmin ? " · site admin" : ""}</p>
      <Link href="/account" className={menuItemCls}>
        <IconMyTeam /> Change password
      </Link>
      <form action={userSignOutAction}>
        <button className={`${menuItemCls} w-full`}>
          <IconLogout /> Sign out
        </button>
      </form>
    </Menu>
  );
}

async function SeasonSwitcher({ season }: { season: Season }) {
  const seasons = await allSeasons();
  return (
    <Menu
      label={`Season: ${season.name}. Switch season`}
      buttonClassName="group flex min-h-10 min-w-0 items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-surface-2"
      button={
        <>
          <span className="min-w-0">
            <span className="display block truncate text-lg font-extrabold uppercase leading-none tracking-wide sm:text-xl">{season.name}</span>
            <span className="eyebrow mt-0.5 block text-[9.5px] text-muted">{seasonStatusLabel[season.status]}</span>
          </span>
          <IconChevronDown size={16} className="text-muted transition-transform group-aria-expanded:rotate-180" />
        </>
      }
    >
      <p className="eyebrow px-3 pb-1 pt-1.5 text-muted">Switch season</p>
      <ul>
        {[...seasons].reverse().map((s) => (
          <li key={s.id}>
            <Link href={seasonPath(s.id)} aria-current={s.id === season.id ? "page" : undefined} className={`${menuItemCls} justify-between ${s.id === season.id ? "bg-surface-3 text-ink" : ""}`}>
              <span className="truncate font-semibold">{s.name}</span>
              <StatusBadge tone={statusTone[s.status]}>{seasonStatusLabel[s.status]}</StatusBadge>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-1 border-t border-line pt-1">
        <Link href="/seasons" className={menuItemCls}>
          <IconArchive /> Season archive
        </Link>
        <Link href="/hall-of-fame" className={menuItemCls}>
          <IconTrophy /> Hall of Fame
        </Link>
      </div>
    </Menu>
  );
}

/** Page frame for one season. `active` is the section path of the current page. */
export async function SeasonShell({ season, active, children }: { season: Season; active: string; children: ReactNode }) {
  const [access, member] = await Promise.all([getAccess(season.id), getMember(season.id)]);
  const admin = !!access;
  const here = seasonPath(season.id, active);
  const tabCls = (on: boolean) =>
    `relative flex min-h-11 items-center gap-2 whitespace-nowrap px-2.5 text-sm lg:px-3 font-semibold transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors ${
      on ? "text-ink after:bg-accent" : "text-muted after:bg-transparent hover:text-ink"
    }`;

  // Mobile bottom bar: the four places people go most, plus More. A team owner gets My Team in place of Castaways.
  const bottom = [sections[0], sections[1], sections[2], member ? { path: "/my", label: "My Team", short: "My Team", Icon: IconMyTeam } : sections[3]];
  const more = [
    ...(member ? [sections[3]] : []),
    sections[4],
    sections[5],
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className={`${shellWidth} flex h-16 items-center gap-2 sm:gap-3`}>
          <Brand />
          <span aria-hidden className="hidden h-7 w-px bg-line lg:block" />
          <div className="min-w-0 flex-1">
            <SeasonSwitcher season={season} />
          </div>
          {admin ? (
            <Link href={`/admin/${season.id}`} className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent transition-colors hover:bg-surface-2 md:inline-flex">
              <IconShield size={16} /> Commissioner
            </Link>
          ) : null}
          <AccountControls next={member ? seasonPath(season.id, "/my") : here} />
        </div>
        <nav aria-label="Season sections" className={`${shellWidth} hidden md:block`}>
          <ul className="no-scrollbar -mb-px flex items-center gap-0.5 overflow-x-auto lg:gap-1">
            {sections.map((s) => (
              <li key={s.path}>
                <Link href={seasonPath(season.id, s.path)} aria-current={s.path === active ? "page" : undefined} className={tabCls(s.path === active)}>
                  <s.Icon size={16} className={`hidden lg:block ${s.path === active ? "text-accent" : ""}`} />
                  {s.label}
                </Link>
              </li>
            ))}
            {member ? (
              <li className="ml-auto">
                <Link href={seasonPath(season.id, "/my")} aria-current={active === "/my" ? "page" : undefined} className={tabCls(active === "/my")}>
                  <IconMyTeam size={16} className="text-accent" />
                  My Team
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      </header>

      <main id="main" className={`${shellWidth} flex-1 animate-fade pb-28 pt-6 sm:pt-8 md:pb-16`}>
        {children}
      </main>

      <footer className="hidden border-t border-line md:block">
        <div className={`${shellWidth} flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-muted`}>
          <span className="flex items-center gap-2"><TorchMark size={20} /> Survivor Fantasy League</span>
          <span>Scores are entered once per castaway and applied to each team&apos;s roster for that episode. Past episodes never change when a roster does.</span>
        </div>
      </footer>

      <nav aria-label="Season sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-bg-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {bottom.map((s) => {
            const on = s.path === active;
            return (
              <li key={s.path}>
                <Link href={seasonPath(season.id, s.path)} aria-current={on ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${on ? "text-accent" : "text-muted hover:text-ink"}`}>
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${on ? "bg-accent/15" : ""}`}><s.Icon size={20} /></span>
                  {s.short}
                </Link>
              </li>
            );
          })}
          <li>
            <Menu
              sheet
              label="More sections"
              buttonClassName={`flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${more.some((m) => m.path === active) ? "text-accent" : "text-muted hover:text-ink"}`}
              button={
                <>
                  <span className="grid h-7 w-12 place-items-center rounded-full"><IconMenu size={20} /></span>
                  More
                </>
              }
            >
              <p className="eyebrow px-3 pb-2 text-muted">{season.name}</p>
              <ul className="grid gap-1">
                {more.map((s) => (
                  <li key={s.path}>
                    <Link href={seasonPath(season.id, s.path)} aria-current={s.path === active ? "page" : undefined} className={`${menuItemCls} ${s.path === active ? "bg-surface-3 text-accent" : ""}`}>
                      <s.Icon /> {s.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/seasons" className={menuItemCls}><IconArchive /> Season archive</Link>
                </li>
                <li>
                  <Link href="/hall-of-fame" className={menuItemCls}><IconTrophy /> Hall of Fame</Link>
                </li>
                {admin ? (
                  <li>
                    <Link href={`/admin/${season.id}`} className={`${menuItemCls} text-accent`}><IconShield /> Commissioner tools</Link>
                  </li>
                ) : null}
              </ul>
            </Menu>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Frame for pages outside a season: the landing page, the archive and sign-in. */
export async function SiteShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg/70 backdrop-blur-md">
        <div className={`${shellWidth} flex h-16 items-center gap-3`}>
          <Link href="/" className="flex items-center gap-2.5" aria-label="Survivor Fantasy League home">
            <TorchMark size={34} />
            <span className="leading-none">
              <span className="display block text-[15px] font-extrabold uppercase tracking-wider">Survivor</span>
              <span className="eyebrow block text-[9px] text-accent">Fantasy League</span>
            </span>
          </Link>
          <span className="flex-1" />
          <Link href="/seasons" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex">
            <IconArchive size={16} /> Seasons
          </Link>
          <Link href="/hall-of-fame" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex">
            <IconTrophy size={16} /> Hall of Fame
          </Link>
          <AccountControls next="/" />
        </div>
      </header>
      <main id="main" className={`${narrow ? "mx-auto w-full max-w-md px-4" : shellWidth} flex-1 animate-fade pb-16 pt-8 sm:pt-12`}>
        {children}
      </main>
    </div>
  );
}
