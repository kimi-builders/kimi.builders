"use client";

/* 全站左栏(X 风格顶级导航):品牌 + 发帖 CTA + 分区导航(社区在用,其余 SOON)
   + 底部工具(主题/语言/GitHub/关于/收起)。板块级导航在右栏「浏览社区」。
   客户端组件:usePathname 做激活态(蓝边 rail)。
   收起态纯 CSS 驱动(html[data-nav] + .nav-label,见 globals.css),
   切换零网络;结构对两种状态常渲染。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Info,
  MessagesSquare,
  Newspaper,
  Rocket,
  Settings,
  SquarePen,
  Star,
  User,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import GithubIcon from "./GithubIcon";
import { LocaleToggle, NavToggle, ThemeToggle } from "./pref-controls";

const SECTIONS = [
  { href: "/community", icon: MessagesSquare, key: "nav.community", soon: false },
  { href: "/blog", icon: Newspaper, key: "nav.blog", soon: false },
  { href: "/learn", icon: BookOpen, key: "nav.learn", soon: false },
  { href: "/works", icon: Rocket, key: "nav.works", soon: false },
  { href: "/usage", icon: BarChart3, key: "nav.usage", soon: false },
  { href: "/awesome", icon: Star, key: "nav.awesome", soon: false },
] as const;

export default function LeftNav({
  locale,
  unread = 0,
  profileHref,
}: {
  locale: Locale;
  unread?: number;
  profileHref?: string;
}) {
  const pathname = usePathname();

  const itemCls = (active: boolean) =>
    `nav-item flex items-center gap-3 border-l-2 px-3 py-2 font-mono text-xs transition-colors ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:text-paper"
    }`;

  return (
    <aside className="leftnav sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto py-6 lg:flex">
      <Link
        href="/"
        title="kimi.builders"
        className="nav-item flex items-center gap-2 px-3 font-mono text-sm font-semibold tracking-wide"
      >
        {/* 小尺寸瓷砖标(月牙+双星放大版):暗色主题下边缘清晰、双星可辨 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-tile.svg" alt="" className="h-7 w-7 shrink-0 rounded-md" />
        <span className="nav-label">
          kimi<span className="text-blue">.</span>builders
        </span>
      </Link>

      <Link
        href="/community/new"
        title={t(locale, "nav.post")}
        className="nav-item mt-6 flex items-center justify-center gap-2 border border-blue py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
      >
        <SquarePen size={14} className="shrink-0" />
        <span className="nav-label">{t(locale, "nav.post")}</span>
      </Link>

      <nav className="mt-6 space-y-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              title={t(locale, s.key)}
              className={itemCls(pathname.startsWith(s.href))}
            >
              <Icon size={15} className="shrink-0" />
              <span className="nav-label flex items-center">
                {t(locale, s.key)}
                {s.soon && (
                  <span className="ml-auto font-mono text-[9px] tracking-wider text-grey/70">
                    {t(locale, "nav.soon")}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        {profileHref && (
          <Link
            href={profileHref}
            title={t(locale, "nav.profile")}
            className={itemCls(pathname.startsWith("/u/"))}
          >
            <User size={15} className="shrink-0" />
            <span className="nav-label">{t(locale, "nav.profile")}</span>
          </Link>
        )}
      </nav>

      <div className="mt-auto space-y-1 pt-8">
        <Link
          href="/community/notifications"
          title={t(locale, "notif.title")}
          className={itemCls(pathname.startsWith("/community/notifications"))}
        >
          <span className="relative shrink-0">
            <Bell size={15} />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue px-1 text-[8px] font-semibold text-bg">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
          <span className="nav-label">{t(locale, "notif.title")}</span>
        </Link>
        <ThemeToggle withLabel className={`${itemCls(false)} w-full`} />
        <LocaleToggle withLabel className={`${itemCls(false)} w-full`} />
        <Link
          href="/settings"
          title={t(locale, "nav.settings")}
          className={itemCls(pathname.startsWith("/settings"))}
        >
          <Settings size={15} className="shrink-0" />
          <span className="nav-label">{t(locale, "nav.settings")}</span>
        </Link>
        <a
          href="https://github.com/kimi-builders"
          title="GitHub"
          className={itemCls(false)}
        >
          <GithubIcon size={15} />
          <span className="nav-label">GitHub</span>
        </a>
        <Link href="/" title={t(locale, "nav.about")} className={itemCls(false)}>
          <Info size={15} className="shrink-0" />
          <span className="nav-label">{t(locale, "nav.about")}</span>
        </Link>
        <NavToggle locale={locale} className={`${itemCls(false)} w-full`} />
      </div>
    </aside>
  );
}
