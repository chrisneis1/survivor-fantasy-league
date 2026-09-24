// Design-system primitives. Presentation only: nothing here computes league results beyond what it is handed,
// except TribeTag, which looks up where a castaway is now (the same engine call every page already used).
import Link from "next/link";
import type { ReactNode } from "react";
import type { Castaway, Episode, Season } from "@/domain/types";
import { signed } from "@/lib/format";
import { currentTribeId, latestPublished } from "@/domain/engine";

// ---------- surfaces ----------

type CardTone = "default" | "raised" | "sand" | "accent" | "danger";
const cardTones: Record<CardTone, string> = {
  default: "border-line bg-surface shadow-card",
  raised: "border-line-strong bg-surface-2 shadow-raised",
  sand: "border-sand-line bg-sand text-sand-ink shadow-raised",
  accent: "border-accent/50 bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] shadow-glow",
  danger: "border-bad/40 bg-[color-mix(in_srgb,var(--bad)_8%,var(--surface))]",
};

export function Card({ children, className = "", tone = "default", as: As = "div" }: { children: ReactNode; className?: string; tone?: CardTone; as?: "div" | "section" | "article" | "li" }) {
  return <As className={`rounded-[var(--radius-card)] border ${cardTones[tone]} ${className}`}>{children}</As>;
}

// ---------- headings ----------

export function PageHeader({ eyebrow, title, children, actions, meta }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5 flex flex-wrap items-center gap-2 text-accent">{eyebrow}</p> : null}
        <h1 className="display text-[2.1rem] font-extrabold uppercase leading-[0.95] break-words sm:text-5xl">{title}</h1>
        {children ? <div className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-ink-2">{children}</div> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({ children, aside, id, description }: { children: ReactNode; aside?: ReactNode; id?: string; description?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h2 id={id} className="display flex items-center gap-2 text-xl font-bold uppercase tracking-wide sm:text-2xl">
          <span aria-hidden className="h-4 w-1 rounded-full bg-gradient-to-b from-accent-strong to-ember" />
          {children}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

// ---------- badges ----------

type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "sand";
const badgeTones: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-2 text-ink-2",
  accent: "border-accent/45 bg-accent/12 text-accent-strong",
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  sand: "border-sand-line bg-sand-2 text-sand-ink",
};

/** A short status label. Always text (plus an optional icon), so color is never the only cue. */
export function StatusBadge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]} ${className}`}>{children}</span>;
}

export function YouBadge() {
  return <span className="inline-flex items-center rounded-full bg-accent px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wider text-accent-ink">You</span>;
}

/** Shared competition rank; a "T" marks ties so they read as tied, not as a typo. The top three get podium rings. */
export function RankBadge({ rank, tied, size = "md", onSand = false }: { rank: number; tied?: boolean; size?: "sm" | "md" | "lg"; onSand?: boolean }) {
  const podium = onSand
    ? rank === 1
      ? "border-sand-ink bg-sand-ink text-sand"
      : "border-sand-line bg-sand-2 text-sand-ink"
    : rank === 1 ? "border-gold/70 bg-gold/15 text-gold" : rank === 2 ? "border-silver/60 bg-silver/10 text-silver" : rank === 3 ? "border-bronze/60 bg-bronze/12 text-bronze" : "border-line-strong bg-surface-2 text-ink-2";
  const dims = size === "lg" ? "size-14 text-3xl" : size === "sm" ? "size-8 text-base" : "size-10 text-xl";
  return (
    <span className={`display num inline-flex shrink-0 items-baseline justify-center rounded-full border pt-[0.12em] font-extrabold leading-none ${dims} ${podium}`} title={tied ? `Tied for ${rank}` : `Rank ${rank}`}>
      <span className="sr-only">{tied ? `Tied for rank ${rank}` : `Rank ${rank}`}</span>
      <span aria-hidden className="self-center">
        {tied ? <span className="mr-px align-top text-[0.55em] font-bold opacity-80">T</span> : null}
        {rank}
      </span>
    </span>
  );
}

export function Movement({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return null;
  if (value === 0) return <span className={`num text-xs font-semibold text-muted ${className}`}><span aria-hidden>–</span><span className="sr-only">No rank change</span></span>;
  const up = value > 0;
  return (
    <span className={`num inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-good" : "text-bad"} ${className}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span aria-hidden>{Math.abs(value)}</span>
      <span className="sr-only">{up ? "Up" : "Down"} {Math.abs(value)} {Math.abs(value) === 1 ? "place" : "places"}</span>
    </span>
  );
}

/** +5 / −3 / 0 — the sign is always printed so color is never the only cue. */
export function ScoreChange({ n, className = "" }: { n: number; className?: string }) {
  return <span className={`num ${n > 0 ? "text-good" : n < 0 ? "text-bad" : "text-muted"} ${className}`}>{signed(n)}</span>;
}

export function TribeDot({ color, className = "" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ring-2 ring-black/25 ${className}`} style={{ background: color }} />;
}

export function TribeTag({ season, castaway, tribeId, className = "" }: { season: Season; castaway?: Castaway; tribeId?: string; className?: string }) {
  // Shows where the castaway is now (after any swaps or the merge); the draft slot rules still use their starting tribe.
  const now = castaway ? currentTribeId(season, castaway.id, Math.max(latestPublished(season), 1)) : undefined;
  const tribe = season.tribes.find((t) => t.id === (tribeId ?? now));
  if (!tribe) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 ${className}`}>
      <TribeDot color={tribe.color} />
      {tribe.name}
    </span>
  );
}

export function PolicyPill({ episode, onSand = false }: { episode: Episode; onSand?: boolean }) {
  if (episode.rosterPolicy === "EFFECTIVE") return null;
  return <StatusBadge tone={onSand ? "sand" : "accent"}>{episode.rosterPolicy === "ORIGINAL_DRAFT" ? "◆ Original draft rosters" : `◆ Rosters as of Ep ${episode.rosterPolicySourceEpisode}`}</StatusBadge>;
}

// ---------- filters ----------

/** Link-driven filter rail: no client JS, works with server rendering. `segmented` draws it as one control. */
export function FilterChips<T extends string | number>({
  items,
  active,
  href,
  label,
  variant = "chips",
}: {
  items: { value: T; label: string }[];
  active: T;
  href: (v: T) => string;
  label: string;
  variant?: "chips" | "segmented";
}) {
  if (variant === "segmented") {
    return (
      <nav aria-label={label} className="inline-flex max-w-full rounded-full border border-line-strong bg-bg-2 p-1">
        {items.map((it) => (
          <Link
            key={String(it.value)}
            href={href(it.value)}
            aria-current={it.value === active ? "true" : undefined}
            scroll={false}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${it.value === active ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="no-scrollbar -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((it) => (
        <Link
          key={String(it.value)}
          href={href(it.value)}
          aria-current={it.value === active ? "true" : undefined}
          scroll={false}
          className={`num inline-flex min-h-9 min-w-9 snap-start items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition-colors ${
            it.value === active ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-ink-2 hover:border-accent/50 hover:text-ink"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

// ---------- stats ----------

export function StatCard({ label, value, sub, icon, tone = "default", className = "" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "default" | "accent" | "sand"; className?: string }) {
  const toneCls = tone === "sand" ? "border-sand-line bg-sand text-sand-ink" : tone === "accent" ? "border-accent/45 bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]" : "border-line bg-surface";
  const labelCls = tone === "sand" ? "text-sand-muted" : "text-muted";
  return (
    <div className={`min-w-0 rounded-[var(--radius-card)] border px-3.5 py-3 shadow-card ${toneCls} ${className}`}>
      <p className={`eyebrow flex items-center gap-1.5 ${labelCls}`}>
        {icon}
        {label}
      </p>
      <div className="display num mt-1 truncate text-2xl font-extrabold leading-tight sm:text-[1.7rem]">{value}</div>
      {sub ? <div className={`mt-0.5 truncate text-xs ${labelCls}`}>{sub}</div> : null}
    </div>
  );
}

/**
 * How many teams own a castaway against the league cap. Segmented when the cap is small enough to count at a glance;
 * the numbers are always printed, and a full castaway also says so in words.
 */
export function OwnershipMeter({ owners, cap, className = "" }: { owners: number; cap: number; className?: string }) {
  const full = owners >= cap;
  const fill = full ? "bg-ember" : "bg-accent";
  const label = `${owners} of ${cap} owners${full ? ", cap reached" : ""}`;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="img" aria-label={label} title={label}>
      {cap <= 12 ? (
        <span aria-hidden className="flex gap-[3px]">
          {Array.from({ length: cap }, (_, i) => (
            <span key={i} className={`h-2 w-2.5 rounded-[2px] sm:w-3 ${i < owners ? fill : "bg-surface-3"}`} />
          ))}
        </span>
      ) : (
        <span aria-hidden className="h-2 w-20 overflow-hidden rounded-full bg-surface-3">
          <span className={`block h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, (owners / Math.max(cap, 1)) * 100)}%` }} />
        </span>
      )}
      <span aria-hidden className={`num text-xs font-semibold ${full ? "text-bad" : "text-ink-2"}`}>
        {owners}/{cap}
      </span>
    </span>
  );
}

/** Team or member initials on a tinted tile. The tint is derived from the name so it stays stable. */
export function Monogram({ name, size = "md", className = "" }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const dims = size === "lg" ? "size-16 text-2xl rounded-2xl" : size === "sm" ? "size-8 text-sm rounded-lg" : "size-11 text-lg rounded-xl";
  return (
    <span
      aria-hidden
      className={`display inline-flex shrink-0 items-center justify-center border border-white/10 font-extrabold uppercase text-ink ${dims} ${className}`}
      style={{ background: `linear-gradient(145deg, hsl(${h} 32% 30%), hsl(${(h + 40) % 360} 28% 18%))` }}
    >
      {initials}
    </span>
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
      <line x1="0" x2={values.length * (w + gap)} y1={mid} y2={mid} stroke="var(--line-strong)" strokeWidth="1" />
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
            opacity={i + 1 === highlight ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}

// ---------- states ----------

/** A designed empty state: says what will appear here and when, never a fabricated number. */
export function EmptyState({ title, children, icon, action, compact = false }: { title?: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface/60 text-center ${compact ? "px-4 py-5" : "px-6 py-10"}`}>
      <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-line">
        <path d="M0 90c60-18 120 12 200-6s140-30 200-10" fill="none" stroke="currentColor" />
        <path d="M0 104c70-14 130 10 210-4s130-24 190-8" fill="none" stroke="currentColor" />
      </svg>
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        {icon ? <span className="mb-3 grid size-12 place-items-center rounded-full border border-line-strong bg-surface-2 text-accent">{icon}</span> : null}
        {title ? <p className="display text-xl font-bold uppercase tracking-wide">{title}</p> : null}
        {children ? <div className={`text-sm leading-relaxed text-ink-2 ${title ? "mt-1.5" : ""}`}>{children}</div> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-shimmer rounded-lg bg-surface-2 ${className}`} />;
}

