// League-specific building blocks shared across pages. They render data they are given; any league rule they rely on
// (who is active, which tribe) comes from the same engine helpers the pages already used.
import Link from "next/link";
import type { ReactNode } from "react";
import type { QueueStatus, Season, StandingRow } from "@/domain/types";
import { seasonPath } from "@/lib/format";
import { teamOf } from "@/lib/view";
import { IconArrowRight, IconCheck, IconClock, IconPass, IconPlay, IconSkip } from "./icons";
import { Movement, RankBadge, ScoreChange, StatusBadge, TribeDot, YouBadge } from "./ui";

// ---------- pick queue ----------

const queueStatusView: Record<QueueStatus, { Icon: typeof IconCheck; label: string; tone: "neutral" | "accent" | "good" | "warn" | "bad" }> = {
  WAITING: { Icon: IconClock, label: "Waiting", tone: "neutral" },
  UP_NOW: { Icon: IconPlay, label: "Up now", tone: "accent" },
  COMPLETED: { Icon: IconCheck, label: "Picked", tone: "good" },
  PASSED: { Icon: IconPass, label: "Passed", tone: "neutral" },
  AUTO_SKIPPED: { Icon: IconSkip, label: "Auto-skipped", tone: "warn" },
};

/** One position in a pick queue, drawn as a node on a vertical timeline. */
export function QueueItem({
  position,
  status,
  label,
  team,
  member,
  meta,
  mine,
  children,
}: {
  position: number;
  status: QueueStatus;
  /** Overrides the status label (e.g. "No pick recorded" on rebuilt archive queues). */
  label?: string;
  team: string;
  member: string;
  meta?: ReactNode;
  mine?: boolean;
  children?: ReactNode;
}) {
  const v = queueStatusView[status];
  // Teams that sat this one out take a single quiet line, so the active part of the queue stays in view.
  if ((status === "AUTO_SKIPPED" || status === "PASSED") && !children) {
    return (
      <li className="relative flex items-center gap-3 pb-2 last:pb-0 before:absolute before:bottom-0 before:left-[17px] before:top-8 before:w-px before:bg-line last:before:hidden">
        <span className="display num relative z-10 mx-1 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-bg-2 text-sm font-bold text-muted" aria-hidden>
          {position}
        </span>
        <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-sm ${mine ? "border-accent/40" : "border-line"}`}>
          <span className="sr-only">Position {position}:</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-ink-2">{team}</span>
            <span className="text-muted"> · {member}</span>
          </span>
          {mine ? <YouBadge /> : null}
          <StatusBadge tone={v.tone}>
            <v.Icon size={12} />
            {label ?? v.label}
          </StatusBadge>
        </div>
      </li>
    );
  }
  const node =
    status === "UP_NOW"
      ? "border-accent bg-accent text-accent-ink shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
      : status === "COMPLETED"
        ? "border-good/60 bg-good/15 text-good"
        : status === "WAITING"
          ? "border-line-strong bg-surface-2 text-ink-2"
          : "border-line bg-bg-2 text-muted";
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0 before:absolute before:bottom-0 before:left-[17px] before:top-9 before:w-px before:bg-line last:before:hidden">
      <span className={`display num relative z-10 grid size-9 shrink-0 place-items-center rounded-full border text-base font-extrabold ${node}`} aria-hidden>
        {position}
      </span>
      <div
        className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 ${
          status === "UP_NOW" ? "border-accent/60 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]" : mine ? "border-accent/35 bg-accent/[0.05]" : "border-line bg-surface"
        } ${status === "AUTO_SKIPPED" || status === "PASSED" ? "opacity-80" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="sr-only">Position {position}:</span>
              <span className="truncate font-semibold text-ink">{team}</span>
              {mine ? <YouBadge /> : null}
            </p>
            <p className="truncate text-sm text-muted">
              {member}
              {meta ? <> · {meta}</> : null}
            </p>
          </div>
          <StatusBadge tone={v.tone} className="mt-0.5">
            <v.Icon size={12} />
            {label ?? v.label}
          </StatusBadge>
        </div>
        {children ? <div className="mt-1.5 text-sm">{children}</div> : null}
      </div>
    </li>
  );
}

/** Out → In, as two name tokens. */
export function SwapLine({ out, into, slot, free }: { out: string; into: string; slot?: string; free?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="text-muted line-through decoration-bad/60">{out}</span>
      <IconArrowRight size={14} className="text-accent" />
      <span className="font-semibold text-ink">{into}</span>
      {slot ? <span className="rounded-md border border-line-strong px-1.5 py-px text-[11px] font-semibold text-ink-2">{slot}</span> : null}
      {free ? <StatusBadge tone="good">Free pick</StatusBadge> : null}
    </span>
  );
}

/** One turn in the activity feed: who, and each move they made. */
export function ActivityItem({ member, team, count, children }: { member: string; team: string; count: number; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)]" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold text-ink">{member}</span>
          <span className="truncate text-muted">{team}</span>
          {count > 1 ? <StatusBadge tone="accent">{count} picks in one turn</StatusBadge> : null}
        </p>
        <ul className="mt-1 grid gap-1 text-sm">{children}</ul>
      </div>
    </li>
  );
}

// ---------- standings ----------

/** A compact standings list for side panels and previews. */
export function StandingsMini({ season, rows, me, limit }: { season: Season; rows: StandingRow[]; me?: string | null; limit?: number }) {
  return (
    <ol>
      {rows.slice(0, limit ?? rows.length).map((r) => {
        const t = teamOf(season, r.teamId);
        const mine = r.teamId === me;
        return (
          <li key={r.teamId} className="border-b border-line last:border-b-0">
            <Link href={seasonPath(season.id, `/teams/${r.teamId}`)} className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2 sm:px-4 ${mine ? "bg-accent/[0.07]" : ""}`}>
              <span className="flex w-9 flex-col items-center gap-0.5">
                <RankBadge rank={r.rank} tied={r.tied} size="sm" />
                <Movement value={r.movement} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-ink">{t.name}</span>
                  {mine ? <YouBadge /> : null}
                </span>
                <span className="block truncate text-sm text-muted">{t.member}</span>
              </span>
              <ScoreChange n={r.latest} className="text-sm font-semibold" />
              <span className="display num w-11 text-right text-2xl font-extrabold">{r.total}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- roster ----------

/** One roster slot: slot type, castaway, tribe, whether they're still in the game, and optionally points. */
export function RosterSlot({
  slotName,
  name,
  href,
  tribe,
  out,
  points,
  pointsLabel = "pts",
  compact = false,
}: {
  slotName: string;
  name?: string;
  href?: string;
  tribe?: { name: string; color: string };
  /** e.g. "Voted out · Ep 5" when the castaway has left the game. */
  out?: string;
  points?: number;
  pointsLabel?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <li className="flex min-w-0 items-center gap-2 py-1">
        <span className="w-12 shrink-0 truncate text-[10px] font-bold uppercase tracking-wider text-muted">{slotName}</span>
        {tribe ? <TribeDot color={tribe.color} className={out ? "opacity-40" : ""} /> : null}
        <span className={`min-w-0 truncate text-sm ${out ? "text-muted" : "font-medium text-ink"}`}>{name ?? "—"}</span>
        {out ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-bad/90" title={out}>Out</span> : null}
      </li>
    );
  }
  const body = (
    <>
      <span className="absolute inset-y-0 left-0 w-1 rounded-l-[var(--radius-card)]" style={{ background: tribe && !out ? tribe.color : "var(--line-strong)" }} aria-hidden />
      <div className="min-w-0">
        <p className="eyebrow text-muted">{slotName} slot</p>
        <p className={`display mt-0.5 truncate text-xl font-bold uppercase leading-tight ${out ? "text-ink-2" : "text-ink"}`}>{name ?? "Not picked yet"}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {tribe ? (
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <TribeDot color={tribe.color} /> {tribe.name}
            </span>
          ) : null}
          {name ? out ? <StatusBadge tone="bad">✕ {out}</StatusBadge> : <StatusBadge tone="good">● Active</StatusBadge> : null}
        </p>
      </div>
      {points !== undefined ? (
        <div className="shrink-0 text-right">
          <p className="display num text-3xl font-extrabold leading-none">{points}</p>
          <p className="mt-1 text-[11px] text-muted">{pointsLabel}</p>
        </div>
      ) : null}
    </>
  );
  const cls = `relative flex items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface py-3.5 pl-5 pr-4 shadow-card ${out ? "bg-bg-2" : ""}`;
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-accent/50 hover:bg-surface-2`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
