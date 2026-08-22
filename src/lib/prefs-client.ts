"use client";

/* 客户端偏好切换共享层(20260822 快捷键):按钮(pref-controls)与全局
   键盘层(components/KeyboardShortcuts)同一代码路径——翻 <html> 属性 +
   写 cookie,乐观 UI 零网络;SSR 首屏按 cookie 直出同一组属性,两侧永远
   一致。语言是唯一需要网络的(界面文案 SSR),applyLocale 只做本地翻转,
   router.refresh + 账号偏好写入由调用方补(与 LocaleToggle 同一分工)。 */
import { t, type Locale } from "./i18n";
import { toast } from "./toast";
import type { Vibe } from "./vibe";

const YEAR = 365 * 86400;

export function writePrefCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/* 主题切换过渡(20260821 评审):翻 data-theme 时短暂挂 data-theme-anim,
   globals.css 给大面积颜色 200ms 过渡;连点重置计时,不叠加窗口。 */
let themeAnimTimer: ReturnType<typeof setTimeout> | undefined;

export function flashThemeAnim() {
  const el = document.documentElement;
  el.setAttribute("data-theme-anim", "");
  clearTimeout(themeAnimTimer);
  themeAnimTimer = setTimeout(() => el.removeAttribute("data-theme-anim"), 260);
}

export function applyTheme(next: "dark" | "light") {
  flashThemeAnim();
  document.documentElement.dataset.theme = next;
  writePrefCookie("kb_theme", next);
}

export function flipTheme(): "dark" | "light" {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  return next;
}

export function applyVibe(next: Vibe, locale: Locale) {
  document.documentElement.dataset.vibe = next;
  writePrefCookie("kb_vibe", next);
  /* 变化是全站圆角/投影,渐进且弱感知——toast 一次确认(20260821 评审) */
  toast(t(locale, "pref.vibeToast", { name: t(locale, next === "soft" ? "vibe.soft" : "vibe.poster") }));
}

export function flipVibe(locale: Locale): Vibe {
  const next: Vibe = document.documentElement.dataset.vibe === "soft" ? "poster" : "soft";
  applyVibe(next, locale);
  return next;
}

export function setNavCollapsed(collapsed: boolean) {
  document.documentElement.dataset.nav = collapsed ? "1" : "0";
  writePrefCookie("kb_nav", collapsed ? "1" : "0");
}

export function flipNav() {
  setNavCollapsed(document.documentElement.dataset.nav !== "1");
}

export function setSidebarHidden(hidden: boolean) {
  document.documentElement.dataset.sidebar = hidden ? "0" : "1";
  writePrefCookie("kb_sidebar", hidden ? "0" : "1");
}

export function flipSidebar() {
  setSidebarHidden(document.documentElement.dataset.sidebar !== "0");
}

/* 语言本地翻转(<html lang> + cookie);router.refresh 拉新文案与
   saveLocaleAction 的账号偏好写入由调用方跟进 */
export function applyLocale(next: "zh" | "en") {
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  writePrefCookie("kb_locale", next);
}
