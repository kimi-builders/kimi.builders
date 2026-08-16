"use client";

/* 偏好切换控件(主题/语言/左栏收起/右栏隐藏),乐观更新:
   点击先改 <html> 属性 + 写 document.cookie,界面立即生效、不等网络;
   SSR 首屏按 cookie 直出同一组 <html> 属性(root layout),两侧永远一致。
   无 JS 时退化为 form POST(server action 翻 cookie 后整页重渲)。
   语言是唯一需要网络的:界面文案全部 SSR,客户端翻完 cookie 后
   router.refresh() 拉新文案(一次往返),并 fire-and-forget 写账号偏好。 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Circle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Square,
  Sun,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import {
  SEG_ITEM,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import {
  saveLocaleAction,
  setLocaleAction,
  setThemeAction,
  setVibeAction,
  toggleNavAction,
  toggleSidebarAction,
} from "../community/actions";
import { setLocaleToAction, setThemeToAction, setVibeToAction } from "../settings/actions";

const YEAR = 365 * 86400;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/* 主题:纯客户端翻转(cookie-only 偏好,无需任何服务器往返)。 */
export function ThemeToggle({
  className,
  withLabel = false,
  iconSize = 15,
}: {
  className?: string;
  withLabel?: boolean;
  iconSize?: number;
}) {
  return (
    <form action={setThemeAction}>
      <button
        type="submit"
        title="切换主题 / Toggle theme"
        aria-label="切换主题 / Toggle theme"
        onClick={(e) => {
          e.preventDefault();
          const el = document.documentElement;
          const next = el.dataset.theme === "light" ? "dark" : "light";
          el.dataset.theme = next;
          writeCookie("kb_theme", next);
        }}
        className={className}
      >
        <Sun size={iconSize} className="shrink-0 only-dark" />
        <Moon size={iconSize} className="shrink-0 only-light" />
        {withLabel && (
          <>
            <span className="nav-label only-dark">Light</span>
            <span className="nav-label only-light">Dark</span>
          </>
        )}
      </button>
    </form>
  );
}

/* 语言:客户端翻 cookie + html.lang,然后 refresh 拉 SSR 新文案;
   登录用户的账号偏好(AI 回帖语言第一优先级)后台写入,不阻塞界面。 */
export function LocaleToggle({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form action={setLocaleAction}>
      <button
        type="submit"
        title="切换语言 / Switch language"
        aria-label="切换语言 / Switch language"
        onClick={(e) => {
          e.preventDefault();
          const el = document.documentElement;
          const next = el.lang === "zh-CN" ? "en" : "zh";
          el.lang = next === "zh" ? "zh-CN" : "en";
          writeCookie("kb_locale", next);
          void saveLocaleAction(next);
          startTransition(() => router.refresh());
        }}
        className={`${className ?? ""}${pending ? " opacity-50" : ""}`}
      >
        <span className="w-[15px] shrink-0 text-center text-[11px]">文</span>
        {withLabel && (
          <>
            <span className="nav-label only-zh">English</span>
            <span className="nav-label only-en">中文</span>
          </>
        )}
      </button>
    </form>
  );
}

/* 左栏收起/展开:纯客户端(cookie-only);显隐规则在 globals.css 的
   html[data-nav] 块,图标与文案用 only-nav-* 按态切换。
   与右栏开关并排组成左栏底部的「界面」双键(className 由 LeftNav 传入)。 */
export function NavToggle({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  return (
    <form action={toggleNavAction}>
      <button
        type="submit"
        title={`${t(locale, "nav.collapse")} / ${t(locale, "nav.expand")}`}
        aria-label="收起或展开导航 / Collapse or expand navigation"
        onClick={(e) => {
          e.preventDefault();
          const el = document.documentElement;
          const next = el.dataset.nav === "1" ? "0" : "1";
          el.dataset.nav = next;
          writeCookie("kb_nav", next);
        }}
        className={className}
      >
        <PanelLeftClose size={13} className="shrink-0 only-nav-full" />
        <PanelLeftOpen size={13} className="shrink-0 only-nav-collapsed" />
        <span className="nav-label only-nav-full">{t(locale, "nav.collapse")}</span>
        <span className="nav-label only-nav-collapsed">{t(locale, "nav.expand")}</span>
      </button>
    </form>
  );
}

/* 右栏隐藏/重开:同上(cookie-only,显隐规则在 globals.css 的
   html[data-sidebar] 块)。开关已迁到左栏「界面」组,隐藏后不再在右侧
   留细轨按钮;图标与文案用 only-sidebar-* 按态切换。 */
export function SidebarToggle({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  return (
    <form action={toggleSidebarAction}>
      <button
        type="submit"
        title={`${t(locale, "side.hide")} / ${t(locale, "side.show")}`}
        aria-label="隐藏或显示右侧栏 / Hide or show the sidebar"
        onClick={(e) => {
          e.preventDefault();
          const el = document.documentElement;
          const next = el.dataset.sidebar === "0" ? "1" : "0";
          el.dataset.sidebar = next;
          writeCookie("kb_sidebar", next);
        }}
        className={className}
      >
        <PanelRightClose size={13} className="shrink-0 only-sidebar-full" />
        <PanelRightOpen size={13} className="shrink-0 only-sidebar-hidden" />
        <span className="nav-label only-sidebar-full">{t(locale, "side.hide")}</span>
        <span className="nav-label only-sidebar-hidden">{t(locale, "side.show")}</span>
      </button>
    </form>
  );
}

/* 视觉气质(20260815 拍板):工程棱角 poster(默认) ⇄ 圆润经典 soft。
   纯客户端翻转(cookie-only);形态语言全在 globals.css 的 data-vibe 块
   (圆角归零 / 投影置空 / 涂层降档),这里只翻 <html> 属性 + 写 cookie。
   图标与文案显示「目标态」(同 ThemeToggle:暗色下显示 Sun)。 */
export function VibeToggle({
  locale,
  className,
  withLabel = false,
  iconSize = 15,
}: {
  locale: Locale;
  className?: string;
  withLabel?: boolean;
  iconSize?: number;
}) {
  return (
    <form action={setVibeAction}>
      <button
        type="submit"
        title="切换视觉气质 / Toggle visual style"
        aria-label="切换视觉气质 / Toggle visual style"
        onClick={(e) => {
          e.preventDefault();
          const el = document.documentElement;
          const next = el.dataset.vibe === "soft" ? "poster" : "soft";
          el.dataset.vibe = next;
          writeCookie("kb_vibe", next);
        }}
        className={className}
      >
        <Circle size={iconSize} className="shrink-0 only-poster" />
        <Square size={iconSize} className="shrink-0 only-soft" />
        {withLabel && (
          <>
            <span className="nav-label only-poster">{t(locale, "vibe.soft")}</span>
            <span className="nav-label only-soft">{t(locale, "vibe.poster")}</span>
          </>
        )}
      </button>
    </form>
  );
}

/* 气质卡片(设置页「偏好」):工程棱角/圆润经典两张卡,激活态走 globals.css
   的 html[data-vibe] 态类;预览小块用字面量圆角(rounded-[..] 任意值不经过
   --radius-* 变量,海报模式下不会被归零,两种气质下预览都如实)。 */
export function VibeCards({ locale }: { locale: Locale }) {
  const pick = (next: "poster" | "soft") => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    document.documentElement.dataset.vibe = next;
    writeCookie("kb_vibe", next);
  };
  const card =
    "w-36 rounded-xl border border-line p-2.5 text-left transition-colors hover:border-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
  return (
    <div className="flex flex-wrap gap-3">
      <form action={setVibeToAction} className="contents">
        <button type="submit" name="vibe" value="poster" onClick={pick("poster")} className={`${card} vibe-card-poster`}>
          <span className="flex h-16 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-bg">
            <span className="size-6 rounded-[1px] border border-blue bg-blue/10" />
            <span className="size-6 rounded-[1px] border border-line bg-moon" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-paper">
            {t(locale, "vibe.poster")}
            <span className="rounded-[2px] border border-line px-1 text-[10.5px] text-grey">
              {t(locale, "set.vibeDefault")}
            </span>
          </span>
        </button>
        <button type="submit" name="vibe" value="soft" onClick={pick("soft")} className={`${card} vibe-card-soft`}>
          <span className="flex h-16 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-bg">
            <span className="size-6 rounded-[8px] border border-blue bg-blue/10" />
            <span className="size-6 rounded-[8px] border border-line bg-moon" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-paper">
            {t(locale, "vibe.soft")}
          </span>
        </button>
      </form>
    </div>
  );
}

/* 语言分段(设置页「偏好」):seg 双键显式选择,激活态走 globals.css的
   html[lang] 态类(SSR 首屏即正确);逻辑与 LocaleToggle 同源(cookie +
   html.lang + refresh + 账号偏好后台写入)。 */
export function LocaleSeg() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pick = (next: "zh" | "en") => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    writeCookie("kb_locale", next);
    void saveLocaleAction(next);
    startTransition(() => router.refresh());
  };
  return (
    <div
      className={`${SEG_WRAP}${pending ? " opacity-50" : ""}`}
      role="group"
      aria-label="界面语言 / Interface language"
    >
      <form action={setLocaleToAction} className="contents">
        <button
          type="submit"
          name="locale"
          value="zh"
          onClick={pick("zh")}
          className={`${SEG_ITEM} ${SEG_ITEM_IDLE} seg-zh`}
        >
          中文
        </button>
        <button
          type="submit"
          name="locale"
          value="en"
          onClick={pick("en")}
          className={`${SEG_ITEM} ${SEG_ITEM_IDLE} seg-en`}
        >
          English
        </button>
      </form>
    </div>
  );
}

/* 主题卡片(设置页「偏好」):深/浅两张迷你预览卡,激活态走 globals.css 的
   html[data-theme] 态类;逻辑同 ThemeToggle(纯客户端 cookie,无网络)。 */
export function ThemeCards({ locale }: { locale: Locale }) {
  const pick = (next: "dark" | "light") => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    document.documentElement.dataset.theme = next;
    writeCookie("kb_theme", next);
  };
  const card =
    "w-36 rounded-xl border border-line p-2.5 text-left transition-colors hover:border-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
  return (
    <div className="flex flex-wrap gap-3">
      <form action={setThemeToAction} className="contents">
        <button type="submit" name="theme" value="dark" onClick={pick("dark")} className={`${card} theme-card-dark`}>
          <span className="flex h-16 items-center justify-center rounded-lg border border-line bg-bg text-blue">
            <Moon size={22} aria-hidden="true" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-paper">
            {t(locale, "set.themeDark")}
            <span className="rounded border border-line px-1 text-[10.5px] text-grey">
              {t(locale, "set.themeDefault")}
            </span>
          </span>
        </button>
        <button type="submit" name="theme" value="light" onClick={pick("light")} className={`${card} theme-card-light`}>
          <span className="flex h-16 items-center justify-center rounded-lg border border-line bg-moon text-blue">
            <Sun size={22} aria-hidden="true" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-paper">
            {t(locale, "set.themeLight")}
          </span>
        </button>
      </form>
    </div>
  );
}
