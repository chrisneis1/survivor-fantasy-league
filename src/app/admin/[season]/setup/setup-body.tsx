import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { Card, PageTitle, Pill, SectionTitle } from "@/components/ui";
import { optionsToText, ruleUsed, rulePhases, layoutOf } from "@/domain/template";
import { validateSetup, type SetupIssue } from "@/domain/setup";
import type { Season } from "@/domain/types";
import { store } from "@/server";
import { getAccess } from "@/server/auth";
import {
  addCastawayAction,
  addEpisodeAction,
  addSlotAction,
  addTeamAction,
  addTribeAction,
  removeCastawayAction,
  updateCastawayAction,
  removeLastEpisodeAction,
  removeSlotAction,
  removeTeamAction,
  renameTeamAction,
  removeTribeAction,
  saveRosterAction,
  saveSeedAction,
  updateBasicsAction,
  updateEpisodeAction,
  updateRuleAction,
  addRuleAction,
  removeRuleAction,
  retireRuleAction,
  applyEpisodeLayoutAction,
  applyRosterLayoutAction,
  applyTemplateAction,
  saveTemplateAction,
  deleteTemplateAction,
  deleteSeasonAction,
  drawOrderAction,
} from "@/server/actions";

const Hidden = ({ season }: { season: Season }) => <input type="hidden" name="seasonId" value={season.id} />;

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

  return (
    <>
      <PageTitle eyebrow="Commissioner" title="Season setup">
        {editable
          ? "Work top to bottom. Each section shows what is still missing; the season can be activated when none remain."
          : "The season is locked. Only episode structure and scoring values can still change, and every change is logged."}
      </PageTitle>

      <div className="grid gap-10">
        <section>
          <SectionTitle>1 · Basics</SectionTitle>
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
                  <Field label="Rule that marks the season winner" hint="Used to settle the final wager."><select name="winnerRule" defaultValue={season.config.wager.winnerRule} className={inputCls}>{season.rules.filter((r) => !r.retired).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></Field>
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

        <section>
          <SectionTitle>2 · Tribes, roster slots and cast</SectionTitle>
          <Card className="grid gap-6 p-4">
            <Issues issues={issues} section="cast" />
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
              {editable ? (
                <ActionForm action={applyRosterLayoutAction} submit="Build slots" ghost confirm="Replace the roster slots? Teams' rosters must still be empty.">
                  <Hidden season={season} />
                  <p className="text-sm text-muted">Quick layout: how many castaways each team picks from every tribe, plus any wild picks. Two tribes with 2 each gives four slots.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Picks from each tribe"><input name="perTribe" type="number" min={0} max={6} defaultValue={2} required className={inputCls} /></Field>
                    <Field label="Wild picks (any tribe)"><input name="wild" type="number" min={0} max={6} defaultValue={0} className={inputCls} /></Field>
                  </div>
                </ActionForm>
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
                      <ActionForm action={updateCastawayAction} submit="Save" ghost className="flex flex-1 flex-wrap items-center gap-2">
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

        <section>
          <SectionTitle>3 · Teams and opening order</SectionTitle>
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
              <ActionForm action={addTeamAction} submit="Add team" ghost resetOnSuccess>
                <Hidden season={season} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Member"><input name="member" required className={inputCls} /></Field>
                  <Field label="Team name" hint="Optional."><input name="teamName" className={inputCls} /></Field>
                </div>
              </ActionForm>
            ) : null}
            {editable && season.teams.length > 1 ? (
              <ActionForm action={drawOrderAction} submit={season.config.openingSeedMethod === "RANDOM_DRAW" && season.config.openingSeed.length ? "Draw again" : "Draw the order"} confirm={season.config.openingSeed.length && season.config.openingSeedMethod === "RANDOM_DRAW" ? "Draw a new order? The current drawn order is replaced." : undefined}>
                <Hidden season={season} />
                <h3 className="font-semibold">Random draw</h3>
                <p className="-mt-2 text-sm text-muted">The draft is one pick at a time. A random draw sets the order, and each round then reverses it (drawn Jon, Christian, Shane means the next round goes Shane, Christian, Jon). The result is recorded in the audit log.</p>
                {season.config.openingSeed.length === season.teams.length ? (
                  <ol className="grid gap-1 text-sm sm:grid-cols-2">
                    {season.config.openingSeed.map((id, i) => (
                      <li key={id}><span className="num mr-2 text-muted">{i + 1}.</span>{season.teams.find((t) => t.id === id)?.member}</li>
                    ))}
                  </ol>
                ) : null}
              </ActionForm>
            ) : null}
            {editable && season.teams.length > 0 ? (
              <ActionForm action={saveSeedAction} submit="Save opening order" ghost>
                <Hidden season={season} />
                <h3 className="font-semibold">Or enter the order yourself</h3>
                <p className="-mt-2 text-sm text-muted">For example, if you spun a wheel elsewhere. The first position drafts first. This order also breaks ties for weekly pick order (later position picks first).</p>
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

        <section>
          <SectionTitle>4 · Opening rosters</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-muted">Entered by the commissioner for now. Member self-service picking arrives in a later phase; this entry is logged with a reason.</p>
          {season.teams.length === 0 ? (
            <p className="text-sm text-muted">Add teams first.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {season.teams.map((t) => (
                <Card key={t.id} className="p-4">
                  <p className="mb-2 font-semibold">{t.member}</p>
                  {editable ? (
                    <ActionForm action={saveRosterAction} submit="Save roster">
                      <Hidden season={season} /><input type="hidden" name="teamId" value={t.id} />
                      {season.slots.map((sl, i) => (
                        <Field key={sl.id} label={sl.name}>
                          <select name={`slot_${i}`} defaultValue={t.draft[i] ?? ""} className={inputCls}>
                            <option value="">— not picked —</option>
                            {season.castaways.filter((c) => !sl.restrictionTribeId || c.initialTribeId === sl.restrictionTribeId).map((c) => (
                              <option key={c.id} value={c.id}>{c.name}{sl.restrictionTribeId ? "" : ` (${tribeName(c.initialTribeId)})`}</option>
                            ))}
                          </select>
                        </Field>
                      ))}
                    </ActionForm>
                  ) : (
                    <p className="text-sm text-muted">{t.draft.map((c) => season.castaways.find((x) => x.id === c)?.name ?? "—").join(" · ")}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>5 · Episodes</SectionTitle>
          <Card className="grid gap-4 p-4">
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
              <div key={e.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                {e.state === "PUBLISHED" || season.status === "ARCHIVED" ? (
                  <p className="text-sm">
                    <strong>{e.title}</strong> <span className="text-muted">· {e.phase} · {e.rosterPolicy.toLowerCase().replace("_", " ")}</span> <Pill tone="good">Locked</Pill>{" "}
                    {e.excludeFromStandings ? <Pill>Doesn&apos;t count</Pill> : null}
                  </p>
                ) : (
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

        <section>
          <SectionTitle>6 · Scoring rules</SectionTitle>
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

          <div className="grid gap-3">
            {season.rules.map((r) => {
              const used = ruleUsed(season, r.key);
              return (
                <Card key={r.key} className={`p-4 ${r.retired ? "opacity-70" : ""}`}>
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.name}
                    <Pill>{r.inputType}</Pill>
                    {r.retired ? <Pill tone="bad">Retired</Pill> : null}
                    {used ? <Pill tone="good">In use</Pill> : null}
                    <span className="text-xs font-normal text-muted">scores in: {rulePhases(r).join(", ") || "no phase"}</span>
                  </p>
                  {season.status === "ARCHIVED" ? (
                    <p className="mt-1 text-sm text-muted">{r.note}</p>
                  ) : (
                    <>
                      <ActionForm action={updateRuleAction} submit="Save rule" ghost>
                        <Hidden season={season} /><input type="hidden" name="rule" value={r.key} />
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <Field label="Name"><input name="name" defaultValue={r.name} required className={inputCls} /></Field>
                          <Field label="Group"><input name="category" list="rule-groups" defaultValue={r.category} className={inputCls} /></Field>
                          {used ? (
                            <Field label="Entered as" hint="Locked: this rule has been scored."><input value={r.inputType} readOnly className={inputCls} /></Field>
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
                    </>
                  )}
                </Card>
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
          <section>
            <SectionTitle>Danger zone</SectionTitle>
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
