import Link from "next/link";
import { IconArrowRight, IconChevronRight, IconTrophy } from "@/components/icons";
import { SiteShell } from "@/components/shell";
import { Card, EmptyState, PageHeader, SectionHeader, StatCard } from "@/components/ui";
import { allSeasons } from "@/data";
import { leagueHistory, type MemberCareer } from "@/domain/history";
import { plural, seasonPath } from "@/lib/format";

export const metadata = { title: "Hall of Fame" };

const avg = (n: number | null) => (n === null ? "—" : n.toFixed(1));

export default async function HallOfFame() {
  const history = leagueHistory(await allSeasons());
  const { champions, members, completedSeasons } = history;
  const most = (pick: (m: MemberCareer) => number) => {
    const top = Math.max(0, ...members.map(pick));
    return { n: top, who: top ? members.filter((m) => pick(m) === top).map((m) => m.name) : [] };
  };
  const titles = most((m) => m.titles);
  const podiums = most((m) => m.podiums);
  // Best average finish among members with at least three completed seasons, so one lucky year doesn't top it.
  const steady = members.filter((m) => m.finishes.length >= 3 && m.averageFinish !== null).sort((a, b) => a.averageFinish! - b.averageFinish!)[0];

  return (
    <SiteShell>
      <PageHeader eyebrow="League history" title="Hall of Fame">
        Every champion and every member&apos;s record across {plural(completedSeasons, "completed season")}. It updates itself whenever a season is finished.
      </PageHeader>

      {completedSeasons === 0 ? (
        <EmptyState icon={<IconTrophy size={22} />} title="No completed seasons yet">Champions and career records appear here once a season is finished.</EmptyState>
      ) : (
        <>
          <div className="mb-10 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatCard tone="sand" icon={<IconTrophy size={13} />} label="Most titles" value={titles.who.join(" & ") || "—"} sub={titles.n ? plural(titles.n, "title") : undefined} />
            <StatCard label="Most top-3 finishes" value={podiums.who.join(" & ") || "—"} sub={podiums.n ? plural(podiums.n, "podium") : undefined} />
            <StatCard label="Best average finish" value={steady?.name ?? "—"} sub={steady ? `${avg(steady.averageFinish)} over ${plural(steady.finishes.length, "season")}` : "3+ seasons"} />
            <StatCard label="Seasons played" value={completedSeasons} sub={`${members.length} members all-time`} />
          </div>

          <section aria-labelledby="champions-title" className="mb-12">
            <SectionHeader id="champions-title">Champions</SectionHeader>
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {champions.map(({ season, winners }) => (
                <li key={season.id}>
                  <Link href={seasonPath(season.id)} className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand-line bg-sand p-4 text-sand-ink shadow-raised transition-transform hover:-translate-y-0.5">
                    <IconTrophy size={84} className="pointer-events-none absolute -right-4 -top-4 text-sand-2" />
                    <p className="eyebrow relative text-sand-muted">{season.name}</p>
                    <p className="display relative mt-1 truncate text-3xl font-extrabold uppercase leading-none">{winners.map((w) => w.member).join(" & ")}</p>
                    <p className="relative mt-1 truncate text-sm text-sand-muted">
                      {winners.length > 1 ? "Co-champions" : winners[0]?.teamName} · <span className="num font-semibold text-sand-ink">{winners[0]?.total}</span> pts
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="table-title">
            <SectionHeader id="table-title" aside="Tap a member for their seasons">All-time table</SectionHeader>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_3rem_3rem_3.25rem] items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted sm:grid-cols-[2rem_minmax(0,1fr)_4rem_4rem_4rem_4.5rem_4rem_4rem] sm:px-4">
                <span>#</span>
                <span>Member</span>
                <span className="text-right">Titles</span>
                <span className="text-right">Top 3</span>
                <span className="hidden text-right sm:block">Seasons</span>
                <span className="text-right">Avg</span>
                <span className="hidden text-right sm:block">Best</span>
                <span className="hidden text-right sm:block">Last</span>
              </div>
              <ol>
                {members.map((m, i) => (
                  <li key={m.key} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/hall-of-fame/${m.key}`}
                      className="grid min-h-12 grid-cols-[1.75rem_minmax(0,1fr)_3rem_3rem_3.25rem] items-center gap-2 px-3 py-2 transition-colors hover:bg-surface-2 sm:grid-cols-[2rem_minmax(0,1fr)_4rem_4rem_4rem_4.5rem_4rem_4rem] sm:px-4"
                    >
                      <span className="num text-sm text-muted">{i + 1}</span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-semibold">{m.name}</span>
                        {m.titles ? <IconTrophy size={14} className="shrink-0 text-gold" aria-hidden /> : null}
                        <IconChevronRight size={14} className="ml-auto hidden shrink-0 text-muted sm:block" />
                      </span>
                      <span className={`num text-right font-bold ${m.titles ? "text-gold" : "text-muted"}`}>{m.titles}</span>
                      <span className="num text-right">{m.podiums}</span>
                      <span className="num hidden text-right sm:block">{m.finishes.length}</span>
                      <span className="num text-right">{avg(m.averageFinish)}</span>
                      <span className="num hidden text-right sm:block">{m.bestFinish ?? "—"}</span>
                      <span className="num hidden text-right text-muted sm:block">{m.lastPlaces}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
            <p className="mt-2 text-xs text-muted">
              Finishes are the final standings each season, after any final wager or winner-pick bonus. Avg is the average finishing place; Last counts last-place finishes.
            </p>
          </section>

          <p className="mt-8">
            <Link href="/seasons" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              Browse every season <IconArrowRight size={16} />
            </Link>
          </p>
        </>
      )}
    </SiteShell>
  );
}
