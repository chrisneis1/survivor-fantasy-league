import Link from "next/link";
import { redirect } from "next/navigation";
import { IconArrowRight, IconStandings, IconSwap, IconTeams, IconTrophy, TorchMark } from "@/components/icons";
import { SiteShell } from "@/components/shell";
import { btnCls, btnGhostCls } from "@/components/styles";
import { EmptyState, RankBadge, StatusBadge } from "@/components/ui";
import { getCurrentSeason } from "@/data";
import { latestPublished, standings } from "@/domain/engine";
import { openWindow, openingTurn } from "@/domain/picks";
import type { Season } from "@/domain/types";
import { episodeLabel, seasonPath, seasonStatusLabel } from "@/lib/format";
import { teamOf } from "@/lib/view";
import { getMember, getUser } from "@/server/auth";

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
    <SiteShell>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12">
        <div className="min-w-0 animate-rise lg:pt-6">
          <p className="eyebrow mb-3 flex items-center gap-2 text-accent"><TorchMark size={20} /> A fantasy league for Survivor</p>
          <h1 className="display text-5xl font-extrabold uppercase leading-[0.9] sm:text-6xl lg:text-7xl">
            Draft castaways.
            <span className="block bg-gradient-to-r from-accent-strong to-ember bg-clip-text text-transparent">Outlast the league.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
            Every team drafts a roster of castaways. They score points for what happens on the island each week, and when one is voted out you pick a replacement — fewest points picks first.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {season ? (
              <Link href={seasonPath(season.id)} className={`${btnCls} min-h-12 px-6 text-base`}>
                Enter {season.name} <IconArrowRight size={18} />
              </Link>
            ) : null}
            {user ? null : (
              <>
                <Link href="/login" className={`${btnGhostCls} min-h-12 px-5`}>Sign in</Link>
                <Link href="/signup" className={`${btnGhostCls} min-h-12 px-5`}>Create an account</Link>
              </>
            )}
          </div>
          <p className="mt-3 text-sm text-muted">
            {user ? <>Signed in as <strong className="text-ink">{user.username}</strong>.</> : "No account needed to browse — standings, rosters and rules are open to everyone. Sign in to make picks for your team."}
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { Icon: IconTeams, title: "Draft", text: "Build a roster of castaways in the opening draft." },
              { Icon: IconStandings, title: "Score", text: "Castaways earn points every episode they play." },
              { Icon: IconSwap, title: "Swap", text: "Replace castaways who leave, in reverse standings order." },
            ].map((s) => (
              <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-surface/70 p-3.5">
                <p className="flex items-center gap-2 font-semibold text-ink"><s.Icon size={16} className="text-accent" /> {s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ul>
        </div>

        {season ? <CurrentSeasonCard season={season} /> : (
          <EmptyState icon={<IconTrophy size={22} />} title="No season yet">
            {user ? `You're signed in as ${user.username}, but no season has been set up yet.` : "No season has been set up yet. Check back once the commissioner creates one."}
          </EmptyState>
        )}
      </div>
    </SiteShell>
  );
}

/** The current season, on parchment: where it stands, and the top of the table if anything has been scored. */
function CurrentSeasonCard({ season }: { season: Season }) {
  const published = latestPublished(season);
  const rows = published ? standings(season).slice(0, 5) : [];
  const total = season.episodes.length;
  const live = openWindow(season);
  const draft = season.status === "OPENING_SELECTION" ? openingTurn(season) : null;

  return (
    <section aria-labelledby="current-season" className="relative animate-rise overflow-hidden rounded-3xl border border-sand-line bg-sand text-sand-ink shadow-raised">
      <svg aria-hidden viewBox="0 0 400 160" className="pointer-events-none absolute -right-10 -top-6 h-40 w-96 text-sand-line/70">
        <g fill="none" stroke="currentColor">
          <ellipse cx="300" cy="60" rx="120" ry="48" />
          <ellipse cx="300" cy="60" rx="86" ry="32" />
          <ellipse cx="300" cy="60" rx="52" ry="18" />
          <ellipse cx="300" cy="60" rx="20" ry="7" />
        </g>
      </svg>
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-sand-muted">Current season</p>
          <StatusBadge tone="sand">{seasonStatusLabel[season.status]}</StatusBadge>
        </div>
        <h2 id="current-season" className="display mt-1 text-4xl font-extrabold uppercase leading-none">{season.name}</h2>
        <p className="mt-1.5 text-sm text-sand-muted">
          {season.teams.length} teams · {season.castaways.length} castaways · {total} episodes
        </p>

        <div className="mt-4">
          <div className="flex justify-between text-xs font-semibold text-sand-muted">
            <span>{published ? `Scored through ${episodeLabel(season, published)}` : "No episodes scored yet"}</span>
            <span className="num">{published}/{total}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand-2" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-ember to-accent" style={{ width: `${total ? (published / total) * 100 : 0}%` }} />
          </div>
        </div>

        {live ? <p className="mt-3 rounded-xl bg-sand-2 px-3 py-2 text-sm font-semibold">A pick window is open after {episodeLabel(season, live.afterEpisode)}.</p> : null}
        {draft ? <p className="mt-3 rounded-xl bg-sand-2 px-3 py-2 text-sm font-semibold">The draft is live — pick {draft.index + 1} of {draft.total}.</p> : null}
      </div>

      <div className="relative border-t border-sand-line bg-[color-mix(in_srgb,var(--sand-2)_55%,var(--sand))] px-3 py-3 sm:px-4">
        {rows.length ? (
          <>
            <p className="eyebrow px-2 pb-1.5 text-sand-muted">{season.status === "ARCHIVED" ? "Final standings" : `Top of the table · ${episodeLabel(season, published)}`}</p>
            <ol>
              {rows.map((r) => {
                const t = teamOf(season, r.teamId);
                return (
                  <li key={r.teamId} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                    <RankBadge rank={r.rank} tied={r.tied} size="sm" onSand />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="block truncate text-xs text-sand-muted">{t.member}</span>
                    </span>
                    <span className="display num text-2xl font-extrabold">{r.total}</span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="px-2 py-3 text-sm text-sand-muted">
            {season.status === "SETUP" ? "This season is being set up. " : season.status === "OPENING_SELECTION" ? "Teams are drafting now. " : ""}
            Standings will appear here after Episode 1 is published.
          </p>
        )}
        <Link href={seasonPath(season.id)} className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-sand-ink px-4 text-sm font-semibold text-sand transition-opacity hover:opacity-90">
          {rows.length ? "Full standings" : "Go to the season"} <IconArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
