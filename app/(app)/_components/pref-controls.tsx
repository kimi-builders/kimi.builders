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
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sun,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import {
  saveLocaleAction,
  setLocaleAction,
  setThemeAction,
  toggleNavAction,
  toggleSidebarAction,
} from "../community/actions";

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
   html[data-nav] 块,图标也用 only-nav-* 按态切换。 */
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
        title={t(locale, "nav.collapse")}
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
        <PanelLeftClose size={15} className="shrink-0 only-nav-full" />
        <PanelLeftOpen size={15} className="shrink-0 only-nav-collapsed" />
        <span className="nav-label">{t(locale, "nav.collapse")}</span>
      </button>
    </form>
  );
}

/* 右栏隐藏/重开:同上。variant=rail 是隐藏后留下的重开小按钮。 */
export function SidebarToggle({
  variant,
  locale,
}: {
  variant: "full" | "rail";
  locale: Locale;
}) {
  const flip = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const el = document.documentElement;
    const next = el.dataset.sidebar === "0" ? "1" : "0";
    el.dataset.sidebar = next;
    writeCookie("kb_sidebar", next);
  };
  if (variant === "rail") {
    return (
      <form action={toggleSidebarAction}>
        <button
          type="submit"
          title={t(locale, "side.show")}
          aria-label={t(locale, "side.show")}
          onClick={flip}
          className="border border-line p-2 text-grey transition-colors hover:border-blue hover:text-blue"
        >
          <PanelRightOpen size={15} />
        </button>
      </form>
    );
  }
  return (
    <form action={toggleSidebarAction}>
      <button
        type="submit"
        title={t(locale, "side.hide")}
        onClick={flip}
        className="flex items-center gap-1.5 font-mono text-[10px] text-grey transition-colors hover:text-paper"
      >
        <PanelRightClose size={12} />
        {t(locale, "side.hide")}
      </button>
    </form>
  );
}

/* 主题翻转的 no-JS 兜底(与 setLocaleAction 同文件,保持引用一致)。 */
import { setThemeAction as setThemeActionFallback } from "../community/actions";
