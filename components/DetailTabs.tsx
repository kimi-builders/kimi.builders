"use client";

/* Detail-page tabs:
   - every panel renders fully SSR; inactive ones get only hidden (all
     visible without JS — graceful degradation);
   - the active initial value is read server-side from ?tab=
     (initialTab — no SSR mismatch);
   - clicks switch + history.replaceState the URL (the first tab drops
     the param, keeping URLs clean), popstate syncs back; arrow keys /
     Home/End cycle without scroll jumps on focus.
   - remember (format preference, guide details pass true): clicking a
     format tab (read/video/deck) writes the kb_fmt cookie — "text
     people get the article, slide people get the deck" — and the next
     episode opens straight at the preferred format; the letter's
     review/facts/decisions are content sections, not formats, and are
     never remembered. The server-side fallback order lives in
     explore/[slug]/page.tsx. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

export interface DetailTab {
  id: string;
  label: string;
  panel: ReactNode;
}

const FORMAT_TAB_IDS = new Set(["read", "video", "deck"]);

/* Writing the format-preference cookie (a module-level helper:
   react-hooks/immutability forbids assigning document.cookie in
   component scope; the same dodge as pref-controls' writeCookie). */
function rememberFormatTab(id: string) {
  document.cookie = `kb_fmt=${id}; path=/; max-age=${365 * 86400}; samesite=lax`;
}

export default function DetailTabs({
  tabs,
  initialTab,
  ariaLabel,
  remember = false,
}: {
  tabs: DetailTab[];
  /* Read server-side from searchParams.tab; invalid/missing = the
     first tab (guide details have the kb_fmt preference fallback,
     assembled at the page layer). */
  initialTab?: string;
  ariaLabel: string;
  /* Format-preference memory: guide details only. */
  remember?: boolean;
}) {
  const first = tabs[0]?.id ?? "";
  const [active, setActive] = useState(
    initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : first,
  );
  const listRef = useRef<HTMLDivElement>(null);

  /* Browser forward/back: the URL's ?tab= syncs back into state. */
  useEffect(() => {
    const onPop = () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      setActive(t && tabs.some((x) => x.id === t) ? t : first);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tabs, first]);

  const select = (id: string, focus = false) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    if (remember && FORMAT_TAB_IDS.has(id)) {
      rememberFormatTab(id);
    }
    if (focus) {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)
        ?.focus({ preventScroll: true });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      select(tabs[next].id, true);
    }
  };

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={SEG_WRAP}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={active === t.id}
            aria-controls={`detail-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={`${SEG_ITEM} cursor-pointer ${
              active === t.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`detail-panel-${t.id}`}
          role="tabpanel"
          hidden={active !== t.id}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
