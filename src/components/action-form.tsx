"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";

import { btnCls, btnGhostCls, inputCls } from "./styles";

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
      {state.credential ? <Credential credential={state.credential} mailto={state.mailto} /> : null}
    </form>
  );
}

/** A team's username/password, shown once. The commissioner can copy the password or open a ready-written email (the site sends nothing). */
function Credential({ credential, mailto }: { credential: { username: string; password: string }; mailto?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
      <p className="mb-2 font-semibold text-accent">Login saved. The password is shown only now.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Username</span>
          <input readOnly value={credential.username} aria-label="Username" onFocus={(e) => e.currentTarget.select()} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Password</span>
          <input readOnly value={credential.password} aria-label="Password" onFocus={(e) => e.currentTarget.select()} className={inputCls} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhostCls}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`Username: ${credential.username}\nPassword: ${credential.password}`);
              setCopied(true);
            } catch {
              /* the fields above are selectable as a fallback */
            }
          }}
        >
          {copied ? "Copied" : "Copy both"}
        </button>
        {mailto ? <a href={mailto} className={btnCls}>Email it</a> : null}
      </div>
    </div>
  );
}
