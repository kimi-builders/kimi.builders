"use client";

/* Shared client-side preference toggling: the buttons (pref-controls)
   and the global keyboard layer (components/KeyboardShortcuts) share
   one code path — flip the <html> attributes + write the cookie,
   optimistic UI with zero network; SSR first paint renders the same
   attributes from the cookie, so both sides always agree. Language is
   the only one needing the network (UI copy is SSR); applyLocale only
   flips locally — router.refresh and persisting the account preference
   are the caller's job (same split as LocaleToggle). */
import { t, type Locale } from "./i18n";
import { toast } from "./toast";
import type { Vibe } from "./vibe";

const YEAR = 365 * 86400;

export function writePrefCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/* Theme-switch transition: while flipping data-theme, briefly set
   data-theme-anim; globals.css gives large surfaces a 200ms transition;
   repeated clicks reset the timer without stacking windows. */
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
  /* The change is site-wide radii/shadows, gradual and subtle — one
     confirming toast. */
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

/* Flip language locally (<html lang> + cookie); router.refresh for new
   copy and saveLocaleAction for the account preference are the caller's
   follow-ups. */
export function applyLocale(next: "zh" | "en") {
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  writePrefCookie("kb_locale", next);
}
