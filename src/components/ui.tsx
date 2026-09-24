import Link from "next/link";
import type { ReactNode } from "react";
import type { Castaway, Episode, Season } from "@/domain/types";
import { signed } from "@/lib/format";
import { currentTribeId, latestPublished } from "@/domain/engine";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="display text-xl font-bold sm:text-2xl">{children}</h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 mt-2 sm:mb-8">
      {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
      <h1 className="display text-3xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
      {children ? <div className="mt-2 max-w-2xl text-muted">{children}</div> : null}
    </header>
  );
}

/** Shared competition rank; a "T" marks ties so they read as tied, not as a typo. */
export function RankMark({ rank, tied }: { rank: number; tied?: boolean }) {
  return (
    <span
      className={`display num inline-flex min-w-9 items-baseline justify-center text-xl font-extrabold ${rank === 1 ? "text-accent" : ""}`}
      title={tied ? `Tied for ${rank}` : `Rank ${rank}`}
    >
      {tied ? <span className="mr-0.5 text-xs font-bold text-muted">T</span> : null}
      {rank}
    </span>
  );
}

export function Movement({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0) return <span className="text-xs text-muted" aria-label="No rank change">—</span>;
  const up = value > 0;
  return (
    <span className={`num text-xs font-semibold ${up ? "text-good" : "text-bad"}`} aria-label={`${up ? "Up" : "Down"} ${Math.abs(value)} places`}>
      {up ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

export function Signed({ n, className = "" }: { n: number; className?: string }) {
  return <span className={`num ${n > 0 ? "text-good" : n < 0 ? "text-bad" : "text-muted"} ${className}`}>{signed(n)}</span>;
}

export function TribeTag({ season, castaway, tribeId }: { season: Season; castaway?: Castaway; tribeId?: string }) {
  // Shows where the castaway is now (after any swaps or the merge); the draft slot rules still use their starting tribe.
  const now = castaway ? currentTribeId(season, castaway.id, Math.max(latestPublished(season), 1)) : undefined;
  const tribe = season.tribes.find((t) => t.id === (tribeId ?? now));
  if (!tribe) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: tribe.color }} />
      {tribe.name}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "bad" }) {
  const tones = {
    neutral: "border-line bg-surface-2 text-muted",
    accent: "border-accent/40 bg-accent/10 text-accent",
    good: "border-good/40 bg-good/10 text-good",
    bad: "border-bad/40 bg-bad/10 text-bad",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function PolicyPill({ episode }: { episode: Episode }) {
  if (episode.rosterPolicy === "EFFECTIVE") return null;
  return (
    <Pill tone="accent">{episode.rosterPolicy === "ORIGINAL_DRAFT" ? "◆ Original draft rosters" : `◆ Rosters as of Ep ${episode.rosterPolicySourceEpisode}`}</Pill>
  );
}

/** Link-driven segmented control: no client JS, works with server rendering. */
export function Chips<T extends string | number>({
  items,
  active,
  href,
  label,
}: {
  items: { value: T; label: string }[];
  active: T;
  href: (v: T) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="no-scrollbar -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((it) => (
        <Link
          key={String(it.value)}
          href={href(it.value)}
          aria-current={it.value === active ? "true" : undefined}
          scroll={false}
          className={`num snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
            it.value === active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** Compact per-episode bars: sign-aware, baseline anchored. Decorative; the numbers live in the row. */
export function Sparkbars({ values, highlight }: { values: number[]; highlight?: number }) {
  const max = Math.max(...values.map(Math.abs), 1);
  const w = 6;
  const gap = 2;
  const h = 28;
  const mid = h / 2;
  return (
    <svg aria-hidden width={values.length * (w + gap)} height={h} className="shrink-0">
      <line x1="0" x2={values.length * (w + gap)} y1={mid} y2={mid} stroke="var(--line)" strokeWidth="1" />
      {values.map((v, i) => {
        const bh = Math.max((Math.abs(v) / max) * (mid - 1), v === 0 ? 0 : 1.5);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={v >= 0 ? mid - bh : mid}
            width={w}
            height={bh}
            rx="1.5"
            fill={i + 1 === highlight ? "var(--accent)" : v < 0 ? "var(--bad)" : "var(--muted)"}
            opacity={i + 1 === highlight ? 1 : 0.75}
          />
        );
      })}
    </svg>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{children}</p>;
}
