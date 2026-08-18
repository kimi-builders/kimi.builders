"use client";

/* <lg 底部标签栏(主流 app 布局):社区 / 作品 / 发帖 / 用量 / 我的。
   完整功能、通知、设置与偏好从 MobileTopBar 的导航抽屉进入。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它。
   fixed 定位 + safe-area 内边距(iPhone home 条);主区在 (app)/layout 里补 pb-24 防遮挡。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GalleryVerticalEnd, MessagesSquare, SquarePen, User } from "lucide-react";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";

export default function MobileTabBar({
  locale,
  profileHref,
  loggedIn = false,
}: {
  locale: Locale;
  profileHref?: string;
  /* 未登录(20260919):受限项(发帖/用量/我的)直链登录弹窗,登录后回跳 */
  loggedIn?: boolean;
}) {
  const pathname = usePathname();
  /* 未登录时受限入口的目标(登录弹窗带回跳) */
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
      href: gate("/usage"),
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
      <div className="grid grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              /* 标签字体走系统 sans(20260815 评审):JetBrains Mono 无中文字形,
                 中文标签 fallback 混排基线不齐;tab 文案中英皆有,sans 两端都稳 */
              className={`flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 px-1 text-xs transition-colors ${
                tab.primary
                  ? "text-blue"
                  : tab.active
                    ? "text-blue"
                    : "text-grey hover:text-paper"
              }`}
            >
              <span className={`flex items-center justify-center ${tab.primary ? "size-10 rounded-lg bg-blue text-white shadow-lg shadow-blue/25" : "size-7"}`}>
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
