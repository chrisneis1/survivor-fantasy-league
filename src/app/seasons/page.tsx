import Link from "next/link";
import { Card, PageTitle, Pill } from "@/components/ui";
import { allSeasons } from "@/data";
import { standings } from "@/domain/engine";
import { seasonPath } from "@/lib/format";

export const metadata = { title: "Season archive" };

export default async function Archive() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">← Leaderboard</Link>
      <PageTitle eyebrow="League history" title="Season archive">
        Completed seasons are read-only and stay available while the next one is set up.
      </PageTitle>
      <ul className="grid gap-3">
        {(await allSeasons()).map((s) => {
          const top = standings(s)[0];
          const winner = s.teams.find((t) => t.id === top.teamId)!;
          return (
            <li key={s.id}>
              <Link href={seasonPath(s.id)} className="group block">
                <Card className="flex items-center justify-between gap-4 p-4 transition-colors group-hover:border-accent/60">
                  <div>
                    <p className="display flex items-center gap-2 text-xl font-bold">
                      {s.name} <Pill tone={s.status === "ARCHIVED" ? "neutral" : "good"}>{s.status === "ARCHIVED" ? "Complete" : "Current"}</Pill>
                    </p>
                    <p className="text-sm text-muted">{s.teams.length} teams · {s.castaways.length} castaways · {s.episodes.length} episodes</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">Winner</p>
                    <p className="font-semibold">{winner.name}</p>
                    <p className="num text-sm text-muted">{winner.member} · {top.total} pts</p>
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
