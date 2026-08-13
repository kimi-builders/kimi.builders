"use client";

/* 全站左栏(功能菜单):发帖 CTA + 分区导航 + 底部工具(设置/GitHub/关于)
   + 「界面」双键(收起导航 / 隐藏侧栏;右栏开关自右栏细轨迁入,与收起导航
   左右并排:PanelLeft*=导航、PanelRight*=侧栏,图标方向即语义,不歧义)。
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
  GalleryVerticalEnd,
  Info,
  MessagesSquare,
  Newspaper,
  Presentation,
  Settings,
  ShieldCheck,
  SquarePen,
  Star,
  User,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { UPCOMING } from "@/src/lib/upcoming";
import GithubIcon from "./GithubIcon";
import { NavToggle, SidebarToggle } from "./pref-controls";

const SECTIONS = [
  { href: "/community", icon: MessagesSquare, key: "nav.community", soon: false },
  { href: "/blog", icon: Newspaper, key: "nav.blog", soon: UPCOMING.blog },
  { href: "/learn", icon: BookOpen, key: "nav.learn", soon: UPCOMING.learn },
  { href: "/works", icon: GalleryVerticalEnd, key: "nav.works", soon: false },
  { href: "/usage", icon: BarChart3, key: "nav.usage", soon: false },
  { href: "/awesome", icon: Star, key: "nav.awesome", soon: false },
  { href: "/demo-night", icon: Presentation, key: "nav.demoNight", soon: UPCOMING.demoNight },
] as const;

export default function LeftNav({
  locale,
  profileHref,
  moderator = false,
}: {
  locale: Locale;
  profileHref?: string;
  /* admin/mod:底部工具组多「管理」入口(20260830 治理) */
  moderator?: boolean;
}) {
  const pathname = usePathname();

  const itemCls = (active: boolean) =>
    `nav-item flex items-center gap-3 border-l-2 px-3 py-2 font-mono text-xs transition-colors ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:text-paper"
    }`;

  /* 「界面」双键共用的紧凑盒样式;form 等宽由 globals.css 的 .panel-pair 规则给。 */
  const pairBtnCls =
    "flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2 py-1.5 font-mono text-[10px] text-grey transition-colors hover:border-blue hover:text-blue";

  return (
    <aside className="leftnav sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-y-auto py-8 lg:flex">
      <Link prefetch={false}
        href="/community/new"
        title={t(locale, "nav.post")}
        className="nav-item flex items-center justify-center gap-2 rounded-lg bg-blue py-2.5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <SquarePen size={14} className="shrink-0" />
        <span className="nav-label">{t(locale, "nav.post")}</span>
      </Link>

      <nav className="mt-6 space-y-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link prefetch={false}
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
          <Link prefetch={false}
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
        {moderator && (
          <Link prefetch={false}
            href="/admin"
            title={t(locale, "nav.admin")}
            className={itemCls(pathname.startsWith("/admin"))}
          >
            <ShieldCheck size={15} className="shrink-0" />
            <span className="nav-label">{t(locale, "nav.admin")}</span>
          </Link>
        )}
        <Link prefetch={false}
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
        <Link prefetch={false} href="/" title={t(locale, "nav.about")} className={itemCls(false)}>
          <Info size={15} className="shrink-0" />
          <span className="nav-label">{t(locale, "nav.about")}</span>
        </Link>
        {/* 「界面」双键:左=收起导航(PanelLeft*),右=隐藏侧栏(PanelRight*);
            左栏收起时纵排成图标键(globals.css 的 .panel-pair 规则) */}
        <div className="pt-3">
          <p className="nav-label px-3 pb-1.5 font-mono text-[9px] tracking-[0.16em] text-grey/60">
            {t(locale, "side.display")}
          </p>
          <div className="panel-pair flex gap-1.5">
            <NavToggle locale={locale} className={pairBtnCls} />
            <SidebarToggle locale={locale} className={pairBtnCls} />
          </div>
        </div>
      </div>
    </aside>
  );
}
