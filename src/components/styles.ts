// Shared control styles. Kept in a plain module (not a client file) so server components can use them inside template strings too.
const btnBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0";

/** Primary action: torch amber. One per area. */
export const btnCls = `${btnBase} bg-accent text-accent-ink shadow-[0_6px_18px_-8px_var(--accent)] hover:bg-accent-strong`;
/** Secondary action. */
export const btnGhostCls = `${btnBase} border border-line-strong bg-surface-2/60 text-ink hover:border-accent/60 hover:bg-surface-3`;

export const inputCls =
  "min-h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-bg-2 px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/30";

