"use client";

/* Collapsible moderation entry for detail-page action bars: keeps the
   feature toggle + mod toolbar one click away without lining their
   buttons up beside the user actions (a 6-10 control row read as
   noise). The panel closes on outside press / Escape; children are the
   existing FeaturedToggle / ModToolbar, unchanged. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function ModMenu({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <ShieldCheck size={13} aria-hidden="true" />
        {t(locale, "mod.menu")}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 flex w-72 flex-col items-start gap-3 rounded-lg border border-line bg-bg p-4 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}
