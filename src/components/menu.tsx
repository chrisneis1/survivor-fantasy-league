"use client";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A button that opens a panel of links: closes on outside click, Escape (returning focus to the button) and
 * navigation. Used by the season switcher, the account menu and the mobile "More" sheet.
 */
export function Menu({
  button,
  label,
  children,
  align = "left",
  sheet = false,
  buttonClassName = "",
}: {
  button: ReactNode;
  label: string;
  children: ReactNode;
  align?: "left" | "right";
  /** Render as a bottom sheet (mobile) instead of a dropdown. */
  sheet?: boolean;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (open && sheet) panel.current?.querySelector<HTMLElement>("a,button")?.focus();
  }, [open, sheet]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
      // The sheet is modal: Tab cycles within it.
      if (e.key === "Tab" && sheet && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("a,button")];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, sheet]);

  return (
    <div ref={root} className={sheet ? "contents" : "relative"}>
      <button ref={btn} type="button" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)} className={buttonClassName}>
        {button}
      </button>
      {open ? (
        sheet ? (
          // Portalled to <body>: the bottom bar uses backdrop-filter, which would otherwise trap a fixed-position sheet inside it.
          createPortal(
            <>
              <div aria-hidden className="fixed inset-0 z-40 animate-fade bg-black/60" />
              <div
                ref={panel}
                id={id}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] animate-rise overflow-y-auto rounded-t-3xl border-t border-line-strong bg-surface-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 shadow-raised"
              >
                <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
                {children}
              </div>
            </>,
            document.body,
          )
        ) : (
          <div
            id={id}
            className={`absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] animate-rise rounded-2xl border border-line-strong bg-surface-2 p-2 shadow-raised ${align === "right" ? "right-0" : "left-0"}`}
          >
            {children}
          </div>
        )
      ) : null}
    </div>
  );
}
