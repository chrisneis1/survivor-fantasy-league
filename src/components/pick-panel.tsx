"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endTurnAction, openingPickAction, replacementAction } from "@/server/actions";
import type { PickCandidate, PickSlot } from "@/lib/picker";
import { btnCls, btnGhostCls, inputCls } from "./styles";

/**
 * The member's pick surface. Every castaway stays listed; ones that are blocked for the chosen slot are disabled with the reason.
 * The server re-checks every rule when the pick is committed, so this list is a convenience, never the authority.
 */
export function PickPanel({
  seasonId,
  mode,
  slots,
  candidates,
  remaining,
}: {
  seasonId: string;
  mode: "opening" | "replace";
  slots: PickSlot[];
  candidates: PickCandidate[];
  /** Replacements still available this turn (replace mode). */
  remaining?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [slot, setSlot] = useState<number>(slots[0]?.index ?? 0);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "open">("all");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const chosen = slots.find((s) => s.index === slot) ?? slots[0];
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return candidates
      .filter((c) => (!term || c.name.toLowerCase().includes(term)) && (show === "all" || !c.blocked[chosen?.index ?? -1]))
      .sort((a, b) => Number(!!a.blocked[chosen?.index ?? -1]) - Number(!!b.blocked[chosen?.index ?? -1]) || a.name.localeCompare(b.name));
  }, [candidates, q, show, chosen]);

  const run = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: r.ok ?? "Done." });
      router.refresh();
    });

  const pick = (c: PickCandidate) => {
    if (!chosen) return;
    const what = mode === "opening" ? `Pick ${c.name} for your ${chosen.name} slot?` : `Take ${c.name} for your ${chosen.name} slot (${chosen.hint.toLowerCase()})?`;
    if (!window.confirm(`${what}\n\nThis can't be undone.`)) return;
    run(() => (mode === "opening" ? openingPickAction(seasonId, chosen.index, c.id) : replacementAction(seasonId, chosen.index, c.id)));
  };

  if (!chosen) return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Nothing left to fill.</p>;

  return (
    <div>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted">{mode === "opening" ? "Fill which slot?" : "Replace which slot?"}</legend>
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <label
              key={s.index}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${s.index === chosen.index ? "border-accent bg-accent/10" : "border-line bg-surface"}`}
            >
              <input type="radio" name="slot" className="sr-only" checked={s.index === chosen.index} onChange={() => setSlot(s.index)} />
              <span className="block font-semibold">{s.name}</span>
              <span className="block text-xs text-muted">{s.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search castaways" aria-label="Search castaways" className={`${inputCls} max-w-xs`} />
        <button type="button" className={btnGhostCls} onClick={() => setShow(show === "all" ? "open" : "all")} aria-pressed={show === "open"}>
          {show === "open" ? "Showing selectable only" : "Show selectable only"}
        </button>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {list.map((c) => {
          const why = c.blocked[chosen.index];
          return (
            <li key={c.id} className={`flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 ${why ? "opacity-60" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: c.tribeColor }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="block text-sm text-muted">
                  {c.tribeName} · <span className="num">{c.owners}</span> of <span className="num">{c.cap}</span> owners
                </span>
              </span>
              {why ? (
                <span className="rounded-full border border-bad/40 bg-bad/10 px-2.5 py-0.5 text-xs font-semibold text-bad">✕ {why}</span>
              ) : (
                <button type="button" disabled={pending} onClick={() => pick(c)} className={btnCls}>
                  Pick
                </button>
              )}
            </li>
          );
        })}
        {list.length === 0 ? <li className="px-4 py-4 text-sm text-muted">No castaways match.</li> : null}
      </ul>

      <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center gap-3">
          {mode === "replace" ? (
            <>
              <button type="button" disabled={pending} className={btnGhostCls} onClick={() => window.confirm("Finish your turn? Any picks you don't use are simply not taken, and you keep your unused swap credits.") && run(() => endTurnAction(seasonId))}>
                Done / pass remaining picks
              </button>
              <span className="text-sm text-muted">{remaining === undefined ? "" : `${remaining} ${remaining === 1 ? "pick" : "picks"} left`}</span>
            </>
          ) : (
            <span className="text-sm text-muted">Each pick fills one slot. The next team is up straight after.</span>
          )}
        </div>
        {msg ? (
          <p role={msg.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm font-medium ${msg.kind === "error" ? "text-bad" : "text-good"}`}>
            {msg.kind === "error" ? "✕" : "✓"} {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
