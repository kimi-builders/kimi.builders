"use client";

/* <lg 底部标签栏(主流 app 布局):社区 / 发帖 / 消息(带未读角标)/ 我的
   (登录→个人主页,未登录→设置页的登录引导;设置也从这里进)。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它 + MobileTopBar。
   fixed 定位 + safe-area 内边距(iPhone home 条);主区在 (app)/layout 里补 pb-24 防遮挡。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, MessagesSquare, SquarePen, User } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function MobileTabBar({
  locale,
  unread = 0,
  profileHref,
}: {
  locale: Locale;
  unread?: number;
  profileHref?: string;
}) {
  const pathname = usePathname();
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
      badge: 0,
    },
    {
      href: "/community/new",
      icon: SquarePen,
      key: "nav.post" as const,
      active: pathname.startsWith("/community/new"),
      badge: 0,
    },
    {
      href: "/community/notifications",
      icon: Bell,
      key: "notif.title" as const,
      active: pathname.startsWith("/community/notifications"),
      badge: unread,
    },
    {
      href: profileHref ?? "/settings",
      icon: User,
      key: "nav.profile" as const,
      active: pathname.startsWith("/u/") || pathname.startsWith("/settings"),
      badge: 0,
    },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2 font-mono text-[10px] transition-colors ${
                tab.active ? "text-blue" : "text-grey hover:text-paper"
              }`}
            >
              <span className="relative">
                <Icon size={18} />
                {tab.badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue px-1 text-[8px] font-semibold text-bg">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </span>
              {t(locale, tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
