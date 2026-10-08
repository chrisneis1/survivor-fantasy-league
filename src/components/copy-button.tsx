"use client";
import { useState } from "react";
import { btnGhostCls } from "./styles";

/** Copies `text` to the clipboard (for pasting into a group chat), with a fallback for browsers without the API. */
export function CopyButton({ text, label, className = btnGhostCls }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Older browsers, or a page without clipboard permission: copy through a hidden text box instead.
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      setState(ok ? "copied" : "failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className={className}>
        {label}
      </button>
      <span role="status" className="text-xs text-muted">
        {state === "copied" ? "Copied — paste it in the group chat." : state === "failed" ? "Couldn't copy. Select and copy the text below instead." : ""}
      </span>
      {state === "failed" ? <textarea readOnly value={text} rows={5} className="w-full rounded-lg border border-line bg-bg-2 p-2 text-xs" /> : null}
    </span>
  );
}
