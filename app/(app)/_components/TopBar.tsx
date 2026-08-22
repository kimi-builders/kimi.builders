/* Desktop top bar (>=lg, fixed): left = the brand block (logo-tile +
   mono wordmark, blue on hover, links to /); right = notifications
   (bell + unread badge, signed-in only), theme toggle, language
   toggle, AuthChip. Hairline bottom edge + bg/blur, matching
   MobileTopBar; not rendered below lg, where MobileTopBar/bottom
   tabs/drawer take over untouched. Theme/language reuse
   pref-controls' optimistic widgets (icon-only form); the unread count
   comes SSR from (app)/layout (the same source as the old rail bell). */
import Link from "next/link";
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import UnreadBadge from "@/components/UnreadBadge";
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
    <header className="fixed inset-x-0 top-0 z-20 hidden h-14 border-b border-line bg-bg/95 backdrop-blur lg:block">
      {/* Shares the 1320px centered container with the three columns below: the brand aligns with the left column's left edge, the auth chip with the right column's right edge */}
      <div className="mx-auto flex h-full w-full max-w-[1440px] items-center px-[5vw]">
      <Link
        href="/"
        title="kimi.builders"
        className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* Small-size tile mark (enlarged crescent + two stars): clear edges and distinguishable stars on dark theme */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-7 w-7 shrink-0 rounded-md" />
        <span>
          kimi<span className="text-ui-blue">.</span>builders
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1.5 text-xs">
        <GlobalSearch locale={locale} mode="desktop" className={iconBtn} />
        <ShortcutsButton locale={locale} className={iconBtn} />
        {loggedIn && (
          <Link
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
          </Link>
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
