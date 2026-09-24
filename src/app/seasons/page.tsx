import Link from "next/link";
import { IconArchive, IconArrowRight, IconTrophy } from "@/components/icons";
import { SiteShell, statusTone } from "@/components/shell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { allSeasons } from "@/data";
import { latestPublished, standings } from "@/domain/engine";
import { finalStandings } from "@/domain/history";
import type { Season } from "@/domain/types";
import { episodeLabel, seasonPath, seasonStatusLabel } from "@/lib/format";

export const metadata = { title: "Season archive" };

export default async function Archive() {
  const seasons = [...(await allSeasons())].reverse();
  const current = seasons.filter((s) => s.status !== "ARCHIVED");
  const done = seasons.filter((s) => s.status === "ARCHIVED");
  return (
    <SiteShell>
      <PageHeader eyebrow="League history" title="Seasons">
        Completed seasons are read-only and stay available while the next one is set up.
      </PageHeader>
      <Link href="/hall-of-fame" className="group mb-8 flex items-center gap-3 rounded-[var(--radius-card)] border border-sand-line bg-sand px-4 py-3 text-sand-ink shadow-raised transition-transform hover:-translate-y-0.5">
        <IconTrophy size={22} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Hall of Fame</span>
          <span className="block truncate text-sm text-sand-muted">Every champion, and every member&apos;s record across the seasons.</span>
        </span>
        <IconArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>

      {seasons.length === 0 ? (
        <EmptyState icon={<IconArchive size={22} />} title="No seasons yet">The first season appears here once the commissioner creates it.</EmptyState>
      ) : null}

      {current.length ? (
        <section aria-labelledby="now" className="mb-10">
          <h2 id="now" className="eyebrow mb-3 text-accent">Now playing</h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            {current.map((s) => <CurrentCard key={s.id} season={s} />)}
          </ul>
        </section>
      ) : null}

      {done.length ? (
        <section aria-labelledby="past">
          <h2 id="past" className="eyebrow mb-3 text-muted">Completed seasons</h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            {done.map((s) => <ChampionCard key={s.id} season={s} />)}
          </ul>
        </section>
      ) : null}
    </SiteShell>
  );
}

const facts = (s: Season) => `${s.teams.length} teams · ${s.castaways.length} castaways · ${s.episodes.length} episodes`;

function CurrentCard({ season: s }: { season: Season }) {
  const published = latestPublished(s);
  const top = published ? standings(s)[0] : undefined;
  const leader = top ? s.teams.find((t) => t.id === top.teamId) : undefined;
  return (
    <li>
      <Link href={seasonPath(s.id)} className="group flex h-full flex-col rounded-[var(--radius-card)] border border-accent/45 bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] p-5 shadow-glow transition-colors hover:border-accent/80">
        <div className="flex items-start justify-between gap-3">
          <p className="display text-3xl font-extrabold uppercase leading-none">{s.name}</p>
          <StatusBadge tone={statusTone[s.status]}>{seasonStatusLabel[s.status]}</StatusBadge>
        </div>
        <p className="mt-1.5 text-sm text-muted">{facts(s)}</p>
        <div className="mt-4">
          <div className="flex justify-between text-xs font-semibold text-muted">
            <span>{published ? `Scored through ${episodeLabel(s, published)}` : "No episodes scored yet"}</span>
            <span className="num">{published}/{s.episodes.length}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-ember to-accent" style={{ width: `${s.episodes.length ? (published / s.episodes.length) * 100 : 0}%` }} />
          </div>
        </div>
        <p className="mt-4 flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-ink-2">{leader && top ? <>Leading: <strong className="text-ink">{leader.name}</strong> · {top.total} pts</> : "Standings appear after Episode 1 is published."}</span>
          <IconArrowRight size={18} className="shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
        </p>
      </Link>
    </li>
  );
}

function ChampionCard({ season: s }: { season: Season }) {
  const top = finalStandings(s)[0];
  const winner = top ? s.teams.find((t) => t.id === top.teamId) : undefined;
  return (
    <li>
      <Link href={seasonPath(s.id)} className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand-line bg-sand p-5 text-sand-ink shadow-raised transition-transform hover:-translate-y-0.5">
        <IconTrophy size={110} className="pointer-events-none absolute -right-5 -top-5 text-sand-2" />
        <div className="relative flex items-start justify-between gap-3">
          <p className="display text-3xl font-extrabold uppercase leading-none">{s.name}</p>
          <StatusBadge tone="sand">Complete</StatusBadge>
        </div>
        <p className="relative mt-1.5 text-sm text-sand-muted">{facts(s)}</p>
        {winner && top ? (
          <div className="relative mt-4 flex items-end justify-between gap-3 border-t border-sand-line pt-3">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1.5 text-sand-muted"><IconTrophy size={13} /> Champion</p>
              <p className="mt-0.5 truncate text-lg font-bold">{winner.name}</p>
              <p className="truncate text-sm text-sand-muted">{winner.member}</p>
            </div>
            <p className="shrink-0 text-right">
              <span className="display num block text-4xl font-extrabold leading-none">{top.total}</span>
              <span className="text-xs text-sand-muted">pts</span>
            </p>
          </div>
        ) : null}
      </Link>
    </li>
  );
}
