"use client";
import Link from "next/link";
import { useEffect } from "react";
import { IconAlert } from "@/components/icons";
import { btnCls, btnGhostCls } from "@/components/styles";

/** Anything that throws while rendering a page lands here instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-full border border-bad/40 bg-bad/10 text-bad"><IconAlert size={26} /></span>
      <h1 className="display mt-5 text-4xl font-extrabold uppercase">Something went wrong</h1>
      <p className="mt-2 text-ink-2">The page couldn&apos;t load. Nothing you saved was lost — try again, or head back to the league.</p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={btnCls}>Try again</button>
        <Link href="/" className={btnGhostCls}>Back to the league</Link>
      </div>
    </main>
  );
}
