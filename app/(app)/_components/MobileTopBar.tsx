/* <lg 的顶部 mini 栏:全功能抽屉 + 品牌 + 登录态。
   主题、语言和次级入口收进抽屉，窄屏首行只保留高频动作。 */
import Link from "next/link";
import AuthChip from "@/components/AuthChip";
import type { Locale } from "@/src/lib/i18n";
import MobileNavDrawer from "./MobileNavDrawer";

export default function MobileTopBar({
  locale,
  unread = 0,
  profileHref,
}: {
  locale: Locale;
  unread?: number;
  profileHref?: string;
}) {
  return (
    <div className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b border-line bg-bg/95 px-2 backdrop-blur lg:hidden">
      <MobileNavDrawer locale={locale} unread={unread} profileHref={profileHref} />
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* 小尺寸瓷砖标:双主题稳定 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-6 w-6 rounded-md" />
        <span className="truncate">kimi<span className="text-blue">.</span>builders</span>
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-3 font-mono text-xs">
        <AuthChip compact />
      </div>
    </div>
  );
}
