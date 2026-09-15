/* Desktop top bar (>=lg, fixed): spans only the content region right
   of the left rail (lg:left-[var(--nav-w)]; the rail's brand row owns
   the top-left corner, the ChatGPT/GitHub/Reddit sidebar grammar).
   Right cluster: notifications (bell + unread badge, signed-in only),
   theme/vibe/language toggles, AuthChip. Hairline bottom edge +
   bg/blur, matching MobileTopBar; not rendered below lg, where
   MobileTopBar/bottom tabs/drawer take over untouched. The inner
   container mirrors the content zone (same 1200px cap + padding, both
   centered in the same region), keeping the right-most control flush
   with the right rail's edge. Theme/language reuse pref-controls'
   optimistic widgets (icon-only form); the unread count comes SSR
   from (app)/layout (the same source as the old rail bell). */
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import UnreadBadge from "@/components/UnreadBadge";
import HoverPrefetchLink from "@/components/HoverPrefetchLink";
import { ShortcutsButton } from "@/components/KeyboardShortcuts";
import { t, type Locale } from "@/src/lib/i18n";
import { LocaleToggle, ThemeToggle, VibeToggle } from "./pref-controls";
import GlobalSearch from "./GlobalSearch";

export default function TopBar({
  locale,
  unread = 0,
  loggedIn,
}: {
  locale: Locale;
  unread?: number;
  loggedIn: boolean;
}) {
  const iconBtn =
    "flex h-10 w-10 items-center justify-center rounded-lg text-grey transition-colors hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
  return (
    <header className="fixed top-0 right-0 z-20 hidden h-14 border-b border-line bg-bg/95 backdrop-blur lg:block lg:left-[var(--nav-w)]">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center px-4 lg:px-6">
      <div className="ml-auto flex items-center gap-1.5 text-xs">
        <GlobalSearch locale={locale} mode="desktop" className={iconBtn} />
        <ShortcutsButton locale={locale} className={iconBtn} />
        {loggedIn && (
          <HoverPrefetchLink
            href="/community/notifications"
            data-tip={t(locale, "topbar.notif")}
            data-tip-side="bottom"
            data-tip-align="right"
            aria-label={t(locale, "topbar.notif")}
            className={`relative ${iconBtn}`}
          >
            <Bell size={15} />
            <UnreadBadge
              initial={unread}
              locale={locale}
              className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue px-1 text-[8px] font-semibold text-bg"
            />
          </HoverPrefetchLink>
        )}
        <ThemeToggle locale={locale} className={iconBtn} />
        <VibeToggle locale={locale} className={iconBtn} />
        <LocaleToggle locale={locale} className={iconBtn} />
        <span className="ml-1.5 flex items-center gap-3">
          <AuthChip />
        </span>
      </div>
      </div>
    </header>
  );
}
