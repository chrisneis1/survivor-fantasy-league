"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch } from "./icons";
import { inputCls } from "./styles";
import { OwnershipMeter, StatusBadge, TribeDot } from "./ui";

export interface DirectoryCastaway {
  id: string;
  name: string;
  href: string;
  startTribeId: string;
  tribe: { name: string; color: string };
  total: number;
  owners: number;
  cap: number;
  drafted: number;
  peak: number;
  /** e.g. "Voted out · Ep 5"; absent while still in the game. */
  out?: string;
}

type Status = "all" | "active" | "out";
type Sort = "points" | "owners" | "name";

/** The fantasy-player directory. Everything shown is computed on the server; this only filters and orders it. */
export function CastawayDirectory({ castaways, tribes, initialTribe = "all", finished }: { castaways: DirectoryCastaway[]; tribes: { id: string; name: string; color: string }[]; initialTribe?: string; finished: boolean }) {
  const [tribe, setTribe] = useState(initialTribe);
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("points");
  const [q, setQ] = useState("");

  const maxPts = Math.max(...castaways.map((c) => c.total), 1);
  const pointRank = useMemo(() => new Map([...castaways].sort((a, b) => b.total - a.total).map((c, i) => [c.id, i + 1])), [castaways]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return castaways
      .filter((c) => (tribe === "all" || c.startTribeId === tribe) && (status === "all" || (status === "out" ? !!c.out : !c.out)) && (!term || c.name.toLowerCase().includes(term)))
      .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "owners" ? b.owners - a.owners || b.total - a.total : b.total - a.total));
  }, [castaways, tribe, status, sort, q]);

  const chooseTribe = (v: string) => {
    setTribe(v);
    try {
      const url = new URL(window.location.href);
      if (v === "all") url.searchParams.delete("tribe");
      else url.searchParams.set("tribe", v);
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };

  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition-colors ${on ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-ink-2 hover:border-accent/50 hover:text-ink"}`;
  const activeCount = castaways.filter((c) => !c.out).length;

  return (
    <div>
      <div className="mb-4 grid gap-3">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by starting tribe">
          <button type="button" aria-pressed={tribe === "all"} onClick={() => chooseTribe("all")} className={chip(tribe === "all")}>All tribes</button>
          {tribes.map((t) => (
            <button key={t.id} type="button" aria-pressed={tribe === t.id} onClick={() => chooseTribe(t.id)} className={chip(tribe === t.id)}>
              <TribeDot color={t.color} /> {t.name}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div role="group" aria-label="Filter by status" className="flex rounded-full border border-line-strong bg-bg-2 p-1 sm:inline-flex">
            {([["all", "Everyone"], ["active", finished ? "Made the finale" : "Still in"], ["out", "Eliminated"]] as const).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`min-h-9 flex-1 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors sm:flex-none ${status === v ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <label className="relative block min-w-0 flex-1 sm:w-56">
              <span className="sr-only">Search castaways</span>
              <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${inputCls} pl-9`} />
            </label>
            <label className="shrink-0">
              <span className="sr-only">Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputCls} w-auto pr-8`}>
                <option value="points">Most points</option>
                <option value="owners">Most owned</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          Showing {list.length} of {castaways.length} · {activeCount} {finished ? "made the finale" : "still in the game"}
        </p>
      </div>

      <ul key={`${tribe}-${status}-${sort}-${q}`} className="grid animate-fade grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const rank = pointRank.get(c.id)!;
          return (
            <li key={c.id}>
              <Link
                href={c.href}
                className={`group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border p-3.5 shadow-card transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent/60 ${c.out ? "border-line bg-bg-2" : "border-line bg-surface hover:bg-surface-2"}`}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: c.out ? "var(--line-strong)" : c.tribe.color }} />
                <div className="flex items-start gap-3 pl-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className={`num text-xs font-bold ${rank <= 3 ? "text-accent" : "text-muted"}`}>#{rank}</span>
                      <span className={`display truncate text-xl font-bold uppercase leading-tight ${c.out ? "text-ink-2" : "text-ink"}`}>{c.name}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-ink-2"><TribeDot color={c.tribe.color} className={c.out ? "opacity-50" : ""} /> {c.tribe.name}</span>
                      {c.out ? <StatusBadge tone="bad">✕ {c.out}</StatusBadge> : <StatusBadge tone="good">● {finished ? "Finalist" : "Active"}</StatusBadge>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="display num text-3xl font-extrabold leading-none">{c.total}</p>
                    <p className="text-[11px] text-muted">pts</p>
                  </div>
                </div>
                <div className="mt-3 pl-1.5">
                  <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-surface-3">
                    <span className={`block h-full rounded-full ${c.out ? "bg-muted/60" : "bg-gradient-to-r from-ember to-accent-strong"}`} style={{ width: `${Math.max(0, (c.total / maxPts) * 100)}%` }} />
                  </span>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <OwnershipMeter owners={c.owners} cap={c.cap} />
                    <span className="num text-xs text-muted">Drafted by {c.drafted} · peak {c.peak}</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">No castaways match these filters.</p> : null}
    </div>
  );
}
