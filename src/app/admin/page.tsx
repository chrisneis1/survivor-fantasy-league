import Link from "next/link";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageTitle, Pill, SectionTitle } from "@/components/ui";
import { allSeasons } from "@/data";
import { latestPublished } from "@/domain/engine";
import { store } from "@/server";
import { createSeasonAction } from "@/server/actions";

export const metadata = { title: "Commissioner" };

const statusTone = { SETUP: "accent", OPENING_SELECTION: "accent", ACTIVE: "good", ARCHIVED: "neutral" } as const;

export default async function AdminHome() {
  const seasons = await allSeasons();
  const templates = await store().listTemplates();
  return (
    <AdminShell>
      <PageTitle eyebrow="Commissioner" title="Seasons">
        Set up a season, score episodes and publish them. Nothing you save here reaches the public standings until you publish an episode.
      </PageTitle>
      <ul className="grid gap-3">
        {seasons.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/${s.id}`} className="group block">
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors group-hover:border-accent/60">
                <div>
                  <p className="display text-lg font-bold">{s.name}</p>
                  <p className="text-sm text-muted">
                    {s.teams.length} teams · {s.castaways.length} castaways · {latestPublished(s)} of {s.episodes.length} episodes published
                  </p>
                </div>
                <Pill tone={statusTone[s.status]}>{s.status === "ARCHIVED" ? "Archived" : s.status === "ACTIVE" ? "Active" : "In setup"}</Pill>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <SectionTitle>Start a new season</SectionTitle>
        <Card className="p-4">
          <ActionForm action={createSeasonAction} submit="Create season">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Season name" hint="For example: Survivor 51">
                <input name="name" required className={inputCls} />
              </Field>
              <Field label="Start from" hint="A past season copies its slots, scoring, ownership cap and episode layout. A template copies just the scoring rules and episode layout. Teams and cast start empty.">
                <select name="copyFrom" className={inputCls} defaultValue={seasons.at(-1)?.id ?? ""}>
                  <option value="">Start from scratch</option>
                  {templates.map((tp) => (
                    <option key={tp.id} value={`tpl:${tp.id}`}>Template: {tp.name}</option>
                  ))}
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </AdminShell>
  );
}
