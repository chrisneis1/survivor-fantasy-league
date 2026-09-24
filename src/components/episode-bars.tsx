// Per-episode points as columns, with the running total along the top. Pure HTML/CSS so it reflows at any width;
// the episode rows below it carry the same numbers as text, so the chart itself is decorative for screen readers.
export function EpisodeBars({ items }: { items: { label: string; value: number; highlight?: boolean }[] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const hasNeg = items.some((i) => i.value < 0);
  const posShare = hasNeg ? Math.max(...items.map((i) => Math.max(i.value, 0)), 1) / (Math.max(...items.map((i) => Math.max(i.value, 0)), 1) + Math.max(...items.map((i) => Math.max(-i.value, 0)), 1)) : 1;
  const H = 132;
  const top = H * posShare;
  let run = 0;
  return (
    <div aria-hidden className="w-full">
      <div className="flex items-stretch gap-1 sm:gap-1.5" style={{ height: H + 18 }}>
        {items.map((it, i) => {
          run += it.value;
          // Leave 16px above a positive bar (and below a negative one) for its value label.
          const room = it.value >= 0 ? top - 16 : H + 18 - top - 16;
          const h = (Math.abs(it.value) / max) * Math.max(room, 8);
          return (
            <div key={i} className="group relative flex min-w-0 flex-1 flex-col" title={`${it.label}: ${it.value > 0 ? "+" : ""}${it.value} (total ${run})`}>
              <div className="relative flex-none" style={{ height: top }}>
                {it.value >= 0 ? (
                  <>
                    <span className="num absolute inset-x-0 text-center text-[10px] font-semibold text-ink-2 sm:text-[11px]" style={{ bottom: h + 2 }}>{it.value}</span>
                    <span
                      className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-7 rounded-t-[4px] transition-colors ${it.highlight ? "bg-gradient-to-t from-ember to-accent-strong" : "bg-gradient-to-t from-surface-3 to-line-strong group-hover:from-accent/50 group-hover:to-accent"}`}
                      style={{ height: Math.max(h, it.value === 0 ? 2 : 3) }}
                    />
                  </>
                ) : null}
              </div>
              <div className="relative flex-1 border-t border-line-strong">
                {it.value < 0 ? (
                  <>
                    <span className="absolute inset-x-0 top-0 mx-auto w-full max-w-7 rounded-b-[4px] bg-bad/70" style={{ height: h }} />
                    <span className="num absolute inset-x-0 text-center text-[10px] font-semibold text-bad" style={{ top: h + 2 }}>{it.value}</span>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 sm:gap-1.5">
        {items.map((it, i) => (
          <span key={i} className="num min-w-0 flex-1 truncate text-center text-[10px] text-muted sm:text-[11px]">{it.label}</span>
        ))}
      </div>
    </div>
  );
}
