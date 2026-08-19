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
import { useCallback, useSyncExternalStore } from "react";
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
import { NAV_HIDDEN, UPCOMING } from "@/src/lib/upcoming";
import { WORKS_SRC_COOKIE, type WorksSource } from "@/src/lib/works-view";
import GithubIcon from "./GithubIcon";
import { NavToggle, SidebarToggle } from "./pref-controls";

/* hidden:近期不上线的板块(NAV_HIDDEN)入口直接不渲染 */
const SECTIONS = [
  { href: "/community", icon: MessagesSquare, key: "nav.community", soon: false, hidden: false },
  { href: "/blog", icon: Newspaper, key: "nav.blog", soon: UPCOMING.blog, hidden: UPCOMING.blog },
  { href: "/learn", icon: BookOpen, key: "nav.learn", soon: UPCOMING.learn, hidden: UPCOMING.learn },
  { href: "/works", icon: GalleryVerticalEnd, key: "nav.works", soon: false, hidden: false },
  { href: "/awesome", icon: Star, key: "nav.awesome", soon: false, hidden: false },
  { href: "/usage", icon: BarChart3, key: "nav.usage", soon: false, hidden: false },
  { href: "/demo-night", icon: Presentation, key: "nav.demoNight", soon: false, hidden: NAV_HIDDEN.demoNight },
] as const;

export default function LeftNav({
  locale,
  profileHref,
  moderator = false,
  loggedIn = false,
  worksSrc = null,
}: {
  locale: Locale;
  profileHref?: string;
  /* admin/mod:底部工具组多「管理」入口(20260830 治理) */
  moderator?: boolean;
  /* 未登录(20260919):受限项(发帖/用量/设置)直链 /login?next=…——
     应用内点击即弹登录弹窗,登录后回跳目标页,不再先进页面看各自的登录门 */
  loggedIn?: boolean;
  /* 来源列表 SSR 初值(layout 读 kb-works-src cookie):详情页 /works/[id]
     同时服务作品/Awesome 两个列表,高亮按「用户从哪个列表进来」判定 */
  worksSrc?: WorksSource | null;
}) {
  const pathname = usePathname();
  /* (app) layout 不随软导航重渲染,prop 只是首屏值;路由变化时读最新 cookie
     (proxy 在 /works、/awesome 列表页响应里写入,到达详情页时已生效)。
     与详情页「返回」链接(fromList)同一事实来源,两个入口永远指向同一列表。
     cookie 没有变更事件,订阅为空操作:快照在每次渲染时重读,
     pathname 变化(软导航)触发重渲染即取到新来源(模式同 app/error.tsx)。 */
  const src = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => {
      const match = document.cookie.match(
        new RegExp(`(?:^|;\\s*)${WORKS_SRC_COOKIE}=(works|awesome)`),
      );
      return match ? match[1] : "";
    },
    () => worksSrc ?? "",
  );
  /* 详情页归属:来自 Awesome 的 /works/* 高亮 Awesome,否则高亮作品 */
  const fromAwesome = pathname.startsWith("/works") && src === "awesome";

  /* 未登录时受限入口的目标(登录弹窗带回跳);工具入口(关于/GitHub)不受限 */
  const gate = (path: string) =>
    loggedIn ? path : `/login?next=${encodeURIComponent(path)}`;
  const createAction = pathname.startsWith("/awesome")
    ? { href: "/works/new", label: t(locale, "awesome.recommend") }
    : pathname.startsWith("/works")
      ? { href: "/works/new", label: t(locale, "works.submit") }
      : { href: "/community/new", label: t(locale, "nav.post") };

  /* 激活态:详情页 /works/[id] 按来源列表判定归属(见上方 fromAwesome),
     其余路由按前缀;Awesome 在来自 Awesome 的作品详情里同样激活 */
  const isActive = (href: string) => {
    if (href === "/works") return pathname.startsWith("/works") && !fromAwesome;
    if (href === "/awesome") return pathname.startsWith("/awesome") || fromAwesome;
    return pathname.startsWith(href);
  };

  /* rail-tip:菜单项的 data-tip 提示仅收起态(图标轨)右弹;展开态有文案不弹
     (globals.css 的 .rail-tip 规则) */
  const itemCls = (active: boolean) =>
    `nav-item rail-tip flex min-h-11 items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:bg-card hover:text-paper"
    }`;

  /* 「界面」双键共用的紧凑盒样式;form 等宽由 globals.css 的 .panel-pair 规则给。 */
  const pairBtnCls =
    "flex min-h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue";

  return (
    <aside className="leftnav sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-y-auto py-8 lg:flex">
      <Link prefetch={false}
        href={gate(createAction.href)}
        data-tip={createAction.label}
        data-tip-side="right"
 className="nav-item rail-tip flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <SquarePen size={16} className="shrink-0" />
        <span className="nav-label">{createAction.label}</span>
      </Link>

      <nav className="mt-6 space-y-1">
        {/* SOON 降权(20260815 评审):未就绪板块移到可用板块之后,细线分组
            + 降不透明度——导航位次是重要性的信号,占位项不再占黄金位。
            收起态(rail)下分组细线仍在,SOON 徽标保留(item 级标注)。 */}
        {SECTIONS.filter((s) => !s.hidden && !s.soon).map((s) => {
          const Icon = s.icon;
          /* 用量需登录:未登录直链登录弹窗(其余板块公开浏览) */
          const href = s.href === "/usage" ? gate(s.href) : s.href;
          return (
            <Link prefetch={false}
              key={s.href}
              href={href}
              data-tip={t(locale, s.key)}
              data-tip-side="right"
              className={itemCls(isActive(s.href))}
            >
              <Icon size={15} className="shrink-0" />
              <span className="nav-label flex flex-1 items-center">
                {t(locale, s.key)}
              </span>
            </Link>
          );
        })}
        {profileHref && (
          <Link prefetch={false}
            href={profileHref}
            data-tip={t(locale, "nav.profile")}
            data-tip-side="right"
            className={itemCls(pathname.startsWith("/u/"))}
          >
            <User size={15} className="shrink-0" />
            <span className="nav-label">{t(locale, "nav.profile")}</span>
          </Link>
        )}
        {SECTIONS.filter((s) => !s.hidden && s.soon).length > 0 && (
          <div className="mt-3 space-y-1 border-t border-line pt-3">
            {SECTIONS.filter((s) => !s.hidden && s.soon).map((s) => {
              const Icon = s.icon;
              return (
                <Link prefetch={false}
                  key={s.href}
                  href={s.href}
                  data-tip={`${t(locale, s.key)} · ${t(locale, "nav.soon")}`}
                  data-tip-side="right"
                  className={`${itemCls(isActive(s.href))} opacity-75`}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="nav-label flex flex-1 items-center">
                    {t(locale, s.key)}
                    <span className="ml-auto text-xs tracking-wider text-grey/70">
                      {t(locale, "nav.soon")}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="mt-auto space-y-1 pt-8">
        {moderator && (
          <Link prefetch={false}
            href="/admin"
            data-tip={t(locale, "nav.admin")}
            data-tip-side="right"
            className={itemCls(pathname.startsWith("/admin"))}
          >
            <ShieldCheck size={15} className="shrink-0" />
            <span className="nav-label">{t(locale, "nav.admin")}</span>
          </Link>
        )}
        <Link prefetch={false}
          href={gate("/settings")}
          data-tip={t(locale, "nav.settings")}
          data-tip-side="right"
          className={itemCls(pathname.startsWith("/settings"))}
        >
          <Settings size={15} className="shrink-0" />
          <span className="nav-label">{t(locale, "nav.settings")}</span>
        </Link>
        <a
          href="https://github.com/kimi-builders"
          data-tip="GitHub"
          data-tip-side="right"
          className={itemCls(false)}
        >
          <GithubIcon size={15} />
          <span className="nav-label">GitHub</span>
        </a>
        <Link prefetch={false} href="/about" data-tip={t(locale, "nav.about")} data-tip-side="right" className={itemCls(false)}>
          <Info size={15} className="shrink-0" />
          <span className="nav-label">{t(locale, "nav.about")}</span>
        </Link>
        {/* 「界面」双键:左=收起导航(PanelLeft*),右=隐藏侧栏(PanelRight*);
            左栏收起时纵排成图标键(globals.css 的 .panel-pair 规则) */}
        <div className="pt-3">
          <p className="nav-label px-3 pb-1.5 font-mono text-xs tracking-[0.08em] text-grey/60">
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
