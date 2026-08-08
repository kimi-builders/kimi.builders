"use client";

/* 全站左栏(X 风格顶级导航):品牌 + 发帖 CTA + 分区导航(社区在用,其余 SOON)
   + 底部工具(主题/语言/GitHub/关于/收起)。板块级导航在右栏「浏览社区」。
   客户端组件:usePathname 做激活态(蓝边 rail);主题/语言翻转走 server action。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Info,
  MessagesSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  SquarePen,
  Star,
  Sun,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import type { Theme } from "@/src/lib/prefs";
import {
  setLocaleAction,
  setThemeAction,
  toggleNavAction,
} from "../community/actions";

/* GitHub 品牌字形(Lucide 已移除品牌图标;取自 SimpleIcons,CC0) */
function GithubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const SECTIONS = [
  { href: "/community", icon: MessagesSquare, key: "nav.community", soon: false },
  { href: "/learn", icon: BookOpen, key: "nav.learn", soon: true },
  { href: "/works", icon: Rocket, key: "nav.works", soon: true },
  { href: "/usage", icon: BarChart3, key: "nav.usage", soon: true },
  { href: "/awesome", icon: Star, key: "nav.awesome", soon: true },
] as const;

export default function LeftNav({
  collapsed,
  locale,
  theme,
}: {
  collapsed: boolean;
  locale: Locale;
  theme: Theme;
}) {
  const pathname = usePathname();

  const itemCls = (active: boolean) =>
    `flex items-center gap-3 border-l-2 py-2 font-mono text-xs transition-colors ${
      collapsed ? "justify-center px-0" : "px-3"
    } ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:text-paper"
    }`;

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto py-6 lg:flex ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <Link
        href="/"
        title="kimi.builders"
        className={`flex items-center gap-2 font-mono text-sm font-semibold tracking-wide ${
          collapsed ? "justify-center" : "px-3"
        }`}
      >
        {/* 暗色瓷砖头像:浅色主题下也稳定(透明底月牙在亮底会隐形) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/avatar-512.png" alt="" className="h-6 w-6 shrink-0 rounded" />
        {!collapsed && (
          <span>
            kimi<span className="text-blue">.</span>builders
          </span>
        )}
      </Link>

      <Link
        href="/community/new"
        title={t(locale, "nav.post")}
        className="mt-6 flex items-center justify-center gap-2 border border-blue py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
      >
        <SquarePen size={14} className="shrink-0" />
        {!collapsed && t(locale, "nav.post")}
      </Link>

      <nav className="mt-6 space-y-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          if (s.soon) {
            return (
              <span
                key={s.href}
                title={locale === "zh" ? "即将上线" : "Coming soon"}
                className={`${itemCls(false)} cursor-not-allowed opacity-45 hover:text-grey`}
              >
                <Icon size={15} className="shrink-0" />
                {!collapsed && (
                  <>
                    {t(locale, s.key)}
                    <span className="ml-auto font-mono text-[9px] tracking-wider text-grey/70">
                      {t(locale, "nav.soon")}
                    </span>
                  </>
                )}
              </span>
            );
          }
          return (
            <Link
              key={s.href}
              href={s.href}
              title={t(locale, s.key)}
              className={itemCls(pathname.startsWith(s.href))}
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && t(locale, s.key)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 pt-8">
        <form action={setThemeAction}>
          <button
            type="submit"
            title={t(locale, theme === "dark" ? "aria.toLight" : "aria.toDark")}
            aria-label={t(locale, theme === "dark" ? "aria.toLight" : "aria.toDark")}
            className={`${itemCls(false)} w-full`}
          >
            {theme === "dark" ? (
              <Sun size={15} className="shrink-0" />
            ) : (
              <Moon size={15} className="shrink-0" />
            )}
            {!collapsed && (theme === "dark" ? "Light" : "Dark")}
          </button>
        </form>
        <form action={setLocaleAction}>
          <button
            type="submit"
            title={t(locale, "aria.lang")}
            aria-label={t(locale, "aria.lang")}
            className={`${itemCls(false)} w-full`}
          >
            <span className="w-[15px] shrink-0 text-center text-[11px]">文</span>
            {!collapsed && (locale === "zh" ? "English" : "中文")}
          </button>
        </form>
        <a
          href="https://github.com/kimi-builders"
          title="GitHub"
          className={itemCls(false)}
        >
          <GithubIcon size={15} />
          {!collapsed && "GitHub"}
        </a>
        <Link href="/" title={t(locale, "nav.about")} className={itemCls(false)}>
          <Info size={15} className="shrink-0" />
          {!collapsed && t(locale, "nav.about")}
        </Link>
        <form action={toggleNavAction}>
          <button
            type="submit"
            title={t(locale, collapsed ? "nav.expand" : "nav.collapse")}
            className={`${itemCls(false)} w-full`}
          >
            {collapsed ? (
              <PanelLeftOpen size={15} className="shrink-0" />
            ) : (
              <>
                <PanelLeftClose size={15} className="shrink-0" />
                {t(locale, "nav.collapse")}
              </>
            )}
          </button>
        </form>
      </div>
    </aside>
  );
}
