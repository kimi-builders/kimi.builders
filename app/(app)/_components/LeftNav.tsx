"use client";

/* 全站左栏(功能菜单):发帖 CTA + 分区导航 + 底部工具(设置/GitHub/关于/收起)。
   品牌块与通知/主题/语言已移出到桌面顶栏(TopBar);板块级导航在右栏「浏览社区」。
   贴视口左缘:壳不再整体居中留白边(layout 的 flex 首列,无容器 padding)。
   客户端组件:usePathname 做激活态(蓝边 rail)。
   收起态纯 CSS 驱动(html[data-nav] + .nav-label,见 globals.css),
   切换零网络;结构对两种状态常渲染。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
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
import { NavToggle } from "./pref-controls";

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
  profileHref,
}: {
  locale: Locale;
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
    <aside className="leftnav sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-y-auto py-8 lg:flex">
      <Link
        href="/community/new"
        title={t(locale, "nav.post")}
        className="nav-item flex items-center justify-center gap-2 border border-blue py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
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
