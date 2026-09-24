import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { IconRules } from "@/components/icons";
import { SeasonShell } from "@/components/shell";
import { Card, EmptyState, PageHeader, ScoreChange, StatusBadge, TribeDot } from "@/components/ui";
import { getSeason } from "@/data";
import { episodeLabel } from "@/lib/format";

export const metadata = { title: "Rules" };

function RuleSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-36 border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 id={`${id}-h`} className="display mb-3 text-2xl font-bold uppercase tracking-wide">{title}</h2>
      <div className="grid gap-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

const th = "eyebrow px-3 py-2.5 text-left text-muted";
const td = "border-t border-line px-3 py-2.5 align-top";

// Everything below is generated from the season's configuration — nothing here is typed in by hand.
export default async function Rules({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const c = season.config;
  const tribeOf = (id: string | null) => (id ? season.tribes.find((t) => t.id === id) : undefined);
  const rules = season.rules.filter((r) => !r.retired);
  const categories = [...new Set(rules.map((r) => r.category))];
  const policies = season.episodes.reduce<{ policy: string; from: number; to: number }[]>((acc, e) => {
    const last = acc.at(-1);
    if (last && last.policy === e.rosterPolicy) last.to = e.number;
    else acc.push({ policy: e.rosterPolicy, from: e.number, to: e.number });
    return acc;
  }, []);
  const policyName: Record<string, string> = { EFFECTIVE: "Current roster", ORIGINAL_DRAFT: "Original draft", SNAPSHOT_AS_OF: "Earlier snapshot" };
  const policyText: Record<string, string> = {
    EFFECTIVE: "Each team scores the roster it holds at that episode. Swaps take effect from the next episode.",
    ORIGINAL_DRAFT: "Each team scores its opening draft roster, whatever swaps were made.",
    SNAPSHOT_AS_OF: "Each team scores the roster it held at an earlier episode.",
  };
  const pts = (v: number | null) => (v === null ? <span className="text-muted">—</span> : <ScoreChange n={v} className="font-semibold" />);
  const showWager = season.wagers.length > 0 || season.wagerState !== "OFF";

  const toc = [
    { id: "rosters", label: "Rosters" },
    { id: "swaps", label: "Swaps & pick order" },
    ...(policies.length ? [{ id: "roster-policy", label: "Which roster counts" }] : []),
    { id: "scoring", label: "Scoring" },
    ...(showWager ? [{ id: "wager", label: "Final wager" }] : []),
  ];

  return (
    <SeasonShell season={season} active="/rules">
      <PageHeader eyebrow={season.name} title="League rules">
        Generated from this season&apos;s settings, so a new season shows its own rules automatically.
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow mb-2 hidden text-muted lg:block">On this page</p>
          <ul className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full border border-line-strong px-3 text-sm font-semibold text-ink-2 transition-colors hover:border-accent/50 hover:text-ink lg:w-full lg:rounded-lg lg:border-transparent lg:hover:bg-surface-2">
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="grid max-w-3xl gap-8">
          <RuleSection id="rosters" title="Rosters">
            <p>
              {season.teams.length} teams, {season.slots.length} slots each. A castaway can be on at most <strong className="text-ink">{c.ownershipCap} teams</strong>, and never twice on one team.
            </p>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60">
                  <tr><th className={th}>Slot</th><th className={th}>Opening pick</th></tr>
                </thead>
                <tbody>
                  {season.slots.map((s) => {
                    const t = tribeOf(s.restrictionTribeId);
                    return (
                      <tr key={s.id}>
                        <td className={`${td} font-semibold text-ink`}>{s.name}</td>
                        <td className={td}>{t ? <span className="inline-flex items-center gap-1.5"><TribeDot color={t.color} /> From {t.name}</span> : "Any castaway"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <p className="text-sm text-muted">
              {season.slots.some((s) => s.enforceOnSwap) ? "Some slot restrictions also apply to replacements." : "Slot restrictions apply to opening picks only. Replacements can come from any tribe."}
            </p>
          </RuleSection>

          <RuleSection id="swaps" title="Swaps and weekly pick order">
            <ol className="grid list-decimal gap-2 pl-5 marker:font-semibold marker:text-accent">
              <li>After an episode&apos;s scores are published, a pick window opens. Teams pick in <strong className="text-ink">reverse standings order</strong>: fewest total points first. The order is saved when the window opens and does not shift if scores are corrected later.</li>
              <li>A team can make several replacements in its turn if it has several eliminated castaways to replace, and can pass at any time. Teams with nothing to replace are skipped automatically, with the reason shown.</li>
              <li>There&apos;s no time limit on a turn. The league picks at its own pace, since members watch on different days.</li>
            </ol>
            <Card tone="raised" className="grid gap-1.5 p-4 text-sm">
              <p><strong className="text-ink">Ties.</strong> Tied teams keep the same displayed rank. For pick order only, {c.pickOrderTieRule === "OPENING_SEED_REVERSE" ? "the team with the later opening-draft position picks first" : "the configured tie rule applies"}.</p>
              <p><strong className="text-ink">Swap credits.</strong> {c.swapCreditLimit === null ? "Not recorded for this season" : `${c.swapCreditLimit} per team`}. A free pick, such as after a medical evacuation, uses no credit.</p>
              <p><strong className="text-ink">Timezone.</strong> Times are interpreted in the league timezone: {c.timezone.replace("_", " ")}.</p>
            </Card>
          </RuleSection>

          {policies.length ? (
            <RuleSection id="roster-policy" title="Which roster counts each episode">
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2/60">
                    <tr><th className={th}>Episodes</th><th className={th}>Scored roster</th></tr>
                  </thead>
                  <tbody>
                    {policies.map((p) => (
                      <tr key={p.from}>
                        <td className={`${td} whitespace-nowrap font-semibold text-ink`}>{p.from === p.to ? episodeLabel(season, p.from) : `${episodeLabel(season, p.from)} – ${episodeLabel(season, p.to)}`}</td>
                        <td className={td}>
                          <StatusBadge tone={p.policy === "EFFECTIVE" ? "neutral" : "accent"}>{policyName[p.policy]}</StatusBadge>
                          <p className="mt-1 text-muted">{policyText[p.policy]}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </RuleSection>
          ) : null}

          <RuleSection id="scoring" title="Scoring">
            {rules.length === 0 ? (
              <EmptyState compact icon={<IconRules size={20} />}>Scoring rules appear here once the commissioner sets them up.</EmptyState>
            ) : (
              <>
                <p>Points per event, by phase of the season. A dash means the rule doesn&apos;t apply in that phase.</p>
                {categories.map((cat) => (
                  <Card key={cat} className="overflow-hidden">
                    <table className="w-full text-sm">
                      <caption className="eyebrow border-b border-line bg-surface-2/60 px-3 py-2.5 text-left text-accent">{cat}</caption>
                      <thead>
                        <tr>
                          <th className={th}><span className="sr-only">Rule</span></th>
                          <th className={`${th} w-14 text-right sm:w-20`}>Pre<span className="hidden sm:inline">-merge</span></th>
                          <th className={`${th} w-14 text-right sm:w-20`}>Post<span className="hidden sm:inline">-merge</span></th>
                          <th className={`${th} w-14 text-right sm:w-20`}>Finale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rules.filter((r) => r.category === cat).map((r) => (
                          <tr key={r.key}>
                            <td className={td}>
                              <span className="font-medium text-ink">{r.name}</span>
                              {r.note ? <span className="mt-0.5 block text-xs text-muted">{r.note}</span> : null}
                            </td>
                            <td className={`${td} num text-right`}>{pts(r.points["pre-merge"])}</td>
                            <td className={`${td} num text-right`}>{pts(r.points["post-merge"])}</td>
                            <td className={`${td} num text-right`}>{pts(r.points.finale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ))}
              </>
            )}
          </RuleSection>

          {showWager ? (
            <RuleSection id="wager" title="Final wager">
              <p>Each member also backs the castaway they think will win the season and wagers {c.wager.minStake}–{c.wager.maxStake} points. A correct pick gains what was wagered and a wrong pick loses it ({c.wager.correctMultiplier}:{c.wager.wrongMultiplier}).</p>
              <Card tone="sand" className="p-4 text-sm">
                <strong>Picks are secret.</strong> Nobody sees who picked whom, including the commissioner, until the season is finalized. Then the result is shown beside the base total as an adjustment, so the source of the final standing stays clear.
              </Card>
            </RuleSection>
          ) : null}
        </article>
      </div>
    </SeasonShell>
  );
}
