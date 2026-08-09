"use client";

/* <lg 底部标签栏(主流 app 布局):社区 / 作品 / 发帖 / 用量 / 我的。
   完整功能、通知、设置与偏好从 MobileTopBar 的导航抽屉进入。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它。
   fixed 定位 + safe-area 内边距(iPhone home 条);主区在 (app)/layout 里补 pb-24 防遮挡。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, MessagesSquare, Rocket, SquarePen, User } from "lucide-react";
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
      href: "/works",
      icon: Rocket,
      key: "nav.works" as const,
      active: pathname.startsWith("/works"),
      badge: 0,
    },
    {
      href: "/community/new",
      icon: SquarePen,
      key: "nav.post" as const,
      active: pathname.startsWith("/community/new"),
      badge: 0,
      primary: true,
    },
    {
      href: "/usage",
      icon: BarChart3,
      key: "nav.usage" as const,
      active: pathname.startsWith("/usage"),
      badge: 0,
    },
    {
      href: profileHref ?? "/settings",
      icon: User,
      key: "nav.profile" as const,
      active: pathname.startsWith("/u/") || pathname.startsWith("/settings"),
      badge: unread,
    },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 font-mono text-[10px] transition-colors ${
                tab.primary
                  ? "text-blue"
                  : tab.active
                    ? "text-blue"
                    : "text-grey hover:text-paper"
              }`}
            >
              <span className={`relative flex items-center justify-center ${tab.primary ? "size-8 border border-blue bg-blue text-white" : "size-6"}`}>
                <Icon size={tab.primary ? 17 : 18} />
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
