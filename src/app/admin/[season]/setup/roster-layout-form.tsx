"use client";
import { useState } from "react";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { applyRosterLayoutAction } from "@/server/actions";

/**
 * The quick roster-slot builder. "Picks from each tribe" is multiplied by the tribes that exist right now, so the
 * form spells out exactly what it will build — how many castaways each team drafts, and from where — before it's
 * applied. (Slots built while only a placeholder tribe existed are the classic way to end up with too few picks.)
 */
export function RosterLayoutForm({ seasonId, tribes, skipped, initial }: { seasonId: string; tribes: { id: string; name: string }[]; skipped: string[]; initial: { perTribe: number; wild: number } }) {
  const [perTribe, setPerTribe] = useState(String(initial.perTribe));
  const [wild, setWild] = useState(String(initial.wild));
  const p = Number(perTribe);
  const w = Number(wild || 0);
  const valid = Number.isInteger(p) && Number.isInteger(w) && p >= 0 && w >= 0 && p <= 6 && w <= 6;
  const total = valid ? p * tribes.length + w : 0;
  const parts = valid ? [...(p ? tribes.map((t) => `${p} from ${t.name}`) : []), ...(w ? [`${w} wild`] : [])] : [];

  return (
    <ActionForm
      action={applyRosterLayoutAction}
      submit={total ? `Build ${total} slots` : "Build slots"}
      ghost
      disabled={!valid || total === 0 || tribes.length === 0}
      confirm={`Replace the roster slots? Each team will draft ${total} castaway${total === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}. Teams' rosters must still be empty.`}
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <p className="text-sm text-muted">Quick layout: how many castaways each team picks from every tribe, plus any wild picks from any tribe.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Picks from each tribe"><input name="perTribe" type="number" min={0} max={6} value={perTribe} onChange={(e) => setPerTribe(e.target.value)} required className={inputCls} /></Field>
        <Field label="Wild picks (any tribe)"><input name="wild" type="number" min={0} max={6} value={wild} onChange={(e) => setWild(e.target.value)} className={inputCls} /></Field>
      </div>
      <p role="status" aria-live="polite" className={`rounded-lg border px-3 py-2 text-sm ${tribes.length <= 1 ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-surface-2 text-ink-2"}`}>
        {tribes.length === 0 ? (
          "Add the tribes first — slots are built for the tribes (with castaways) that exist when you build them."
        ) : !valid ? (
          "Use whole numbers from 0 to 6."
        ) : (
          <>
            With {tribes.length === 1 ? "1 tribe" : `${tribes.length} tribes`} ({tribes.map((t) => t.name).join(", ")}), this builds <strong className="text-ink">{total} slots</strong>, so each team drafts <strong className="text-ink">{total} castaways</strong>
            {parts.length ? `: ${parts.join(", ")}` : ""}.
            {skipped.length ? ` ${skipped.join(", ")} ${skipped.length === 1 ? "has" : "have"} no castaways, so ${skipped.length === 1 ? "it gets" : "they get"} no slots.` : ""}
            {tribes.length === 1 ? " Only one tribe has castaways so far — if the real tribes aren't set up yet, add them and move the cast first, then build the slots." : ""}
          </>
        )}
      </p>
    </ActionForm>
  );
}
