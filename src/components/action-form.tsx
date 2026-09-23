"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";

import { btnCls, btnGhostCls } from "./styles";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** A form bound to a server action, showing its result inline. */
export function ActionForm({
  action,
  submit,
  children,
  className = "grid gap-3",
  ghost = false,
  confirm,
  resetOnSuccess = false,
  disabled = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submit: string;
  children?: ReactNode;
  className?: string;
  ghost?: boolean;
  confirm?: string;
  resetOnSuccess?: boolean;
  disabled?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) form.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={form}
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={ghost ? btnGhostCls : btnCls} disabled={pending || disabled}>
          {pending ? "Working…" : submit}
        </button>
        {state.error ? <p role="alert" className="text-sm font-medium text-bad">✕ {state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm font-medium text-good">✓ {state.ok}</p> : null}
      </div>
    </form>
  );
}
