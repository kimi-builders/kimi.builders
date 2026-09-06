/* The <lg top mini bar: the full-feature drawer + brand +
   notifications + search. The signed-in state (avatar/sign out) tucks
   into the drawer's account block, keeping the bar clean; theme,
   language, and secondary entries live in the drawer too. The
   notification slot: a return hook shouldn't hide in a drawer — the
   same bell + unread badge as the desktop bar, one-thumb reach on
   mobile; no slot when signed out. */
import Link from "next/link";
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import HoverPrefetchLink from "@/components/HoverPrefetchLink";
import { t, type Locale } from "@/src/lib/i18n";
import MobileNavDrawer from "./MobileNavDrawer";
import GlobalSearch from "./GlobalSearch";

export default function MobileTopBar({
  locale,
  unread = 0,
  profileHref,
  moderator = false,
  loggedIn = false,
}: {
  locale: Locale;
  unread?: number;
  profileHref?: string;
  /* admin/mod: the drawer gains an "admin" entry. */
  moderator?: boolean;
  loggedIn?: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b border-line bg-bg/95 px-2 backdrop-blur lg:hidden">
      <MobileNavDrawer
        locale={locale}
        unread={unread}
        profileHref={profileHref}
        moderator={moderator}
        account={<AuthChip />}
        loggedIn={loggedIn}
      />
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* Small-size tile mark: stable across both themes */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-6 w-6 rounded-md" />
        <span className="truncate">kimi<span className="text-ui-blue">.</span>builders</span>
      </Link>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {loggedIn && (
          <HoverPrefetchLink
            href="/community/notifications"
            title={t(locale, "topbar.notif")}
            aria-label={t(locale, "topbar.notif")}
            className="relative flex size-11 shrink-0 items-center justify-center text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <Bell size={17} aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue px-1 text-[9px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </HoverPrefetchLink>
        )}
        <GlobalSearch
          locale={locale}
          mode="mobile"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        />
      </div>
    </div>
  );
}
