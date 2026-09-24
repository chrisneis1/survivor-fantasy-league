import { Skeleton } from "@/components/ui";

/** Shown while a season page loads: the shape of a page header, a stat row and a list, never fake numbers. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-card)]" />)}
      </div>
      <div className="mt-6 grid gap-2">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
