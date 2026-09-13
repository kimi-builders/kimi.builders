"use client";

/* Settings tab shell (profile/preferences/privacy & publicity/
   account): panels stay mounted and switch via hidden — unsaved form
   state survives tab switches; without JS the four panels stack in
   order, all readable. */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/* Roving-tabIndex movement resolver (pure, unit-tested): ←/→ wrap,
   Home/End jump; anything else keeps the current tab. Selection
   follows focus (automatic activation), matching DetailTabs. */
export function resolveTabMove(
  keys: readonly string[],
  active: string,
  key: string,
): string | null {
  const currentIndex = keys.indexOf(active);
  if (currentIndex < 0) return null;
  if (key === "ArrowRight") return keys[(currentIndex + 1) % keys.length];
  if (key === "ArrowLeft") return keys[(currentIndex - 1 + keys.length) % keys.length];
  if (key === "Home") return keys[0];
  if (key === "End") return keys[keys.length - 1];
  return null;
}

export default function SettingsTabs({
  tabs,
  initialKey,
  ariaLabel,
  children,
}: {
  tabs: { key: string; label: string }[];
  /* An OAuth link receipt lands with the "account" tab expanded. */
  initialKey?: string;
  /* Localized tablist name: the tab labels arrive pre-localized from
     the server, the list name takes the same path. */
  ariaLabel: string;
  children: ReactNode[];
}) {
  const [active, setActive] = useState(
    initialKey && tabs.some((tab) => tab.key === initialKey) ? initialKey : (tabs[0]?.key ?? ""),
  );
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent) => {
    const next = resolveTabMove(tabs.map((tab) => tab.key), active, event.key);
    if (!next) return;
    event.preventDefault();
    setActive(next);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <div>
      {/* Underline tabs (the long-lived section grammar, not the solid
          seg block): interactive in-page tabs keep the full ARIA
          pattern — named tablist, tab/tabpanel id pairing, roving
          tabIndex (only the active tab is in the tab order) with
          ←/→/Home/End movement. */}
      <div
        ref={listRef}
        className="flex gap-6 border-b border-line"
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-tab={tab.key}
            id={`settings-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`settings-panel-${tab.key}`}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            className={`-mb-px border-b-2 pb-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              active === tab.key
                ? "border-blue font-medium text-paper"
                : "border-transparent text-grey hover:text-paper"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children.map((child, index) => {
        const key = tabs[index]?.key ?? String(index);
        return (
          <div
            key={key}
            role="tabpanel"
            id={`settings-panel-${key}`}
            aria-labelledby={`settings-tab-${key}`}
            hidden={key !== active}
            className="pt-6"
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
