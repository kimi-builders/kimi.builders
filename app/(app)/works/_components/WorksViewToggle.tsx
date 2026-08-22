"use client";

/* Work list view toggle: list (rows, default) / grid (cover wall).
   Clicking writes the kb-works-view cookie (path=/, one year) +
   router.refresh() — the server re-renders the list with no flicker.
   Styling follows the site's segmented language (SEG_*). Shared by
   /works and /awesome; one cookie, one preference across both. */
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { WORKS_VIEW_COOKIE, type WorksView } from "@/src/lib/works-view";

/* 36px buttons + 8px container border/padding = 44px, level with sort
   and filters. */
const BTN =
  "inline-flex size-9 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

/* The cookie write lives outside the component: assigning
   document.cookie inside the component scope trips
   react-hooks/immutability (components are assumed concurrently
   renderable — no visible side effects). Same pattern as
   CurrencyToggle. */
function writeViewCookie(value: WorksView) {
  document.cookie = `${WORKS_VIEW_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export default function WorksViewToggle({
  locale,
  view,
}: {
  locale: Locale;
  view: WorksView;
}) {
  const router = useRouter();
  const pick = (next: WorksView) => {
    if (next === view) return;
    writeViewCookie(next);
    router.refresh();
  };
  const items = [
    { key: "list" as const, label: t(locale, "works.viewList"), Icon: List },
    { key: "grid" as const, label: t(locale, "works.viewGrid"), Icon: LayoutGrid },
  ];
  return (
    <div
      role="group"
      aria-label={t(locale, "works.viewToggle")}
      className="ml-auto inline-flex h-11 items-center gap-0.5 self-center rounded-lg border border-line bg-card p-[3px]"
    >
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          title={label}
          onClick={() => pick(key)}
          className={`${BTN} ${view === key ? "bg-blue/10 text-blue" : "text-grey hover:text-paper"}`}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
