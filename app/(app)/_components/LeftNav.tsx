"use client";

/* Site-wide left rail (the function menu): a post CTA + section
   navigation + bottom tools (settings/GitHub/about) + the "interface"
   pair (collapse nav / hide sidebar; the sidebar toggle moved here from
   the rail's thin track, sitting beside the nav toggle: PanelLeft* =
   nav, PanelRight* = sidebar — icon direction is semantics, no
   ambiguity). The brand block and notifications/theme/language moved
   to the desktop TopBar; section-level navigation lives in the rail's
   "browse community". Flush to the viewport's left edge: the shell no
   longer centers with blank margins (layout's flex first column, no
   container padding). Client component: usePathname drives the active
   state (blue rail). The collapsed state is pure CSS (html[data-nav] +
   .nav-label, see globals.css) — toggling costs no network; the
   structure renders for both states. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Compass,
  Info,
  Lock,
  MessagesSquare,
  Presentation,
  Settings,
  Shell,
  ShieldCheck,
  Sprout,
  SquarePen,
  User,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { NAV_HIDDEN, UPCOMING } from "@/src/lib/upcoming";
import type { WorksSource } from "@/src/lib/works-view";
import GithubIcon from "./GithubIcon";
import { NavToggle, SidebarToggle } from "./pref-controls";
import useWorksSource from "./useWorksSource";

/* hidden: entries for sections not shipping soon (NAV_HIDDEN) never
   render. The mobile drawer (MobileNavDrawer) reuses the same registry
   so both surfaces always agree. */
export const SECTIONS = [
  { href: "/community", icon: MessagesSquare, key: "nav.community", soon: false, hidden: false },
  { href: "/explore", icon: Compass, key: "nav.explore", soon: UPCOMING.explore, hidden: UPCOMING.explore },
  { href: "/works", icon: Shell, key: "nav.works", soon: false, hidden: false },
  { href: "/awesome", icon: Sprout, key: "nav.awesome", soon: false, hidden: false },
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
  /* admin/mod: the bottom tools gain an "admin" entry. */
  moderator?: boolean;
  /* Signed out: gated items (post/usage/settings) link straight to
     /login?next=... — an in-app click opens the login modal and returns
     to the target after login, instead of first landing on each page's
     own login gate. */
  loggedIn?: boolean;
  /* Source-list SSR initial value (layout reads the kb-works-src
     cookie): /works/[id] detail serves both the works and Awesome
     lists, and the highlight follows the list the user came from. */
  worksSrc?: WorksSource | null;
}) {
  const pathname = usePathname();
  /* The (app) layout doesn't re-render on soft navigation, so the prop
     is only the first-paint value; on route changes read the latest
     cookie (written by proxy into /works and /awesome list responses —
     already effective by the time the detail page arrives). Same
     source of truth as the detail page's "back" link (fromList) — the
     two entries always point at the same list. Cookies have no change
     events, so the subscribe is a no-op: the snapshot rereads on every
     render, and a pathname change (soft navigation) re-renders and
     picks up the new source (same pattern as app/error.tsx). */
  const src = useWorksSource(worksSrc);
  /* Detail-page ownership: /works/* arrived at from Awesome highlights
     Awesome, otherwise works. */
  const fromAwesome = pathname.startsWith("/works") && src === "awesome";

  /* Targets for gated entries when signed out (the login modal carries
     the redirect); tool entries (about/GitHub) stay ungated. Gated
     actions carry a login preview in their copy — you know the click
     logs in before clicking, saving one wasted jump. */
  const gate = (path: string) =>
    loggedIn ? path : `/login?next=${encodeURIComponent(path)}`;
  const gatedLabel = (label: string) =>
    loggedIn
      ? label
      : locale === "zh"
        ? `登录后${label}`
        : `Log in to ${label.toLowerCase()}`;
  const createAction = pathname.startsWith("/awesome")
    ? { href: "/works/new", label: gatedLabel(t(locale, "awesome.recommend")) }
    : pathname.startsWith("/works")
      ? { href: "/works/new", label: gatedLabel(t(locale, "works.submit")) }
      : { href: "/community/new", label: gatedLabel(t(locale, "nav.post")) };

  /* Active state: /works/[id] details decide ownership by source list
     (see fromAwesome above); other routes go by prefix; Awesome also
     activates inside works details arrived at from Awesome. */
  const isActive = (href: string) => {
    if (href === "/works") return pathname.startsWith("/works") && !fromAwesome;
    if (href === "/awesome") return pathname.startsWith("/awesome") || fromAwesome;
    return pathname.startsWith(href);
  };

  /* rail-tip: menu items' data-tip hints pop right only in the
     collapsed (icon rail) state; expanded items carry labels and never
     pop (globals.css .rail-tip rule). */
  const itemCls = (active: boolean) =>
    `nav-item rail-tip flex min-h-11 items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:bg-card hover:text-paper"
    }`;

  /* The compact box style shared by the "interface" pair; equal form
     widths come from globals.css's .panel-pair rule. Stacked full rows:
     at half width side-by-side, EN "Hide sidebar" truncates to
     side...; a full row fits every language and matches the collapsed
     state's stacked icon keys. Left-aligned px-3 lines up with the nav
     items' and the "interface" label's left edge. */
  const pairBtnCls =
    "flex min-h-10 w-full items-center justify-start gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue";

  return (
    <aside className="leftnav sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-y-auto py-8 lg:flex">
      {/* Every tipped link also carries an explicit aria-label: collapsed
          mode hides .nav-label via display:none, and the tooltip's
          alt-discarded ::after no longer contributes a name. */}
      <Link prefetch={false}
        href={gate(createAction.href)}
        data-tip={createAction.label}
        data-tip-side="right"
        aria-label={createAction.label}
 className="nav-item rail-tip flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <SquarePen size={16} className="shrink-0" />
        <span className="nav-label">{createAction.label}</span>
      </Link>

      <nav className="mt-6 space-y-1">
        {/* Group labels: once items exceed the skim limit, mono small caps
            group them (same spec as the bottom "interface" group); collapsed
            mode hides them along with nav-label. */}
        <p className="nav-label px-3 pb-1.5 font-mono text-xs tracking-[0.08em] text-grey">
          {t(locale, "nav.groupSections")}
        </p>
        {/* SOON demoted: not-yet-ready sections move after the ready ones,
            separated by a hairline and dimmed — nav order signals
            importance, so placeholders don't take the prime slots. In
            collapsed (rail) mode the hairline stays and the SOON badge
            remains (item-level annotation). */}
        {SECTIONS.filter((s) => !s.hidden && !s.soon).map((s) => {
          const Icon = s.icon;
          return (
            <Link prefetch={false}
              key={s.href}
              href={s.href}
              data-tip={t(locale, s.key)}
              data-tip-side="right"
              aria-label={t(locale, s.key)}
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
          <div className="mt-3 border-t border-line pt-3">
            <p className="nav-label px-3 pb-1.5 font-mono text-xs tracking-[0.08em] text-grey">
              {t(locale, "nav.groupAccount")}
            </p>
            <Link prefetch={false}
              href={profileHref}
              data-tip={t(locale, "nav.profile")}
              data-tip-side="right"
              aria-label={t(locale, "nav.profile")}
              className={itemCls(pathname.startsWith("/u/"))}
            >
              <User size={15} className="shrink-0" />
              <span className="nav-label">{t(locale, "nav.profile")}</span>
            </Link>
          </div>
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
                  aria-label={`${t(locale, s.key)} · ${t(locale, "nav.soon")}`}
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
        <p className="nav-label px-3 pb-1.5 font-mono text-xs tracking-[0.08em] text-grey">
          {t(locale, "nav.groupMore")}
        </p>
        {moderator && (
          <Link prefetch={false}
            href="/admin"
            data-tip={t(locale, "nav.admin")}
            data-tip-side="right"
            aria-label={t(locale, "nav.admin")}
            className={itemCls(pathname.startsWith("/admin"))}
          >
            <ShieldCheck size={15} className="shrink-0" />
            <span className="nav-label">{t(locale, "nav.admin")}</span>
          </Link>
        )}
        <Link prefetch={false}
          href={gate("/settings")}
          data-tip={
            loggedIn
              ? t(locale, "nav.settings")
              : `${t(locale, "nav.settings")} · ${t(locale, "nav.lockHint")}`
          }
          data-tip-side="right"
          aria-label={t(locale, "nav.settings")}
          className={itemCls(pathname.startsWith("/settings"))}
        >
          <Settings size={15} className="shrink-0" />
          <span className="nav-label flex items-center gap-1.5">
            {t(locale, "nav.settings")}
            {!loggedIn && (
              <Lock size={11} className="shrink-0 text-grey/50" aria-label={t(locale, "nav.lockHint")} />
            )}
          </span>
        </Link>
        <a
          href="https://github.com/kimi-builders"
          data-tip="GitHub"
          data-tip-side="right"
          aria-label="GitHub"
          className={itemCls(false)}
        >
          <GithubIcon size={15} />
          <span className="nav-label">GitHub</span>
        </a>
        <Link prefetch={false} href="/about" data-tip={t(locale, "nav.about")} data-tip-side="right" aria-label={t(locale, "nav.about")} className={itemCls(false)}>
          <Info size={15} className="shrink-0" />
          <span className="nav-label">{t(locale, "nav.about")}</span>
        </Link>
        {/* The interface key pair: top = collapse the nav (PanelLeft*),
            bottom = hide the sidebar (PanelRight*); stacked vertically in
            one row, converging to icon keys when collapsed (.panel-pair
            rule in globals.css). */}
        <div className="pt-3">
          <p className="nav-label px-3 pb-1.5 font-mono text-xs tracking-[0.08em] text-grey">
            {t(locale, "side.display")}
          </p>
          <div className="panel-pair flex flex-col gap-1.5">
            <NavToggle locale={locale} className={pairBtnCls} />
            <SidebarToggle locale={locale} className={pairBtnCls} />
          </div>
        </div>
      </div>
    </aside>
  );
}
