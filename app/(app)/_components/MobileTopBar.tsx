/* <lg 的顶部 mini 栏:品牌 + 社区/发帖 + 主题/语言切换 + 登录态。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它。 */
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import { t, type Locale } from "@/src/lib/i18n";
import type { Theme } from "@/src/lib/prefs";
import { setLocaleAction, setThemeAction } from "../community/actions";

export default function MobileTopBar({
  locale,
  theme,
}: {
  locale: Locale;
  theme: Theme;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-5 border-b border-moon bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link
        href="/"
        className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* 暗色瓷砖头像:浅色主题下也稳定 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/avatar-512.png" alt="" className="h-5 w-5 rounded" />
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
        <form action={setThemeAction}>
          <button
            type="submit"
            aria-label={t(locale, theme === "dark" ? "aria.toLight" : "aria.toDark")}
            className="text-grey transition-colors hover:text-paper"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </form>
        <form action={setLocaleAction}>
          <button
            type="submit"
            aria-label={t(locale, "aria.lang")}
            className="text-grey transition-colors hover:text-paper"
          >
            {locale === "zh" ? "EN" : "中"}
          </button>
        </form>
        <AuthChip />
      </div>
    </div>
  );
}
