import Link from "next/link";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageHeader, StatusBadge, SectionHeader } from "@/components/ui";
import { allSeasons } from "@/data";
import { latestPublished } from "@/domain/engine";
import { store } from "@/server";
import { bundledSeasons } from "@/data/archive";
import { addPastSeasonsAction, createSeasonAction } from "@/server/actions";

export const metadata = { title: "Commissioner" };

const statusTone = { SETUP: "accent", OPENING_SELECTION: "accent", ACTIVE: "good", ARCHIVED: "neutral" } as const;

export default async function AdminHome() {
  const seasons = await allSeasons();
  const templates = await store().listTemplates();
  const missing = bundledSeasons.filter((b) => !seasons.some((s) => s.id === b.id));
  return (
    <AdminShell>
      <PageHeader eyebrow="Commissioner" title="Seasons">
        Set up a season, score episodes and publish them. Nothing you save here reaches the public standings until you publish an episode.{" "}
        <Link href="/admin/users" className="text-accent hover:underline">Site accounts →</Link>
      </PageHeader>
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
                <StatusBadge tone={statusTone[s.status]}>{s.status === "ARCHIVED" ? "Archived" : s.status === "ACTIVE" ? "Active" : "In setup"}</StatusBadge>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <SectionHeader>Past seasons</SectionHeader>
        <Card className="p-4">
          {missing.length ? (
            <ActionForm action={addPastSeasonsAction} submit={`Add ${missing.length} past season${missing.length === 1 ? "" : "s"}`}>
              <p className="text-sm text-muted">
                {missing.map((s) => s.name).join(", ")} {missing.length === 1 ? "was" : "were"} imported from the league&apos;s old spreadsheets and can be added to the archive and the{" "}
                <Link href="/hall-of-fame" className="text-accent hover:underline">Hall of Fame</Link>. They&apos;re added as completed seasons exactly as the sheets recorded them; seasons already here aren&apos;t touched.
              </p>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">
              Every past season from the league&apos;s old spreadsheets is in the archive. <Link href="/hall-of-fame" className="text-accent hover:underline">Hall of Fame →</Link>
            </p>
          )}
        </Card>
      </div>

      <div className="mt-10">
        <SectionHeader>Start a new season</SectionHeader>
        <Card className="p-4">
          <ActionForm action={createSeasonAction} submit="Create season">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Season name" hint="For example: Survivor 51">
                <input name="name" required className={inputCls} />
              </Field>
              <Field label="Start from" hint="A past season copies its tribes, roster slots, scoring, ownership cap and episode layout — so check the tribes and rebuild the slots in Setup once the new tribes are known. A template copies just the scoring rules and episode layout. Teams and cast start empty.">
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
