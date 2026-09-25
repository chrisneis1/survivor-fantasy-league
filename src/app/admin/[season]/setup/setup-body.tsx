import type { ReactNode } from "react";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { Card, PageHeader, StatusBadge, SectionHeader } from "@/components/ui";
import { castPresets, type CastPreset } from "@/data/casts";
import { applyCast, optionsToText, ruleUsed, rulePublished, rulePhases, layoutOf } from "@/domain/template";
import { slug, validateSetup, type SetupIssue } from "@/domain/setup";
import type { Season } from "@/domain/types";
import { store } from "@/server";
import { getAccess } from "@/server/auth";
import { RosterLayoutForm } from "./roster-layout-form";
import {
  addCastawayAction,
  addEpisodeAction,
  addSlotAction,
  addTeamFromUserAction,
  addTribeAction,
  loadCastAction,
  removeCastawayAction,
  updateCastawayAction,
  removeLastEpisodeAction,
  removeSlotAction,
  removeTeamAction,
  renameTeamAction,
  removeTribeAction,
  saveSeedAction,
  updateBasicsAction,
  updateEpisodeAction,
  updateRuleAction,
  addRuleAction,
  removeRuleAction,
  retireRuleAction,
  applyEpisodeLayoutAction,
  applyTemplateAction,
  saveTemplateAction,
  deleteTemplateAction,
  deleteSeasonAction,
} from "@/server/actions";

const Hidden = ({ season }: { season: Season }) => <input type="hidden" name="seasonId" value={season.id} />;

const phaseShort = { "pre-merge": "Pre", "post-merge": "Post", finale: "Finale" } as const;
const signedPts = (v: number | null) => (v === null ? "—" : v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");
const policyLabel = { EFFECTIVE: "current roster", ORIGINAL_DRAFT: "original draft", SNAPSHOT_AS_OF: "snapshot" } as const;

/** A collapsed row that opens to its edit form: keeps long lists (rules, episodes) scannable, especially on a phone. */
function EditRow({ summary, children, className = "" }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group rounded-xl border border-line bg-surface-2/40 open:bg-surface-2/70 ${className}`}>
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">{summary}</span>
        <span className="shrink-0 text-xs font-semibold text-accent group-open:hidden">Edit</span>
        <span aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-line px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}

/** The season's researched tribes and cast, with exactly what loading them would do, or why it can't. */
function CastPresetCard({ season, preset }: { season: Season; preset: CastPreset }) {
  const loaded =
    season.castaways.length === preset.castaways.length &&
    preset.castaways.every((p) => season.castaways.some((c) => c.id === slug(p.name) && c.initialTribeId === p.tribe));
  let preview: Season | null = null;
  let blocked: string | null = null;
  try {
    preview = applyCast(season, preset, "preview").season;
  } catch (e) {
    blocked = e instanceof Error ? e.message : "It can't be loaded right now.";
  }
  const byTribe = preset.tribes.map((t) => ({ t, names: preset.castaways.filter((c) => c.tribe === t.id).map((c) => c.name) }));
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 sm:p-4">
      <h3 className="font-semibold">{loaded ? "The researched cast is loaded" : "Researched cast"}</h3>
      <ul className="mt-1 grid gap-0.5 text-sm text-muted">
        {preset.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {byTribe.map(({ t, names }) => (
          <div key={t.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-semibold"><span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />{t.name} ({names.length})</p>
            <p className="mt-0.5 text-ink-2">{names.join(", ")}</p>
          </div>
        ))}
      </div>
      {loaded ? null : blocked ? (
        <p className="mt-3 text-sm text-warn">Can&apos;t load it now: {blocked}</p>
      ) : preview ? (
        <div className="mt-3">
          <ActionForm
            action={loadCastAction}
            submit={`Load ${preset.castaways.length} castaways`}
            confirm={`Replace the tribes (${season.tribes.map((t) => t.name).join(", ") || "none"}) and cast (${season.castaways.length}) with ${preset.tribes.map((t) => t.name).join(" and ")} (${preset.castaways.length} castaways)? Roster slots become: ${preview.slots.map((sl) => sl.name).join(", ")}.`}
          >
            <Hidden season={season} />
            <p className="text-sm">
              This replaces the current tribes ({season.tribes.map((t) => t.name).join(", ") || "none"}) and cast ({season.castaways.length}). Each team will still draft{" "}
              <strong>{preview.slots.length}</strong>: {preview.slots.map((sl) => sl.name).join(", ")}. You can change that with the quick layout below afterwards.
            </p>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}

function Issues({ issues, section }: { issues: SetupIssue[]; section: SetupIssue["section"] }) {
  const mine = issues.filter((i) => i.section === section);
  if (!mine.length) return null;
  return (
    <ul className="mb-3 grid gap-1 text-sm">
      {mine.map((i, k) => (
        <li key={k} className={i.level === "error" ? "text-bad" : "text-muted"}>
          {i.level === "error" ? "✕" : "!"} {i.message}
        </li>
      ))}
    </ul>
  );
}

export async function SetupBody({ season }: { season: Season }) {
  const editable = season.status === "SETUP";
  const issues = editable ? validateSetup(season) : [];
  const tribeName = (id: string | null) => season.tribes.find((t) => t.id === id)?.name ?? "";
  const phases = ["pre-merge", "post-merge", "finale"] as const;
  const templates = await store().listTemplates();
  const layout = layoutOf(season);
  const categories = [...new Set(season.rules.map((r) => r.category))];
  const access = await getAccess(season.id);
  const allUsers = await store().listUsers();
  const inSeason = new Set(season.teams.map((t) => t.id));
  const availableUsers = allUsers.filter((u) => !inSeason.has(slug(u.username)));
  // The quick layout builds slots only for tribes that have castaways (all tribes, before any cast is entered).
  const slotTribes = season.castaways.length ? season.tribes.filter((t) => season.castaways.some((c) => c.initialTribeId === t.id)) : season.tribes;
  // Start the quick-layout form from the slots as they are, when they follow the "N per tribe + wild" shape.
  const restrictedCounts = slotTribes.map((t) => season.slots.filter((sl) => sl.restrictionTribeId === t.id).length);
  const uniform = restrictedCounts.length > 0 && restrictedCounts.every((n) => n === restrictedCounts[0]) && season.slots.every((sl) => !sl.restrictionTribeId || slotTribes.some((t) => t.id === sl.restrictionTribeId));
  const currentLayout = uniform ? { perTribe: restrictedCounts[0], wild: season.slots.filter((sl) => !sl.restrictionTribeId).length } : { perTribe: 2, wild: 0 };
  const sections: { id: string; label: string; issues: SetupIssue["section"][] }[] = [
    { id: "basics", label: "Basics", issues: ["basics"] },
    { id: "cast", label: "Tribes & cast", issues: ["cast", "rosters"] },
    { id: "teams", label: "Teams", issues: ["teams"] },
    { id: "episodes", label: "Episodes", issues: ["episodes"] },
    { id: "scoring", label: "Scoring", issues: ["scoring"] },
    ...(access?.kind === "admin" ? [{ id: "danger", label: "Danger zone", issues: [] }] : []),
  ];

  return (
    <>
      <PageHeader eyebrow="Commissioner" title="Season setup">
        {editable
          ? "Work top to bottom. Each section shows what is still missing; the season can be activated when none remain."
          : "The season is locked. Only episode structure and scoring values can still change, and every change is logged."}
      </PageHeader>

      <nav aria-label="Setup sections" className="sticky top-[6.75rem] z-20 -mx-4 mb-6 border-y border-line bg-bg/90 px-4 py-2 backdrop-blur sm:top-28 sm:mx-0 sm:rounded-full sm:border sm:px-2">
        <ul className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {sections.map((sec) => {
            const errors = issues.filter((i) => i.level === "error" && sec.issues.includes(i.section)).length;
            return (
              <li key={sec.id}>
                <a href={`#${sec.id}`} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                  {sec.label}
                  {errors ? <span className="num rounded-full bg-bad/20 px-1.5 text-[11px] text-bad" aria-label={`${errors} to fix`}>{errors}</span> : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid gap-10">
        <section id="basics" className="scroll-mt-44">
          <SectionHeader>1 · Basics</SectionHeader>
          <Card className="p-4">
            <Issues issues={issues} section="basics" />
            {editable ? (
              <ActionForm action={updateBasicsAction} submit="Save basics">
                <Hidden season={season} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Season name"><input name="name" defaultValue={season.name} required className={inputCls} /></Field>
                  <Field label="League timezone" hint="IANA name, for example America/Los_Angeles. Used to show dates and times."><input name="timezone" defaultValue={season.config.timezone} required className={inputCls} /></Field>
                  <Field label="Ownership cap" hint="Most teams that may own the same castaway."><input name="ownershipCap" type="number" min={1} defaultValue={season.config.ownershipCap} required className={inputCls} /></Field>
                  <Field label="Swap credits per team" hint="Leave blank for no limit."><input name="swapCreditLimit" type="number" min={0} defaultValue={season.config.swapCreditLimit ?? ""} className={inputCls} /></Field>
                  <Field label="Rule that marks the season winner" hint="Only used to settle the final wager (each member secretly bets points on who wins, at the start of the season) — it has no effect on anything else."><select name="winnerRule" defaultValue={season.config.wager.winnerRule} className={inputCls}>{season.rules.filter((r) => !r.retired && r.inputType === "boolean").map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></Field>
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-1 text-sm font-semibold">Replacements that cost no swap credit</legend>
                    <div className="flex flex-wrap gap-4 text-sm">
                      {(["VOTED_OUT", "MEDICAL_EVACUATION", "QUIT", "OTHER_EXIT"] as const).map((t) => (
                        <label key={t} className="flex items-center gap-2">
                          <input type="checkbox" name={`free_${t}`} defaultChecked={season.config.freeReplacementStatuses.includes(t)} className="size-4 accent-[var(--accent)]" />
                          {t === "VOTED_OUT" ? "Voted out" : t === "MEDICAL_EVACUATION" ? "Medical evacuation" : t === "QUIT" ? "Quit" : "Other exit"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Smallest wager (points)"><input name="minStake" type="number" min={1} defaultValue={season.config.wager.minStake} required className={inputCls} /></Field>
                  <Field label="Largest wager (points)" hint="Payout is 1:1: a correct pick gains the stake, a wrong one loses it."><input name="maxStake" type="number" min={1} defaultValue={season.config.wager.maxStake} required className={inputCls} /></Field>
                  <Field label="Who can view"><select name="visibility" defaultValue={season.config.visibility} className={inputCls}><option value="PUBLIC_READ">Public (recommended)</option><option value="PRIVATE">Private</option></select></Field>
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">{season.name} · {season.config.timezone} · cap {season.config.ownershipCap} · {season.config.swapCreditLimit === null ? "no swap limit set" : `${season.config.swapCreditLimit} swap credits`} · "snake draft"</p>
            )}
          </Card>
        </section>

        <section id="cast" className="scroll-mt-44">
          <SectionHeader>2 · Tribes, roster slots and cast</SectionHeader>
          <Card className="grid gap-6 p-4">
            <Issues issues={issues} section="cast" />
            {editable && castPresets[season.id] ? <CastPresetCard season={season} preset={castPresets[season.id]} /> : null}
            <div>
              <h3 className="mb-2 font-semibold">Tribes</h3>
              <ul className="mb-3 flex flex-wrap gap-2">
                {season.tribes.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                    {t.name}
                    {editable ? (
                      <ActionForm action={removeTribeAction} submit="✕" ghost className="contents">
                        <Hidden season={season} /><input type="hidden" name="tribeId" value={t.id} />
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
              {editable ? (
                <ActionForm action={addTribeAction} submit="Add tribe" ghost resetOnSuccess>
                  <Hidden season={season} />
                  <div className="grid grid-cols-[1fr_5rem] gap-3">
                    <Field label="Tribe name"><input name="name" required className={inputCls} /></Field>
                    <Field label="Colour"><input name="color" type="color" defaultValue="#1fb5b0" className={`${inputCls} h-[38px] p-1`} /></Field>
                  </div>
                </ActionForm>
              ) : null}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Roster slots</h3>
              <Issues issues={issues} section="rosters" />
              <p className="mb-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                Each team drafts <strong>{season.slots.length} {season.slots.length === 1 ? "castaway" : "castaways"}</strong>, one per slot
                {season.slots.length ? <> — so the draft runs {season.slots.length} {season.slots.length === 1 ? "round" : "rounds"}</> : null}.
              </p>
              {editable ? (
                <div className="mb-3">
                  <RosterLayoutForm seasonId={season.id} tribes={slotTribes.map((t) => ({ id: t.id, name: t.name }))} skipped={season.tribes.filter((t) => !slotTribes.includes(t)).map((t) => t.name)} initial={currentLayout} />
                </div>
              ) : null}
              <ul className="mb-3 grid gap-2">
                {season.slots.map((sl, i) => (
                  <li key={sl.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                    <span><strong>{sl.name}</strong> <span className="text-muted">· {sl.restrictionTribeId ? `opening pick from ${tribeName(sl.restrictionTribeId)}` : "any castaway"}</span></span>
                    {editable ? (
                      <ActionForm action={removeSlotAction} submit="Remove" ghost className="contents">
                        <Hidden season={season} /><input type="hidden" name="index" value={i} />
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
              {editable ? (
                <ActionForm action={addSlotAction} submit="Add slot" ghost resetOnSuccess>
                  <Hidden season={season} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Slot name"><input name="name" required className={inputCls} /></Field>
                    <Field label="Opening pick must come from"><select name="restriction" className={inputCls}><option value="">Any castaway (wild)</option>{season.tribes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                  </div>
                </ActionForm>
              ) : null}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Cast ({season.castaways.length})</h3>
              <ul className="mb-3 grid gap-1 sm:grid-cols-2">
                {season.castaways.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1 text-sm">
                    {editable ? (
                      <ActionForm key={`${c.name}:${c.initialTribeId}`} action={updateCastawayAction} submit="Save" ghost className="flex flex-1 flex-wrap items-center gap-2">
                        <Hidden season={season} /><input type="hidden" name="castawayId" value={c.id} />
                        <input name="name" defaultValue={c.name} required className={`${inputCls} w-32 px-2 py-1`} />
                        <select name="tribe" defaultValue={c.initialTribeId} className={`${inputCls} px-2 py-1`}>{season.tribes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                      </ActionForm>
                    ) : (
                      <span>{c.name} <span className="text-muted">· {tribeName(c.initialTribeId)}</span></span>
                    )}
                    {editable ? (
                      <ActionForm action={removeCastawayAction} submit="Remove" ghost className="contents">
                        <Hidden season={season} /><input type="hidden" name="castawayId" value={c.id} />
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
              {editable ? (
                <ActionForm action={addCastawayAction} submit="Add castaway" ghost resetOnSuccess>
                  <Hidden season={season} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name"><input name="name" required className={inputCls} /></Field>
                    <Field label="Starting tribe"><select name="tribe" required className={inputCls}>{season.tribes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                  </div>
                </ActionForm>
              ) : null}
            </div>
          </Card>
        </section>

        <section id="teams" className="scroll-mt-44">
          <SectionHeader>3 · Teams and opening order</SectionHeader>
          <Card className="grid gap-6 p-4">
            <Issues issues={issues} section="teams" />
            <p className="text-sm text-muted">A team&apos;s name starts as a filler ("{"{Member}"}&apos;s Team") until the member sets their own from My Team — or you can rename one here any time before the season is archived.</p>
            <ul className="grid gap-2">
              {season.teams.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
                  <strong className="shrink-0">{t.member}</strong>
                  {season.status !== "ARCHIVED" ? (
                    <ActionForm action={renameTeamAction} submit="Save" ghost className="flex flex-1 items-center gap-2">
                      <Hidden season={season} /><input type="hidden" name="teamId" value={t.id} />
                      <input name="name" defaultValue={t.name} required maxLength={60} className={`${inputCls} max-w-56`} />
                    </ActionForm>
                  ) : (
                    <span className="text-muted">{t.name}</span>
                  )}
                  {editable ? (
                    <ActionForm action={removeTeamAction} submit="Remove" ghost className="contents">
                      <Hidden season={season} /><input type="hidden" name="teamId" value={t.id} />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? (
              availableUsers.length === 0 ? (
                <p className="text-sm text-muted">
                  {allUsers.length === 0 ? "Nobody has signed up yet." : "Everyone who's signed up is already in this season."} Tell people to create an account at{" "}
                  <span className="text-ink">/signup</span> — they&apos;ll show up here to add.
                </p>
              ) : (
                <div>
                  <h3 className="mb-2 font-semibold">Who&apos;s playing?</h3>
                  <p className="-mt-1 mb-3 text-sm text-muted">Pick from everyone who has signed up. Adding someone creates their team and signs them in as it, in one step.</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {availableUsers.map((u) => (
                      <li key={u.id}>
                        <ActionForm action={addTeamFromUserAction} submit={`Add ${u.username}`} ghost className="contents">
                          <Hidden season={season} /><input type="hidden" name="userId" value={u.id} />
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
            {editable && season.teams.length > 0 ? (
              <ActionForm action={saveSeedAction} submit="Save opening order">
                <Hidden season={season} />
                <h3 className="font-semibold">Opening pick order</h3>
                <p className="-mt-2 text-sm text-muted">The commissioner sets who picks first. The first position drafts first, and the order reverses each round (position 1, 2, 3 means round 2 runs 3, 2, 1). This order also breaks ties for weekly pick order (later position picks first).</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {season.teams.map((t) => (
                    <label key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-1.5 text-sm">
                      {t.member}
                      <input name={`pos_${t.id}`} type="number" min={1} max={season.teams.length} defaultValue={Math.max(season.config.openingSeed.indexOf(t.id), 0) + 1} className={`${inputCls} w-20`} />
                    </label>
                  ))}
                </div>
              </ActionForm>
            ) : null}
          </Card>
        </section>

        <section id="episodes" className="scroll-mt-44">
          <SectionHeader>4 · Episodes</SectionHeader>
          <Card className="grid gap-2.5 p-4">
            <Issues issues={issues} section="episodes" />
            {season.status !== "ARCHIVED" ? (
              <ActionForm action={applyEpisodeLayoutAction} submit="Lay out episodes" ghost confirm="Lay out the episodes? Episodes that are already scored are left alone.">
                <Hidden season={season} />
                <p className="text-sm text-muted">Quick layout: set the total, the first post-merge episode and how many at the end score the original draft. The last episode becomes the finale.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Total episodes"><input name="total" type="number" min={1} max={40} defaultValue={layout.total || 13} required className={inputCls} /></Field>
                  <Field label="First post-merge episode"><input name="mergeAt" type="number" min={1} defaultValue={layout.mergeAt || 7} required className={inputCls} /></Field>
                  <Field label="Original-draft episodes at the end"><input name="draftTail" type="number" min={0} defaultValue={layout.draftTail} className={inputCls} /></Field>
                </div>
              </ActionForm>
            ) : null}
            {season.episodes.map((e) => (
              <div key={e.id}>
                {e.state === "PUBLISHED" || season.status === "ARCHIVED" ? (
                  <p className="text-sm">
                    <strong>{e.title}</strong> <span className="text-muted">· {e.phase} · {e.rosterPolicy.toLowerCase().replace("_", " ")}</span> <StatusBadge tone="good">Locked</StatusBadge>{" "}
                    {e.excludeFromStandings ? <StatusBadge>Doesn&apos;t count</StatusBadge> : null}
                  </p>
                ) : (
                  <EditRow
                    summary={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <strong>{e.title}</strong>
                        <span className="text-muted">{e.phase} · {policyLabel[e.rosterPolicy]}{e.rosterPolicy === "SNAPSHOT_AS_OF" && e.rosterPolicySourceEpisode ? ` ${e.rosterPolicySourceEpisode}` : ""}</span>
                        {e.excludeFromStandings ? <StatusBadge>Doesn&apos;t count</StatusBadge> : null}
                      </span>
                    }
                  >
                  <ActionForm action={updateEpisodeAction} submit={`Save episode ${e.number}`} ghost>
                    <Hidden season={season} /><input type="hidden" name="number" value={e.number} />
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Field label={`Episode ${e.number} title`}><input name="title" defaultValue={e.title} className={inputCls} /></Field>
                      <Field label="Phase"><select name="phase" defaultValue={e.phase} className={inputCls}>{phases.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
                      <Field label="Roster that counts"><select name="rosterPolicy" defaultValue={e.rosterPolicy} className={inputCls}><option value="EFFECTIVE">Current roster</option><option value="ORIGINAL_DRAFT">Original draft</option><option value="SNAPSHOT_AS_OF">Snapshot as of…</option></select></Field>
                      <Field label="Snapshot episode" hint="Only for snapshot."><input name="source" type="number" min={1} defaultValue={e.rosterPolicySourceEpisode ?? ""} className={inputCls} /></Field>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" name="excludeFromStandings" defaultChecked={!!e.excludeFromStandings} className="size-4 accent-[var(--accent)]" />
                      Doesn&apos;t count toward standings — score it, but no team's total ever includes it (e.g. a premiere scored before the draft)
                    </label>
                  </ActionForm>
                  </EditRow>
                )}
              </div>
            ))}
            {season.status !== "ARCHIVED" ? (
              <div className="grid gap-4 border-t border-line pt-4">
                <ActionForm action={addEpisodeAction} submit="Add episode" ghost resetOnSuccess>
                  <Hidden season={season} />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Title"><input name="title" placeholder={`Episode ${season.episodes.length + 1}`} className={inputCls} /></Field>
                    <Field label="Phase"><select name="phase" className={inputCls}>{phases.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
                    <Field label="Roster that counts"><select name="rosterPolicy" className={inputCls}><option value="EFFECTIVE">Current roster</option><option value="ORIGINAL_DRAFT">Original draft</option><option value="SNAPSHOT_AS_OF">Snapshot as of…</option></select></Field>
                    <Field label="Snapshot episode"><input name="source" type="number" min={1} className={inputCls} /></Field>
                  </div>
                </ActionForm>
                {season.episodes.length > 0 ? (
                  <ActionForm action={removeLastEpisodeAction} submit="Remove last episode" ghost confirm="Remove the last episode?">
                    <Hidden season={season} />
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </Card>
        </section>

        <section id="scoring" className="scroll-mt-44">
          <SectionHeader>5 · Scoring rules</SectionHeader>
          <p className="-mt-1 mb-3 text-sm text-muted">The scoring template. Each rule has a value for each phase (blank where it doesn't apply). Changes apply to episodes scored from now on; published scores keep the points they resolved to.</p>
          <Issues issues={issues} section="scoring" />

          {season.status !== "ARCHIVED" ? (
            <Card className="mb-4 grid gap-4 p-4">
              <div>
                <h3 className="mb-1 font-semibold">Templates</h3>
                <p className="mb-3 text-sm text-muted">Save these rules and the episode layout as a template, then start any new season from it.</p>
                <ActionForm action={saveTemplateAction} submit="Save as template" ghost resetOnSuccess>
                  <Hidden season={season} />
                  <Field label="Template name"><input name="name" required placeholder="e.g. Standard 13-week season" className={inputCls} /></Field>
                </ActionForm>
              </div>
              {templates.length ? (
                <ul className="grid gap-2">
                  {templates.map((t) => (
                    <li key={t.id} className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                      <p className="font-semibold">{t.name} <span className="font-normal text-muted">· {t.rules} rules · {t.layout.total} episodes, merge at {t.layout.mergeAt}</span></p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {editable ? (
                          <ActionForm action={applyTemplateAction} submit="Use for this season" ghost confirm={`Replace this season's scoring rules and episode layout with "${t.name}"?`} className="contents">
                            <Hidden season={season} /><input type="hidden" name="template" value={t.id} />
                          </ActionForm>
                        ) : null}
                        <ActionForm action={deleteTemplateAction} submit="Delete template" ghost confirm={`Delete the template "${t.name}"?`} className="contents">
                          <input type="hidden" name="template" value={t.id} />
                        </ActionForm>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-2">
            {season.rules.map((r) => {
              const used = ruleUsed(season, r.key);
              const ruleSummary = (
                <span className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.name}
                    <StatusBadge>{r.inputType}</StatusBadge>
                    {r.retired ? <StatusBadge tone="bad">Retired</StatusBadge> : null}
                    {used ? <StatusBadge tone="good">In use</StatusBadge> : null}
                  </span>
                  <span className="num text-xs text-muted">
                    {r.category} ·{" "}
                    {r.inputType === "choice"
                      ? `${(r.options ?? []).length} options`
                      : r.inputType === "manual"
                        ? "manual ± with note"
                        : phases.map((p) => `${phaseShort[p]} ${signedPts(r.points[p])}`).join(" · ")}
                    {rulePhases(r).length === 0 ? " · scores in no phase" : ""}
                  </span>
                </span>
              );
              return (
                <div key={r.key} className={r.retired ? "opacity-70" : ""}>
                  {season.status === "ARCHIVED" ? (
                    <Card className="p-3.5">
                      {ruleSummary}
                      <p className="mt-1 text-sm text-muted">{r.note}</p>
                    </Card>
                  ) : (
                    <EditRow summary={ruleSummary}>
                      <ActionForm action={updateRuleAction} submit="Save rule" ghost>
                        <Hidden season={season} /><input type="hidden" name="rule" value={r.key} />
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <Field label="Name"><input name="name" defaultValue={r.name} required className={inputCls} /></Field>
                          <Field label="Group"><input name="category" list="rule-groups" defaultValue={r.category} className={inputCls} /></Field>
                          {used && (rulePublished(season, r.key) || (r.inputType !== "boolean" && r.inputType !== "quantity")) ? (
                            <Field label="Entered as" hint="Locked: this rule has been scored."><input value={r.inputType} readOnly className={inputCls} /></Field>
                          ) : used ? (
                            <Field label="Entered as" hint="Saved progress that uses it converts too.">
                              <select name="inputType" defaultValue={r.inputType} className={inputCls}>
                                <option value="boolean">On / off</option>
                                <option value="quantity">Count (× value)</option>
                              </select>
                            </Field>
                          ) : (
                            <Field label="Entered as" hint="On/off, a count, one of several options, or a signed manual number.">
                              <select name="inputType" defaultValue={r.inputType} className={inputCls}>
                                <option value="boolean">On / off</option>
                                <option value="quantity">Count (× value)</option>
                                <option value="choice">Choose an option</option>
                                <option value="manual">Manual ± with note</option>
                              </select>
                            </Field>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {phases.map((p) => (
                            <Field key={p} label={p}><input name={p} type="number" step="any" defaultValue={r.points[p] ?? ""} className={inputCls} /></Field>
                          ))}
                        </div>
                        {r.inputType === "choice" || !used ? (
                          <Field label="Options (choice rules)" hint="One per line: Label | pre-merge | post-merge | finale. Use - where it doesn't apply, or one number for every phase.">
                            <textarea name="options" rows={Math.max(3, (r.options ?? []).length + 1)} defaultValue={optionsToText(r.options)} className={`${inputCls} font-mono`} />
                          </Field>
                        ) : null}
                        <Field label="Note"><input name="note" defaultValue={r.note} className={inputCls} /></Field>
                      </ActionForm>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionForm action={retireRuleAction} submit={r.retired ? "Restore" : "Retire"} ghost className="contents">
                          <Hidden season={season} /><input type="hidden" name="rule" value={r.key} /><input type="hidden" name="retire" value={r.retired ? "false" : "true"} />
                        </ActionForm>
                        {!used ? (
                          <ActionForm action={removeRuleAction} submit="Delete" ghost className="contents" confirm={`Delete "${r.name}"?`}>
                            <Hidden season={season} /><input type="hidden" name="rule" value={r.key} />
                          </ActionForm>
                        ) : null}
                      </div>
                    </EditRow>
                  )}
                </div>
              );
            })}
          </div>

          {season.status !== "ARCHIVED" ? (
            <Card className="mt-4 p-4">
              <h3 className="mb-2 font-semibold">Add a rule</h3>
              <ActionForm action={addRuleAction} submit="Add rule" resetOnSuccess>
                <Hidden season={season} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name"><input name="name" required className={inputCls} /></Field>
                  <Field label="Group"><input name="category" list="rule-groups" placeholder="Other" className={inputCls} /></Field>
                  <Field label="Entered as">
                    <select name="inputType" defaultValue="boolean" className={inputCls}>
                      <option value="boolean">On / off</option>
                      <option value="quantity">Count (× value)</option>
                      <option value="choice">Choose an option</option>
                      <option value="manual">Manual ± with note</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {phases.map((p) => (
                    <Field key={p} label={p}><input name={p} type="number" step="any" className={inputCls} /></Field>
                  ))}
                </div>
                <Field label="Options (choice rules only)" hint="One per line: Label | pre-merge | post-merge | finale."><textarea name="options" rows={3} className={`${inputCls} font-mono`} /></Field>
                <Field label="Note"><input name="note" className={inputCls} /></Field>
              </ActionForm>
            </Card>
          ) : null}
          <datalist id="rule-groups">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </section>

        {access?.kind === "admin" ? (
          <section id="danger" className="scroll-mt-44">
            <SectionHeader>Danger zone</SectionHeader>
            <Card className="border-bad/40 p-4">
              <h3 className="mb-1 font-semibold text-bad">Delete this season</h3>
              <p className="mb-3 text-sm text-muted">
                Permanently removes {season.name} — every castaway, team, episode, score, correction, login and audit row. This cannot be undone. Type the season&apos;s exact name to confirm.
              </p>
              <ActionForm action={deleteSeasonAction} submit={`Delete ${season.name}`} confirm={`Delete ${season.name} permanently? There is no way to get this back.`}>
                <Hidden season={season} />
                <Field label="Season name"><input name="confirmName" placeholder={season.name} required className={inputCls} /></Field>
              </ActionForm>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}
