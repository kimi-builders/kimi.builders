"use client";

/* Preference toggles (theme/language/nav collapse/sidebar hide),
   optimistic: a click first flips the <html> attributes + writes
   document.cookie — the UI updates immediately, never waiting on the
   network; SSR first paint emits the same attributes from the cookie
   (root layout), so both sides always agree. Without JS it degrades
   to a form POST (the server action flips the cookie and re-renders
   the whole page). Language is the only network-dependent one: UI copy
   is fully SSR, so after flipping the cookie the client
   router.refresh()es for fresh copy (one round trip) and fire-and-
   forgets the account preference. */
import { useTransition, useState } from "react";
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
  applyLocale,
  applyTheme,
  applyVibe,
  flipNav,
  flipSidebar,
  writePrefCookie,
} from "@/src/lib/prefs-client";
import { DEFAULT_VIBE, type Vibe } from "@/src/lib/vibe";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
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
import {
  setLocaleToAction,
  setMotionToAction,
  setThemeToAction,
  setVibeToAction,
} from "../settings/actions";

/* Theme: a pure client flip (cookie-only, no server round trip). The
   action logic lives in src/lib/prefs-client (one code path with the
   keyboard layer). */
export function ThemeToggle({
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
    <form action={setThemeAction}>
      <button
        type="submit"
        data-tip={t(locale, "topbar.theme")}
        data-tip-side="bottom"
        data-tip-align="right"
        aria-label={t(locale, "topbar.theme")}
        onClick={(e) => {
          e.preventDefault();
          applyTheme(
            document.documentElement.dataset.theme === "light" ? "dark" : "light",
          );
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

/* Language: flip the cookie + html.lang client-side, then refresh for
   fresh SSR copy; the signed-in user's account preference (the first
   priority for AI reply language) writes in the background, never
   blocking the UI. */
export function LocaleToggle({
  locale,
  className,
  withLabel = false,
}: {
  locale: Locale;
  className?: string;
  withLabel?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form action={setLocaleAction}>
      <button
        type="submit"
        data-tip={t(locale, "topbar.lang")}
        data-tip-side="bottom"
        data-tip-align="right"
        aria-label={t(locale, "topbar.lang")}
        onClick={(e) => {
          e.preventDefault();
          const next = document.documentElement.lang === "zh-CN" ? "en" : "zh";
          applyLocale(next);
          void saveLocaleAction(next);
          startTransition(() => router.refresh());
        }}
        className={`${className ?? ""}${pending ? " opacity-50" : ""}`}
      >
        <span className="w-[15px] shrink-0 text-center text-xs">文</span>
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

/* Nav collapse/expand: pure client (cookie-only); visibility rules
   live in globals.css's html[data-nav] block, icons and copy switch by
   state via only-nav-*. Sits beside the sidebar toggle as the left
   rail's "interface" pair (className passed by LeftNav). */
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
        data-tip={`${t(locale, "nav.collapse")} / ${t(locale, "nav.expand")}`}
        data-tip-side="right"
        aria-label={t(locale, "nav.collapseOrExpand")}
        onClick={(e) => {
          e.preventDefault();
          flipNav();
        }}
        className={`${className} rail-tip`}
      >
        <PanelLeftClose size={13} className="shrink-0 only-nav-full" />
        <PanelLeftOpen size={13} className="shrink-0 only-nav-collapsed" />
        <span className="nav-label only-nav-full">{t(locale, "nav.collapse")}</span>
        <span className="nav-label only-nav-collapsed">{t(locale, "nav.expand")}</span>
      </button>
    </form>
  );
}

/* Sidebar hide/reopen: same (cookie-only, rules in globals.css's
   html[data-sidebar] block). The toggle moved to the left rail's
   "interface" group; hidden leaves no thin-track button on the right;
   icons and copy switch via only-sidebar-*. */
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
        data-tip={`${t(locale, "side.hide")} / ${t(locale, "side.show")}`}
        data-tip-side="right"
        aria-label={t(locale, "side.hideOrShow")}
        onClick={(e) => {
          e.preventDefault();
          flipSidebar();
        }}
        className={`${className} rail-tip`}
      >
        <PanelRightClose size={13} className="shrink-0 only-sidebar-full" />
        <PanelRightOpen size={13} className="shrink-0 only-sidebar-hidden" />
        <span className="nav-label only-sidebar-full">{t(locale, "side.hide")}</span>
        <span className="nav-label only-sidebar-hidden">{t(locale, "side.show")}</span>
      </button>
    </form>
  );
}

/* Visual vibe: angular poster (default) <-> rounded classic soft.
   Pure client flip (cookie-only); the shape language lives entirely in
   globals.css's data-vibe block (radii zeroed / shadows emptied /
   strokes demoted) — this only flips the <html> attribute + writes the
   cookie. Icons and copy show the target state (same as ThemeToggle:
   dark shows Sun). */
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
        data-tip={t(locale, "topbar.vibe")}
        data-tip-side="bottom"
        data-tip-align="right"
        aria-label={t(locale, "topbar.vibe")}
        onClick={(e) => {
          e.preventDefault();
          applyVibe(
            document.documentElement.dataset.vibe === "soft" ? "poster" : "soft",
            locale,
          );
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

/* Vibe cards (settings "preferences"): one angular, one classic;
   active states ride globals.css's html[data-vibe] state classes;
   preview chips use literal radii (rounded-[..] arbitrary values never
   pass through --radius-* variables, so poster mode can't zero them —
   the preview stays honest under both vibes). The "default" badge
   follows DEFAULT_VIBE (configurable via src/lib/vibe.ts). */
export function VibeCards({ locale }: { locale: Locale }) {
  const pick = (next: Vibe) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    document.documentElement.dataset.vibe = next;
    writePrefCookie("kb_vibe", next);
  };
  const card =
    "w-36 rounded-xl border border-line p-2.5 text-left transition-colors hover:border-ui-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
  const defaultBadge = (
    <span className="rounded-[2px] border border-line px-1 text-xs text-grey">
      {t(locale, "set.vibeDefault")}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-3">
      <form action={setVibeToAction} className="contents">
        <button type="submit" name="vibe" value="poster" onClick={pick("poster")} className={`${card} vibe-card-poster`}>
          <span className="flex h-16 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-bg">
            <span className="size-6 rounded-[1px] border border-blue bg-blue/10" />
            <span className="size-6 rounded-[1px] border border-line bg-moon" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-xs text-paper">
            {t(locale, "vibe.poster")}
            {DEFAULT_VIBE === "poster" && defaultBadge}
          </span>
        </button>
        <button type="submit" name="vibe" value="soft" onClick={pick("soft")} className={`${card} vibe-card-soft`}>
          <span className="flex h-16 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-bg">
            <span className="size-6 rounded-[8px] border border-blue bg-blue/10" />
            <span className="size-6 rounded-[8px] border border-line bg-moon" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-xs text-paper">
            {t(locale, "vibe.soft")}
            {DEFAULT_VIBE === "soft" && defaultBadge}
          </span>
        </button>
      </form>
    </div>
  );
}

/* Language segmented (settings "preferences"): an explicit two-key
   seg, active state riding globals.css's html[lang] classes (correct
   from SSR first paint); logic shares LocaleToggle's source (cookie +
   html.lang + refresh + background account-preference write). */
export function LocaleSeg({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pick = (next: "zh" | "en") => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    writePrefCookie("kb_locale", next);
    void saveLocaleAction(next);
    startTransition(() => router.refresh());
  };
  return (
    <div
      className={`${SEG_WRAP}${pending ? " opacity-50" : ""}`}
      role="group"
      aria-label={t(locale, "set.languageGroup")}
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

/* Theme cards (settings "preferences"): dark/light mini previews,
   active state riding globals.css's html[data-theme] classes; logic
   same as ThemeToggle (pure client cookie, no network). */
export function ThemeCards({ locale }: { locale: Locale }) {
  const pick = (next: "dark" | "light") => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    document.documentElement.dataset.theme = next;
    writePrefCookie("kb_theme", next);
  };
  const card =
    "w-36 rounded-xl border border-line p-2.5 text-left transition-colors hover:border-ui-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
  return (
    <div className="flex flex-wrap gap-3">
      <form action={setThemeToAction} className="contents">
        <button type="submit" name="theme" value="dark" onClick={pick("dark")} className={`${card} theme-card-dark`}>
          <span className="flex h-16 items-center justify-center rounded-lg border border-line bg-bg text-ui-blue">
            <Moon size={22} aria-hidden="true" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-xs text-paper">
            {t(locale, "set.themeDark")}
            <span className="rounded border border-line px-1 text-xs text-grey">
              {t(locale, "set.themeDefault")}
            </span>
          </span>
        </button>
        <button type="submit" name="theme" value="light" onClick={pick("light")} className={`${card} theme-card-light`}>
          <span className="flex h-16 items-center justify-center rounded-lg border border-line bg-moon text-ui-blue">
            <Sun size={22} aria-hidden="true" />
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-mono text-xs text-paper">
            {t(locale, "set.themeLight")}
          </span>
        </button>
      </form>
    </div>
  );
}

/* Motion segmented (settings "preferences"): follow system / reduce.
   Pure client cookie (kb_motion); reduce -> <html
   data-motion="reduce">, sharing the same degradation as the system
   prefers-reduced-motion in globals.css; the active state is driven
   locally (with no value the attribute is removed entirely, so no CSS
   state class). */
export function MotionSeg({
  locale,
  initial,
}: {
  locale: Locale;
  /* SSR emits the cookie's initial value (root layout's getUiPrefs). */
  initial: "follow" | "reduce";
}) {
  const [value, setValue] = useState(initial);
  const pick =
    (next: "follow" | "reduce") =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setValue(next);
      if (next === "reduce") {
        document.documentElement.setAttribute("data-motion", "reduce");
      } else {
        document.documentElement.removeAttribute("data-motion");
      }
      writePrefCookie("kb_motion", next);
    };
  return (
    <div className={SEG_WRAP} role="group" aria-label={t(locale, "set.motion")}>
      <form action={setMotionToAction} className="contents">
        <button
          type="submit"
          name="motion"
          value="follow"
          onClick={pick("follow")}
          className={`${SEG_ITEM} ${value === "follow" ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
        >
          {t(locale, "set.motionFollow")}
        </button>
        <button
          type="submit"
          name="motion"
          value="reduce"
          onClick={pick("reduce")}
          className={`${SEG_ITEM} ${value === "reduce" ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
        >
          {t(locale, "set.motionReduce")}
        </button>
      </form>
    </div>
  );
}
