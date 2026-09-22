"use client";
import { useEffect, useRef, useState } from "react";

export interface RaceSeries {
  id: string;
  name: string;
  /** Cumulative season total after each episode. */
  values: number[];
  /** 1-3 = highlighted series slot; 0 = part of the muted field. */
  slot: 0 | 1 | 2 | 3;
}

/**
 * Cumulative points by episode. The field is muted; the current top three take categorical slots 1-3
 * (the only slots validated all-pairs), each direct-labelled. The leaderboard table is the data view.
 */
export function PointsRace({ series, labels }: { series: RaceSeries[]; labels: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const H = 280;
  const m = { t: 12, r: w < 480 ? 74 : 104, b: 26, l: 34 };
  const rawMax = Math.max(...series.flatMap((s) => s.values), 10);
  const step = rawMax > 200 ? 100 : rawMax > 80 ? 50 : 20;
  const yMax = Math.ceil(rawMax / step) * step;
  const x = (i: number) => m.l + (n === 1 ? 0 : (i / (n - 1)) * (w - m.l - m.r));
  const y = (v: number) => m.t + (1 - v / yMax) * (H - m.t - m.b);
  const path = (v: number[]) => v.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");

  const hi = series.filter((s) => s.slot).sort((a, b) => a.slot - b.slot);
  const field = series.filter((s) => !s.slot);
  const color = (slot: number) => `var(--series-${slot})`;

  // Direct labels at the line ends, nudged apart so they never collide.
  const labelY: Record<string, number> = {};
  let prev = -Infinity;
  [...hi].sort((a, b) => a.values.at(-1)! - b.values.at(-1)!).reverse().forEach((s) => {
    const ty = Math.max(y(s.values.at(-1)!), prev + 15);
    labelY[s.id] = ty;
    prev = ty;
  });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((px - m.l) / (w - m.l - m.r)) * (n - 1)))));
  };

  const tipLeft = hover === null ? 0 : x(hover) > w / 2 ? x(hover) - 168 : x(hover) + 12;

  return (
    <figure className="m-0">
      <div ref={box} className="relative">
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Cumulative points by episode. ${hi.map((s) => `${s.name} ends on ${s.values.at(-1)}`).join("; ")}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          className="block max-w-full touch-pan-y"
        >
          {Array.from({ length: yMax / step + 1 }, (_, k) => k * step).map((v) => (
            <g key={v}>
              <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{v}</text>
            </g>
          ))}
          {labels.map((l, i) =>
            w >= 480 || i % 2 === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">{l}</text>
            ) : null,
          )}
          {field.map((s) => (
            <path key={s.id} d={path(s.values)} fill="none" stroke="var(--field)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity={hover === null ? 0.9 : 0.6} />
          ))}
          {hi.map((s) => (
            <g key={s.id}>
              <path d={path(s.values)} fill="none" stroke={color(s.slot)} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1)} cy={y(s.values.at(-1)!)} r="4.5" fill={color(s.slot)} stroke="var(--surface)" strokeWidth="2" />
              <text x={x(n - 1) + 10} y={labelY[s.id] + 4} fontSize="12" fontWeight="600" fill="var(--ink)">
                {s.name.length > 11 && w < 480 ? s.name.slice(0, 10) + "…" : s.name}
              </text>
            </g>
          ))}
          {hover !== null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {hi.map((s) => (
                <circle key={s.id} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={color(s.slot)} stroke="var(--surface)" strokeWidth="2" />
              ))}
            </g>
          ) : null}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 w-40 rounded-xl border border-line bg-surface-2 p-2.5 text-xs shadow-lg"
            style={{ left: tipLeft }}
          >
            <div className="mb-1 font-semibold">{labels[hover] === "F" ? "Finale" : `Episode ${labels[hover]}`}</div>
            {[...hi].sort((a, b) => b.values[hover] - a.values[hover]).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: color(s.slot) }} />{s.name}</span>
                <span className="num font-semibold">{s.values[hover]}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted">
              <span>League range</span>
              <span className="num">{Math.min(...series.map((s) => s.values[hover]))}–{Math.max(...series.map((s) => s.values[hover]))}</span>
            </div>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {hi.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded" style={{ background: color(s.slot), height: 3 }} />{s.name}</span>
        ))}
        <span className="flex items-center gap-1.5"><span aria-hidden className="w-4 rounded" style={{ background: "var(--field)", height: 3 }} />Rest of the league</span>
      </figcaption>
    </figure>
  );
}
