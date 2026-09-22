import { notFound } from "next/navigation";
import { SeasonShell } from "@/components/shell";
import { Card, PageTitle, Pill, SectionTitle, Signed } from "@/components/ui";
import { getSeason } from "@/data";
import { episodeLabel } from "@/lib/format";

export const metadata = { title: "Rules" };

// Everything below is generated from the season's configuration — nothing here is typed in by hand.
export default async function Rules({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const c = season.config;
  const restrictionName = (id: string | null) => (id ? season.tribes.find((t) => t.id === id)!.name : null);
  const rules = season.rules.filter((r) => !r.retired);
  const categories = [...new Set(rules.map((r) => r.category))];
  const policies = season.episodes.reduce<{ policy: string; from: number; to: number }[]>((acc, e) => {
    const last = acc.at(-1);
    if (last && last.policy === e.rosterPolicy) last.to = e.number;
    else acc.push({ policy: e.rosterPolicy, from: e.number, to: e.number });
    return acc;
  }, []);
  const policyText: Record<string, string> = {
    EFFECTIVE: "Each team scores the roster it holds at that episode. Swaps take effect from the next episode.",
    ORIGINAL_DRAFT: "Each team scores its opening draft roster, whatever swaps were made.",
    SNAPSHOT_AS_OF: "Each team scores the roster it held at an earlier episode.",
  };
  const pts = (v: number | null) => (v === null ? <span className="text-muted">—</span> : <Signed n={v} className="font-semibold" />);

  return (
    <SeasonShell season={season} active="/rules">
      <PageTitle eyebrow={season.name} title="League rules">
        Generated from this season&apos;s settings, so a new season shows its own rules automatically.
      </PageTitle>

      <div className="grid gap-8">
        <section>
          <SectionTitle>Rosters</SectionTitle>
          <Card className="p-4">
            <p className="mb-3 text-sm text-muted">
              {season.teams.length} teams, {season.slots.length} slots each. A castaway can be on at most <strong className="text-ink">{c.ownershipCap} teams</strong>, and never twice on one team.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {season.slots.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-muted">{restrictionName(s.restrictionTribeId) ? `Opening pick from ${restrictionName(s.restrictionTribeId)}` : "Any castaway"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              {season.slots.some((s) => s.enforceOnSwap) ? "Some slot restrictions also apply to replacements." : "Slot restrictions apply to opening picks only. Replacements can come from any tribe."}
            </p>
          </Card>
        </section>

        <section>
          <SectionTitle>Swaps and weekly pick order</SectionTitle>
          <Card className="grid gap-3 p-4 text-sm">
            <p>After an episode&apos;s scores are published, a pick window opens. Teams pick in <strong>reverse standings order</strong>: fewest total points first. The order is saved when the window opens and does not shift if scores are corrected later.</p>
            <p>A team can make several replacements in its turn if it has several eliminated castaways to replace, and can pass at any time. Teams with nothing to replace are skipped automatically, with the reason shown.</p>
            <p>Tied teams keep the same displayed rank. For pick order only, {c.pickOrderTieRule === "OPENING_SEED_REVERSE" ? "the team with the later opening-draft position picks first" : "the configured tie rule applies"}.</p>
            <p className="text-muted">Swap credit limit: {c.swapCreditLimit === null ? "not recorded for this season" : `${c.swapCreditLimit} per team`}. A free pick, such as after a medical evacuation, uses no credit.</p>
            <p className="text-muted">Times are interpreted in the league timezone: {c.timezone.replace("_", " ")}.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Which roster counts each episode</SectionTitle>
          <ul className="grid gap-2">
            {policies.map((p) => (
              <li key={p.from} className="rounded-xl border border-line bg-surface p-3">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {p.from === p.to ? episodeLabel(season, p.from) : `${episodeLabel(season, p.from)} – ${episodeLabel(season, p.to)}`}
                  <Pill tone={p.policy === "EFFECTIVE" ? "neutral" : "accent"}>{p.policy.replace("_", " ").toLowerCase()}</Pill>
                </p>
                <p className="text-sm text-muted">{policyText[p.policy]}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle aside="Points per event">Scoring</SectionTitle>
          <Card className="overflow-hidden">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">{cat}</p>
                <div className="hidden grid-cols-[1fr_5rem_5rem_5rem] gap-2 px-4 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted sm:grid">
                  <span />
                  <span className="text-right">Pre-merge</span>
                  <span className="text-right">Post-merge</span>
                  <span className="text-right">Finale</span>
                </div>
                <ul>
                  {rules.filter((r) => r.category === cat).map((r) => (
                    <li key={r.key} className="border-b border-line px-4 py-2.5 last:border-b-0">
                      <div className="grid grid-cols-[1fr_auto] items-baseline gap-2 sm:grid-cols-[1fr_5rem_5rem_5rem]">
                        <span className="font-medium">{r.name}</span>
                        <span className="flex gap-3 sm:contents">
                          <span className="text-right text-sm sm:text-base"><span className="mr-1 text-xs text-muted sm:hidden">Pre</span>{pts(r.points["pre-merge"])}</span>
                          <span className="text-right text-sm sm:text-base"><span className="mr-1 text-xs text-muted sm:hidden">Post</span>{pts(r.points["post-merge"])}</span>
                          <span className="text-right text-sm sm:text-base"><span className="mr-1 text-xs text-muted sm:hidden">Finale</span>{pts(r.points.finale)}</span>
                        </span>
                      </div>
                      {r.note ? <p className="mt-0.5 text-sm text-muted">{r.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        </section>

        {season.wagers.length || season.wagerState !== "OFF" ? (
          <section>
            <SectionTitle>Final wager</SectionTitle>
            <Card className="grid gap-2 p-4 text-sm text-muted">
              <p>Each member also backs the castaway they think will win the season and wagers {c.wager.minStake}–{c.wager.maxStake} points. A correct pick gains what was wagered and a wrong pick loses it ({c.wager.correctMultiplier}:{c.wager.wrongMultiplier}).</p>
              <p><strong className="text-ink">Picks are secret.</strong> Nobody sees who picked whom, including the commissioner, until the season is finalized. Then the result is shown beside the base total as an adjustment, so the source of the final standing stays clear.</p>
            </Card>
          </section>
        ) : null}
      </div>
    </SeasonShell>
  );
}
