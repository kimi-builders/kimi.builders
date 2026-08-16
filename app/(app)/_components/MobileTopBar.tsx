/* <lg 的顶部 mini 栏:全功能抽屉 + 品牌 + 通知 + 搜索。登录态(头像/退出)
   收进抽屉顶部的账号块,顶栏保持纯净;主题、语言和次级入口同样在抽屉里。
   通知位(20260815 评审):回访钩子不该藏进抽屉 —— 与桌面顶栏同款铃铛 +
   未读角标,移动端一号触达;未登录不占位。 */
import Link from "next/link";
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
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
  /* admin/mod:抽屉里多「管理」入口(20260830 治理) */
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
        {/* 小尺寸瓷砖标:双主题稳定 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-6 w-6 rounded-md" />
        <span className="truncate">kimi<span className="text-blue">.</span>builders</span>
      </Link>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {loggedIn && (
          <Link
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
          </Link>
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
