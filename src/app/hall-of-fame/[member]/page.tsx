import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronLeft, IconTrophy } from "@/components/icons";
import { SiteShell } from "@/components/shell";
import { EmptyState, Monogram, PageHeader, RankBadge, SectionHeader, StatCard, StatusBadge } from "@/components/ui";
import { allSeasons } from "@/data";
import { leagueHistory, type Finish } from "@/domain/history";
import { plural, seasonPath } from "@/lib/format";

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export async function generateMetadata({ params }: { params: Promise<{ member: string }> }) {
  const key = (await params).member;
  const m = leagueHistory(await allSeasons()).members.find((x) => x.key === key);
  return { title: m ? `${m.name} · Hall of Fame` : "Hall of Fame" };
}

export default async function MemberCareerPage({ params }: { params: Promise<{ member: string }> }) {
  const key = (await params).member;
  const history = leagueHistory(await allSeasons());
  const m = history.members.find((x) => x.key === key);
  if (!m) notFound();
  const place = history.members.indexOf(m) + 1;

  return (
    <SiteShell>
      <Link href="/hall-of-fame" className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <IconChevronLeft size={16} /> Hall of Fame
      </Link>
      <div className="mb-6 flex min-w-0 items-center gap-4">
        <Monogram name={m.name} size="lg" className="hidden sm:inline-flex" />
        <PageHeader eyebrow={`Hall of Fame · ${ordinal(place)} all-time`} title={m.name}>
          {m.finishes.length ? `${plural(m.finishes.length, "completed season")} in the league.` : "No completed seasons yet."}
        </PageHeader>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard tone={m.titles ? "sand" : "default"} icon={<IconTrophy size={13} />} label="Titles" value={m.titles} sub={m.titles ? m.finishes.filter((f) => f.rank === 1).map((f) => f.seasonName).join(", ") : "Still chasing one"} />
        <StatCard label="Top-3 finishes" value={m.podiums} sub={`of ${plural(m.finishes.length, "season")}`} />
        <StatCard label="Average finish" value={m.averageFinish === null ? "—" : m.averageFinish.toFixed(1)} sub={m.bestFinish ? `Best: ${ordinal(m.bestFinish)}` : undefined} />
        <StatCard label="Last-place finishes" value={m.lastPlaces} />
      </div>

      {m.current.length ? (
        <section aria-labelledby="now-title" className="mb-10">
          <SectionHeader id="now-title">Playing now</SectionHeader>
          <ul className="grid gap-2">
            {m.current.map((f) => <FinishRow key={f.seasonId} f={f} />)}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="seasons-title">
        <SectionHeader id="seasons-title">Season by season</SectionHeader>
        {m.finishes.length ? (
          <ol className="grid gap-2">
            {[...m.finishes].reverse().map((f) => <FinishRow key={f.seasonId} f={f} />)}
          </ol>
        ) : (
          <EmptyState compact>Finished seasons appear here.</EmptyState>
        )}
      </section>
    </SiteShell>
  );
}

function FinishRow({ f }: { f: Finish }) {
  const champ = f.final && f.rank === 1;
  return (
    <li>
      <Link
        href={seasonPath(f.seasonId, `/teams/${f.teamId}`)}
        className={`flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 transition-colors sm:px-4 ${champ ? "border-sand-line bg-sand text-sand-ink hover:opacity-95" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"}`}
      >
        <RankBadge rank={f.rank} tied={f.tied} size="sm" onSand={champ} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{f.seasonName}</span>
            {champ ? <StatusBadge tone="sand"><IconTrophy size={12} /> Champion</StatusBadge> : null}
            {!f.final ? <StatusBadge tone="accent">In progress</StatusBadge> : null}
          </span>
          <span className={`block truncate text-sm ${champ ? "text-sand-muted" : "text-muted"}`}>
            {f.teamName} · {f.tied ? "tied " : ""}{ordinal(f.rank)} of {f.of}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="display num block text-2xl font-extrabold leading-none">{f.total}</span>
          <span className={`text-xs ${champ ? "text-sand-muted" : "text-muted"}`}>pts</span>
        </span>
      </Link>
    </li>
  );
}
