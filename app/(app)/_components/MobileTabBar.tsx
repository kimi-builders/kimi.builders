"use client";

/* The <lg bottom tab bar (the standard app layout): community /
   explore / works / post / usage / me. Full features, notifications,
   settings, and preferences live in MobileTopBar's drawer. The desktop
   three-column shell (LeftNav/RightSidebar) yields entirely on mobile.
   Fixed positioning + safe-area padding (the iPhone home bar); the
   main area gets pb-24 in (app)/layout so nothing hides behind it. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Compass, GalleryVerticalEnd, MessagesSquare, SquarePen, User } from "lucide-react";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";

export default function MobileTabBar({
  locale,
  profileHref,
  loggedIn = false,
}: {
  locale: Locale;
  profileHref?: string;
  /* Signed out: gated items (post/usage/me) link straight into the
     login modal with a post-login redirect. */
  loggedIn?: boolean;
}) {
  const pathname = usePathname();
  /* Targets for gated entries when signed out (the login modal carries
     the redirect). */
  const gate = (path: string) =>
    loggedIn ? path : `/login?next=${encodeURIComponent(path)}`;
  const contextualCreate: { href: string; key: I18nKey } =
    pathname.startsWith("/awesome")
      ? { href: "/works/new", key: "awesome.recommend" }
      : pathname.startsWith("/works")
        ? { href: "/works/new", key: "works.submit" }
        : { href: "/community/new", key: "nav.post" };
  const tabs = [
    {
      href: "/community",
      icon: MessagesSquare,
      key: "nav.community" as const,
      active:
        pathname === "/community" ||
        (pathname.startsWith("/community/") &&
          !pathname.startsWith("/community/new") &&
          !pathname.startsWith("/community/notifications")),
    },
    {
      href: "/explore",
      icon: Compass,
      key: "nav.explore" as const,
      active: pathname.startsWith("/explore"),
    },
    {
      href: "/works",
      icon: GalleryVerticalEnd,
      key: "nav.works" as const,
      active: pathname.startsWith("/works") && !pathname.startsWith("/works/new"),
    },
    {
      href: gate(contextualCreate.href),
      icon: SquarePen,
      key: contextualCreate.key,
      active:
        pathname.startsWith("/community/new") ||
        pathname.startsWith("/works/new"),
      primary: true,
    },
    {
      href: "/usage",
      icon: BarChart3,
      key: "nav.usage" as const,
      active: pathname.startsWith("/usage"),
    },
    {
      href: profileHref ?? gate("/settings"),
      icon: User,
      key: "nav.profile" as const,
      active: pathname.startsWith("/u/") || pathname.startsWith("/settings"),
    },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              /* Tab labels use the system sans: JetBrains Mono has no CJK
                 glyphs and mixed-fallback Chinese misaligns the baseline;
                 tab copy is bilingual, sans is stable for both. */
              className={`flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 px-1 text-xs transition-colors ${
                tab.primary
                  ? "text-ui-blue"
                  : tab.active
                    ? "text-ui-blue"
                    : "text-grey hover:text-paper"
              }`}
            >
 <span className={`flex items-center justify-center ${tab.primary ? "size-10 rounded-lg bg-blue text-white" : "size-7"}`}>
                <Icon size={tab.primary ? 18 : 19} />
              </span>
              {t(locale, tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
