/* <lg 的顶部 mini 栏:品牌 + 社区/发帖 + 消息/主题/语言切换 + 登录态。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它。 */
import Link from "next/link";
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import { t, type Locale } from "@/src/lib/i18n";
import { LocaleToggle, ThemeToggle } from "./pref-controls";

export default function MobileTopBar({
  locale,
  unread = 0,
}: {
  locale: Locale;
  unread?: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-5 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link
        href="/"
        className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* 小尺寸瓷砖标:双主题稳定 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-6 w-6 rounded-md" />
        kimi<span className="text-blue">.</span>builders
      </Link>
      <nav className="flex gap-4 font-mono text-xs text-grey">
        <Link href="/community" className="transition-colors hover:text-paper">
          {t(locale, "nav.community")}
        </Link>
        <Link
          href="/community/new"
          className="transition-colors hover:text-paper"
        >
          {t(locale, "nav.post")}
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-4 font-mono text-xs">
        <Link
          href="/community/notifications"
          aria-label={t(locale, "notif.title")}
          className="relative text-grey transition-colors hover:text-paper"
        >
          <Bell size={14} />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue px-1 text-[8px] font-semibold text-bg">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <ThemeToggle
          iconSize={14}
          className="text-grey transition-colors hover:text-paper"
        />
        <LocaleToggle className="text-grey transition-colors hover:text-paper" />
        <AuthChip />
      </div>
    </div>
  );
}
