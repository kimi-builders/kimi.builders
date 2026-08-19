/* 桌面顶栏(≥lg,fixed):左 = 品牌块(logo-tile + mono 字标,点染蓝,链 /);
   右 = 消息通知(铃铛 + 未读角标,登录后显示)、主题切换、语言切换、AuthChip。
   细线底边 + bg/毛玻璃,对齐 MobileTopBar 的处理;移动端(<lg)不渲染,
   MobileTopBar/底 tab/抽屉完全不受影响。
   主题/语言直接复用 pref-controls 的乐观 UI 控件(icon-only 形态),
   未读数由 (app)/layout SSR 下发(原左栏铃铛的同一来源)。 */
import Link from "next/link";
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import UnreadBadge from "@/components/UnreadBadge";
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
      {/* 内容与下方三栏共用 1320 居中容器:品牌与左栏左边线、登录态与右栏右边线对齐 */}
      <div className="mx-auto flex h-full w-full max-w-[1440px] items-center px-[5vw]">
      <Link
        href="/"
        title="kimi.builders"
        className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* 小尺寸瓷砖标(月牙+双星放大版):暗色主题下边缘清晰、双星可辨 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-7 w-7 shrink-0 rounded-md" />
        <span>
          kimi<span className="text-ui-blue">.</span>builders
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1.5 text-xs">
        <GlobalSearch locale={locale} mode="desktop" className={iconBtn} />
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
