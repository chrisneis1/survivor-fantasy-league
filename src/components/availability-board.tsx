"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch } from "./icons";
import { inputCls } from "./styles";
import { OwnershipMeter, StatusBadge, TribeDot } from "./ui";

export interface AvailabilityRow {
  id: string;
  name: string;
  href: string;
  tribeName: string;
  tribeColor: string;
  /** Season points through the window; null when nothing has been scored (the opening draft). */
  pts: number | null;
  owners: number;
  cap: number;
  capacityLeft: number;
  /** Why no team can take this castaway right now; absent when selectable. */
  blockedReason?: string;
}

type Show = "all" | "open" | "out";

/**
 * League-wide availability for a pick window. The rows (and every block reason) are computed on the server by the
 * engine; this component only filters what it is given, so it can never disagree with the pick rules.
 */
export function AvailabilityBoard({ rows, initialShow = "all" }: { rows: AvailabilityRow[]; initialShow?: Show }) {
  const [show, setShow] = useState<Show>(initialShow);
  const [q, setQ] = useState("");

  const counts = { all: rows.length, open: rows.filter((r) => !r.blockedReason).length, out: rows.filter((r) => !!r.blockedReason).length };
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (show === "open" ? !r.blockedReason : show === "out" ? !!r.blockedReason : true) && (!term || r.name.toLowerCase().includes(term) || r.tribeName.toLowerCase().includes(term)));
  }, [rows, show, q]);

  const choose = (v: Show) => {
    setShow(v);
    // Keep the filter in the address so it survives a refresh or a shared link.
    try {
      const url = new URL(window.location.href);
      if (v === "all") url.searchParams.delete("show");
      else url.searchParams.set("show", v);
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };

  const filters: { value: Show; label: string }[] = [
    { value: "all", label: "Everyone" },
    { value: "open", label: "Selectable" },
    { value: "out", label: "Unavailable" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Availability filter" className="flex w-full rounded-full border border-line-strong bg-bg-2 p-1 sm:inline-flex sm:w-auto sm:self-start">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={show === f.value}
              onClick={() => choose(f.value)}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm font-semibold sm:flex-none sm:px-3 transition-colors ${show === f.value ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {f.label}
              <span className={`num hidden rounded-full px-1.5 text-[11px] sm:inline ${show === f.value ? "bg-black/15" : "bg-surface-3 text-ink-2"}`}>{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">Search castaways</span>
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search castaway or tribe" className={`${inputCls} pl-9`} />
        </label>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_4rem_9rem_10.5rem] gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5 text-muted sm:grid">
          <span className="eyebrow">Castaway</span>
          <span className="eyebrow text-right">Pts</span>
          <span className="eyebrow">Owners</span>
          <span className="eyebrow text-right">Status</span>
        </div>
        <ul key={`${show}-${q}`} className="animate-fade" aria-live="polite">
          {list.map((r) => {
            const eliminated = r.blockedReason === "Eliminated";
            return (
              <li
                key={r.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_4rem_9rem_10.5rem] ${eliminated ? "bg-bg-2/70" : ""}`}
              >
                <span className="min-w-0">
                  <Link href={r.href} className={`block truncate font-semibold hover:text-accent ${eliminated ? "text-muted" : "text-ink"}`}>{r.name}</Link>
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <TribeDot color={r.tribeColor} className={eliminated ? "opacity-40" : ""} />
                    {r.tribeName}
                  </span>
                </span>
                <span className="num text-right text-sm font-semibold text-ink-2 sm:text-base">
                  {r.pts === null ? "—" : r.pts}
                  <span className="text-xs font-normal text-muted sm:hidden"> pts</span>
                </span>
                <OwnershipMeter owners={r.owners} cap={r.cap} />
                <span className="text-right">
                  {r.blockedReason ? (
                    <StatusBadge tone={eliminated ? "bad" : "warn"}>✕ {r.blockedReason === "Ownership cap reached" ? "Cap reached" : r.blockedReason}</StatusBadge>
                  ) : (
                    <StatusBadge tone="good">✓ {r.capacityLeft} {r.capacityLeft === 1 ? "spot" : "spots"} left</StatusBadge>
                  )}
                </span>
              </li>
            );
          })}
          {list.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">No castaways match.</li> : null}
        </ul>
      </div>
    </div>
  );
}
