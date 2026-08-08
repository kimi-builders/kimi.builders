/* <lg 的顶部 mini 栏:品牌 + 社区/发帖 + 主题/语言切换 + 登录态。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它。 */
import Link from "next/link";
import AuthChip from "@/components/AuthChip";
import { t, type Locale } from "@/src/lib/i18n";
import { LocaleToggle, ThemeToggle } from "./pref-controls";

export default function MobileTopBar({ locale }: { locale: Locale }) {
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
