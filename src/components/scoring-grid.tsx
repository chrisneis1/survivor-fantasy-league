"use client";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cellKey, resolveInput, resolveRow, optionPoints, statusTypes } from "@/domain/scoring";
import type { DraftRow, Phase, RuleInput, ScoringRule, StatusType } from "@/domain/types";
import { editScoringAction, publishEpisodeAction, saveScoringAction } from "@/server/actions";
import { btnCls, btnGhostCls, inputCls } from "./styles";

export interface GridTribe {
  id: string;
  name: string;
  color: string;
}
export interface GridCastaway {
  id: string;
  name: string;
  /** Current tribe as of this episode, before anything is edited in this session. */
  tribeId: string;
  /** Members whose team counts this castaway for this episode. */
  owners: string[];
}
export interface GridTeam {
  id: string;
  member: string;
  /** Castaway ids that count for this team this episode (per the episode's roster policy). */
  roster: string[];
}

const exitLabel: Record<StatusType, string> = {
  VOTED_OUT: "Voted out",
  MEDICAL_EVACUATION: "Medical evacuation",
  QUIT: "Quit",
  OTHER_EXIT: "Other exit",
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** One checkbox in a same-cell group. Checking one unchecks the rest; checking the checked one clears it (unless `clearable` is false, for tribe — a castaway is always on exactly one). `big` is the touch-sized version for phones. */
function CheckOption({ checked, onToggle, disabled, label, ariaLabel, big = false }: { checked: boolean; onToggle: () => void; disabled?: boolean; label: ReactNode; ariaLabel: string; big?: boolean }) {
  return (
    <label className={`flex items-center leading-tight ${big ? "min-h-10 gap-2.5 text-sm" : "gap-1.5 text-xs"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} aria-label={ariaLabel} className={`${big ? "size-5" : "size-3.5"} shrink-0 accent-[var(--accent)]`} />
      {label}
    </label>
  );
}

/** Whether anything has been entered for a rule (used for the "n scored" count on phones). */
const hasInput = (i: RuleInput | undefined) => !!i && (!!i.on || (i.quantity ?? 0) > 0 || i.option !== undefined || i.points !== undefined);

export function ScoringGrid({
  seasonId,
  episode,
  episodeTitle,
  phase,
  rules,
  tribes,
  castaways,
  teams,
  initialRows,
  blockers,
  lastSaved,
  mode = "score",
  exitsLocked = false,
}: {
  seasonId: string;
  episode: number;
  episodeTitle: string;
  phase: Phase;
  rules: ScoringRule[];
  tribes: GridTribe[];
  castaways: GridCastaway[];
  teams: GridTeam[];
  initialRows: DraftRow[];
  blockers: string[];
  lastSaved?: string;
  /** "score": the live pre-publish grid (Save progress / Publish). "edit": editing a published episode's scoring, with a reason and exits that turn a row red and drop it to the bottom. */
  mode?: "score" | "edit";
  /** True once a pick window has used this episode's exits: who left can no longer be changed here, only scores. */
  exitsLocked?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Record<string, DraftRow>>(() => Object.fromEntries(initialRows.map((r) => [r.castaway, r])));
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Edit mode only: exactly which cells the commissioner changed. correctEpisode only ever looks at these, so a
  // cell the grid could not perfectly redisplay from history is never silently rewritten by an unrelated edit.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  // Phones: score one castaway at a time, or one rule down the whole cast (fastest for tribe-wide results).
  const [mobileView, setMobileView] = useState<"castaway" | "rule">("castaway");
  const [mobileRule, setMobileRule] = useState<string>(rules[0]?.key ?? "exit");
  const ruleSelectId = useId();

  const rowOf = (id: string): DraftRow => rows[id] ?? { castaway: id, inputs: {} };
  const tribeOf = (id: string) => rowOf(id).tribe ?? castaways.find((c) => c.id === id)?.tribeId;
  const resolved = useMemo(() => Object.fromEntries(castaways.map((c) => [c.id, resolveRow({ rules }, phase, rowOf(c.id))])), [rows, castaways, rules, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const setInput = (id: string, key: string, patch: RuleInput) => {
    setDirty(true);
    if (mode === "edit") setTouched((prev) => new Set(prev).add(cellKey(id, key)));
    setRows((prev) => {
      const row = prev[id] ?? { castaway: id, inputs: {} };
      return { ...prev, [id]: { ...row, inputs: { ...row.inputs, [key]: { ...row.inputs[key], ...patch } } } };
    });
  };
  /** Sets or clears a same-cell radio value (exit only — tribe uses setTribe, which never clears). */
  const setChoice = (id: string, key: string, current: string | undefined, value: string) => {
    setDirty(true);
    if (mode === "edit") setTouched((prev) => new Set(prev).add(cellKey(id, key)));
    const next = current === value ? undefined : value;
    if (key === "exit") {
      setRows((prev) => {
        const row = prev[id] ?? { castaway: id, inputs: {} };
        return { ...prev, [id]: { ...row, exit: next ? { type: next as StatusType } : undefined } };
      });
    } else {
      // Always include `option` in the patch, even when clearing: setInput merges the patch onto the
      // existing cell, so an empty `{}` patch (the old code here) left the previous option in place
      // and the checkbox could never be unchecked.
      setInput(id, key, { option: next === undefined ? undefined : Number(next) });
    }
  };
  const setTribe = (id: string, tribeId: string) => {
    setDirty(true);
    if (mode === "edit") setTouched((prev) => new Set(prev).add(cellKey(id, "tribe")));
    setRows((prev) => {
      const row = prev[id] ?? { castaway: id, inputs: {} };
      return { ...prev, [id]: { ...row, tribe: tribeId } };
    });
  };

  const payload = () => Object.values(rows);
  const teamImpact = teams
    .map((t) => ({ ...t, points: t.roster.reduce((s, c) => s + (resolved[c]?.total ?? 0), 0) }))
    .sort((a, b) => b.points - a.points);
  // Pre-publish: every cell was just typed in, so any error anywhere blocks Publish, as before. In edit mode a cell
  // nobody touched may not be perfectly redisplayed from history (see rowsFromPublished) — that is not the
  // commissioner's problem to fix, and it never blocks Save or gets reported as though they broke something.
  const problems = useMemo(() => {
    if (mode !== "edit") return Object.values(resolved).flatMap((r) => r.errors.map((e) => `${castaways.find((c) => c.id === r.castaway)?.name}: ${e}`));
    const out: string[] = [];
    for (const key of touched) {
      const [id, field] = [key.slice(0, key.lastIndexOf(":")), key.slice(key.lastIndexOf(":") + 1)];
      const rule = rules.find((r) => r.key === field);
      const c = castaways.find((x) => x.id === id);
      if (!rule || !c) continue; // "exit" and "tribe" are not scoring rules; neither can produce a resolveInput error
      try {
        resolveInput(rule, phase, rowOf(id).inputs[field] ?? {});
      } catch (e) {
        out.push(`${c.name}: ${(e as Error).message}`);
      }
    }
    return out;
  }, [mode, touched, rules, castaways, phase, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list stays grouped by each castaway's CURRENT tribe, live — check a different tribe box and they move to sit
  // with their new tribemates, so tallying a challenge result is just reading down one block. In edit mode, anyone
  // marked as having left this episode drops to the very bottom regardless of tribe and reads red: a settled result,
  // not something still being tallied. Scores typed elsewhere never reorder anything — only a tribe or exit change does.
  const orderedCastaways = useMemo(() => {
    const tribeRank = new Map(tribes.map((t, i) => [t.id, i]));
    return castaways
      .map((c, origIndex) => ({ c, origIndex, exited: mode === "edit" && !!rowOf(c.id).exit, tribe: tribeRank.get(tribeOf(c.id) ?? "") ?? tribes.length }))
      .sort((a, b) => Number(a.exited) - Number(b.exited) || a.tribe - b.tribe || a.origIndex - b.origIndex)
      .map((x) => x.c);
  }, [castaways, mode, rows, tribes]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () =>
    start(async () => {
      const r = await saveScoringAction(seasonId, episode, payload());
      if (r.error) setMsg({ kind: "error", text: r.error });
      else {
        setMsg({ kind: "ok", text: r.ok ?? "Saved." });
        setDirty(false);
        router.refresh();
      }
    });

  const publish = () => {
    if (!window.confirm(`Publish ${episodeTitle}? This makes the scores official and updates the public standings.`)) return;
    start(async () => {
      const r = await publishEpisodeAction(seasonId, episode, payload());
      if (r.error) setMsg({ kind: "error", text: r.error });
      else router.push(`/admin/${seasonId}`);
    });
  };

  const saveEdit = () => {
    if (!reason.trim() || touched.size === 0) return;
    if (!window.confirm(`Save these changes to ${episodeTitle}? Standings recalculate immediately.`)) return;
    start(async () => {
      const r = await editScoringAction(seasonId, episode, payload(), [...touched], reason);
      if (r.error) setMsg({ kind: "error", text: r.error });
      else {
        setMsg({ kind: "ok", text: r.ok ?? "Saved." });
        setDirty(false);
        setTouched(new Set());
        router.refresh();
      }
    });
  };

  const ruleHeader = (r: ScoringRule) => {
    if (r.inputType === "manual") return "Manual ±";
    if (r.inputType === "choice") return "";
    const v = r.points[phase];
    return v === null ? "" : r.inputType === "quantity" ? `${signed(v)} each` : signed(v);
  };
  // ---- the controls for one cell, shared by the desktop table and the phone layouts (same state, same labels) ----
  const tribeBoxes = (c: GridCastaway, big = false) => (
    <div className={`flex flex-wrap ${big ? "gap-x-4" : "my-1 gap-x-2 gap-y-0.5"}`}>
      {tribes.map((t) => (
        <CheckOption
          key={t.id}
          big={big}
          checked={tribeOf(c.id) === t.id}
          onToggle={() => setTribe(c.id, t.id)}
          ariaLabel={`${c.name} is currently on ${t.name}`}
          label={
            <span className="flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          }
        />
      ))}
    </div>
  );
  const ruleInput = (c: GridCastaway, r: ScoringRule, big = false) => {
    const input = rowOf(c.id).inputs[r.key] ?? {};
    if (r.inputType === "boolean")
      return <input type="checkbox" aria-label={`${r.name} for ${c.name}`} checked={!!input.on} onChange={(e) => setInput(c.id, r.key, { on: e.target.checked })} className={`${big ? "size-6" : "size-5"} accent-[var(--accent)]`} />;
    if (r.inputType === "quantity")
      return <input type="number" min={0} step={1} inputMode="numeric" aria-label={`${r.name} for ${c.name}`} value={input.quantity ?? ""} onChange={(e) => setInput(c.id, r.key, { quantity: e.target.value === "" ? undefined : Number(e.target.value) })} className={`${inputCls} ${big ? "w-20" : "w-16 px-2 py-1"}`} />;
    if (r.inputType === "choice")
      return (
        <div className={`grid ${big ? "gap-0" : "w-36 gap-0.5"}`}>
          {(r.options ?? []).map((o, i) => {
            const p = optionPoints(o, phase);
            if (p === null) return null;
            return (
              <CheckOption
                key={i}
                big={big}
                checked={input.option === i}
                onToggle={() => setChoice(c.id, r.key, input.option !== undefined ? String(input.option) : undefined, String(i))}
                ariaLabel={`${r.name} for ${c.name}: ${o.label}`}
                label={<span>{o.label} <span className="num text-muted">({signed(p)})</span></span>}
              />
            );
          })}
        </div>
      );
    return (
      <div className={`grid gap-1 ${big ? "grid-cols-[6rem_1fr] gap-2" : "w-40"}`}>
        <input type="number" step="any" inputMode="decimal" aria-label={`${r.name} points for ${c.name}`} value={input.points ?? ""} onChange={(e) => setInput(c.id, r.key, { points: e.target.value === "" ? undefined : Number(e.target.value) })} className={`${inputCls} ${big ? "" : "px-2 py-1"}`} />
        <input aria-label={`${r.name} note for ${c.name}`} placeholder="Note (required)" value={input.note ?? ""} onChange={(e) => setInput(c.id, r.key, { note: e.target.value })} className={`${inputCls} ${big ? "" : "px-2 py-1"}`} />
      </div>
    );
  };
  const exitBoxes = (c: GridCastaway, big = false) => (
    <>
      <div className={`grid ${big ? "gap-0 sm:grid-cols-2" : "w-36 gap-0.5"}`}>
        {statusTypes.map((t) => (
          <CheckOption
            key={t}
            big={big}
            checked={rowOf(c.id).exit?.type === t}
            disabled={exitsLocked}
            onToggle={() => setChoice(c.id, "exit", rowOf(c.id).exit?.type, t)}
            ariaLabel={`${c.name}: ${exitLabel[t]}`}
            label={exitLabel[t]}
          />
        ))}
      </div>
      {exitsLocked ? <p className="mt-1 text-[11px] text-muted">A pick window already used this result.</p> : null}
    </>
  );
  const totalCls = (n: number) => (n < 0 ? "text-bad" : n > 0 ? "text-good" : "text-muted");
  // Phones list castaways under a heading for their current tribe (and, when editing, "Left the game" last).
  const groups = orderedCastaways.reduce<{ label: string; color?: string; items: GridCastaway[] }[]>((acc, c) => {
    const out = mode === "edit" && !!rowOf(c.id).exit;
    const tribe = tribes.find((t) => t.id === tribeOf(c.id));
    const label = out ? "Left the game" : tribe?.name ?? "No tribe";
    const last = acc.at(-1);
    if (last && last.label === label) last.items.push(c);
    else acc.push({ label, color: out ? undefined : tribe?.color, items: [c] });
    return acc;
  }, []);
  const chosenRule = rules.find((r) => r.key === mobileRule);

  const headTh = "sticky top-0 z-20 bg-surface-2 px-2 py-2 align-bottom";
  const headCornerTh = "sticky top-0 z-30 bg-surface-2 px-3 py-2";

  return (
    <div>
      {blockers.length ? (
        <div role="note" className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <p className="mb-1 font-semibold text-accent">Not publishable yet</p>
          <ul className="list-disc pl-5 text-muted">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      ) : null}

      {/* A bounded, independently scrolling grid: the header row and the first two columns stay put in both
          directions while the rest scrolls, spreadsheet-style — independent of the page's own scroll position. */}
      <div className="hidden max-h-[75vh] overflow-auto rounded-2xl border border-line md:block">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th className={`sticky left-0 w-36 min-w-36 ${headCornerTh}`}>Castaway / tribe</th>
              <th className={`sticky left-36 text-right ${headCornerTh}`}>Total</th>
              {rules.map((r) => (
                <th key={r.key} className={headTh}>
                  <span className="block max-w-28 leading-tight">{r.name}</span>
                  <span className="num block font-normal normal-case tracking-normal">{ruleHeader(r)}</span>
                </th>
              ))}
              <th className={headTh}>Left the game</th>
            </tr>
          </thead>
          <tbody>
            {orderedCastaways.map((c) => {
              const row = rowOf(c.id);
              const res = resolved[c.id];
              const out = mode === "edit" && !!row.exit;
              const tribeId = tribeOf(c.id);
              return (
                <tr key={c.id} className={`border-t align-top ${out ? "border-bad/30 bg-bad/[0.06]" : "border-line"}`}>
                  <th scope="row" className={`sticky left-0 z-10 w-36 min-w-36 max-w-36 break-words px-3 py-2 text-left font-normal ${out ? "bg-bad/[0.06]" : "bg-surface"}`}>
                    <span className={`flex items-center gap-1.5 font-semibold ${out ? "text-bad" : ""}`}>
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: tribes.find((t) => t.id === tribeId)?.color ?? "#888" }} />
                      <span className={out ? "line-through decoration-bad/70" : ""}>{c.name}</span>
                    </span>
                    {tribeBoxes(c)}
                    <span className={`block text-xs ${out ? "text-bad/80" : "text-muted"}`} title={c.owners.join(", ")}>
                      {out ? exitLabel[row.exit!.type] : c.owners.length === 0 ? "On no team" : `On ${c.owners.length} ${c.owners.length === 1 ? "team" : "teams"}`}
                    </span>
                    {res.errors.map((e) => <span key={e} className="block text-xs text-bad">{e}</span>)}
                  </th>
                  <td className={`num sticky left-36 z-10 px-2 py-2 text-right text-base font-extrabold ${out ? "bg-bad/[0.06]" : "bg-surface"} ${res.total < 0 ? "text-bad" : res.total > 0 ? "text-good" : "text-muted"}`}>{signed(res.total)}</td>
                  {rules.map((r) => (
                    <td key={r.key} className="px-2 py-2">{ruleInput(c, r)}</td>
                  ))}
                  <td className="px-2 py-2">{exitBoxes(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: no sideways table. Either one card per castaway, or one rule down the whole cast. */}
      <div className="md:hidden">
        <div role="group" aria-label="Score by" className="mb-3 flex rounded-full border border-line-strong bg-bg-2 p-1">
          {(["castaway", "rule"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={mobileView === v} onClick={() => setMobileView(v)} className={`min-h-9 flex-1 rounded-full text-sm font-semibold transition-colors ${mobileView === v ? "bg-accent text-accent-ink" : "text-muted"}`}>
              {v === "castaway" ? "By castaway" : "By rule"}
            </button>
          ))}
        </div>
        {mobileView === "rule" ? (
          <div className="mb-3 text-sm">
            <label htmlFor={ruleSelectId} className="mb-1 block font-semibold">Rule</label>
            <select id={ruleSelectId} value={mobileRule} onChange={(e) => setMobileRule(e.target.value)} className={inputCls}>
              {rules.map((r) => <option key={r.key} value={r.key}>{r.name}{ruleHeader(r) ? ` (${ruleHeader(r)})` : ""}</option>)}
              <option value="exit">Left the game</option>
            </select>
          </div>
        ) : null}

        <div className="grid gap-4">
          {groups.map((g, gi) => (
            <section key={gi} aria-label={g.label}>
              <h3 className="eyebrow mb-2 flex items-center gap-2 text-muted">
                {g.color ? <span aria-hidden className="size-2.5 rounded-full" style={{ background: g.color }} /> : null}
                {g.label} <span className="num font-normal">· {g.items.length}</span>
              </h3>
              {mobileView === "rule" ? (
                <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                  {g.items.map((c) => (
                    <li key={c.id} className={`flex items-start justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0 ${mode === "edit" && rowOf(c.id).exit ? "bg-bad/[0.06]" : ""}`}>
                      <span className="min-w-0 pt-1.5">
                        <span className="block truncate font-semibold">{c.name}</span>
                        <span className={`num block text-xs font-bold ${totalCls(resolved[c.id].total)}`}>{signed(resolved[c.id].total)} total</span>
                        {resolved[c.id].errors.map((e) => <span key={e} className="block text-xs text-bad">{e}</span>)}
                      </span>
                      <span className="shrink-0 pt-1">{mobileRule === "exit" ? exitBoxes(c, true) : chosenRule ? ruleInput(c, chosenRule, true) : null}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="grid gap-2">
                  {g.items.map((c) => {
                    const row = rowOf(c.id);
                    const res = resolved[c.id];
                    const out = mode === "edit" && !!row.exit;
                    const scored = rules.filter((r) => hasInput(row.inputs[r.key])).length;
                    return (
                      <li key={c.id}>
                        <details className={`group rounded-2xl border ${out ? "border-bad/30 bg-bad/[0.06]" : res.errors.length ? "border-bad/50 bg-surface" : "border-line bg-surface"}`}>
                          <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate font-semibold ${out ? "text-bad line-through decoration-bad/70" : ""}`}>{c.name}</span>
                              <span className="block truncate text-xs text-muted">
                                {out ? exitLabel[row.exit!.type] : c.owners.length === 0 ? "On no team" : `On ${c.owners.length} ${c.owners.length === 1 ? "team" : "teams"}`}
                                {scored ? ` · ${scored} scored` : ""}
                                {res.errors.length ? <span className="text-bad"> · needs attention</span> : null}
                              </span>
                            </span>
                            <span className={`num text-xl font-extrabold ${totalCls(res.total)}`}>{signed(res.total)}</span>
                            <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
                          </summary>
                          <div className="grid gap-1 border-t border-line px-3 pb-3 pt-2">
                            <div className="py-1">
                              <p className="eyebrow mb-1 text-muted">Tribe now</p>
                              {tribeBoxes(c, true)}
                            </div>
                            {rules.map((r) => {
                              const stacked = r.inputType === "choice" || r.inputType === "manual";
                              return (
                                <div key={r.key} className={`border-t border-line py-2 ${stacked ? "grid gap-1.5" : "flex items-center justify-between gap-3"}`}>
                                  <span className="min-w-0 text-sm">
                                    <span className="font-medium">{r.name}</span>
                                    {ruleHeader(r) ? <span className="num ml-1.5 text-xs text-muted">{ruleHeader(r)}</span> : null}
                                  </span>
                                  {ruleInput(c, r, true)}
                                </div>
                              );
                            })}
                            <div className="border-t border-line pt-2">
                              <p className="eyebrow mb-1 text-muted">Left the game</p>
                              {exitBoxes(c, true)}
                            </div>
                            {res.errors.map((e) => <p key={e} className="text-xs text-bad">{e}</p>)}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>

      <details className="mt-6 rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 font-semibold">
          Team impact preview <span className="font-normal text-muted">· what {mode === "edit" ? "saving" : "publishing"} would give each team</span>
        </summary>
        <ol className="grid gap-x-6 px-4 pb-4 sm:grid-cols-2">
          {teamImpact.map((t) => (
            <li key={t.id} className="flex items-center justify-between border-b border-line py-1.5 text-sm">
              <span>{t.member}</span>
              <span className={`num font-bold ${t.points < 0 ? "text-bad" : t.points > 0 ? "text-good" : "text-muted"}`}>{signed(t.points)}</span>
            </li>
          ))}
        </ol>
      </details>

      {/* On desktop, deliberately NOT sticky: the table above has its own bounded scroll area, and a viewport-pinned
          footer would paint over its last rows and swallow the scroll-wheel input meant for them. Phones have no
          inner scroll area, so there the save controls stay pinned to the bottom of the screen. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line-strong bg-bg-2/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-bg/95 md:pb-3 md:backdrop-blur-none">
        {mode === "edit" ? (
          <div className="grid gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Reason for this edit (required, applies to every change below)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fixed a missed idol play" className={`${inputCls} max-w-md`} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending || problems.length > 0 || !reason.trim() || touched.size === 0}
                className={btnCls}
                title={problems.length ? "Fix the highlighted problems" : !reason.trim() ? "A reason is required" : touched.size === 0 ? "Change something first" : undefined}
              >
                Save changes
              </button>
              <span className="text-xs text-muted" aria-live="polite">
                {pending ? "Working…" : touched.size === 0 ? "Nothing changed yet" : "Standings recalculate as soon as you save"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={pending} className={btnGhostCls}>Save progress</button>
            <button type="button" onClick={publish} disabled={pending || problems.length > 0 || dirty} className={btnCls} title={dirty ? "Save your changes first" : problems.length ? "Fix the highlighted problems" : undefined}>
              Publish {episodeTitle}
            </button>
            <span className="text-xs text-muted" aria-live="polite">
              {pending ? "Working…" : dirty ? "Unsaved changes" : lastSaved ? `Saved ${lastSaved}` : "Nothing saved yet"}
            </span>
          </div>
        )}
        {problems.length ? <p className="mt-2 text-xs text-bad">{problems.length} {problems.length === 1 ? "problem" : "problems"} to fix before {mode === "edit" ? "saving" : "publishing"}.</p> : null}
        {msg ? <p role={msg.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm font-medium ${msg.kind === "error" ? "text-bad" : "text-good"}`}>{msg.kind === "error" ? "✕" : "✓"} {msg.text}</p> : null}
      </div>
    </div>
  );
}
