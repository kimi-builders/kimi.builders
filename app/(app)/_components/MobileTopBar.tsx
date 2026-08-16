/* <lg 的顶部 mini 栏:全功能抽屉 + 品牌。登录态(头像/退出)收进抽屉顶部的
   账号块,顶栏保持纯净;主题、语言和次级入口同样在抽屉里。 */
import Link from "next/link";
import AuthChip from "@/components/AuthChip";
import type { Locale } from "@/src/lib/i18n";
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
      <GlobalSearch
        locale={locale}
        mode="mobile"
        className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      />
    </div>
  );
}
