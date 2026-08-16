"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  GalleryVerticalEnd,
  Info,
  Menu,
  MessagesSquare,
  Newspaper,
  Presentation,
  Settings,
  ShieldCheck,
  SquarePen,
  Star,
  User,
  X,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { NAV_HIDDEN, UPCOMING } from "@/src/lib/upcoming";
import UnreadBadge from "@/components/UnreadBadge";
import GithubIcon from "./GithubIcon";
import { LocaleToggle, ThemeToggle, VibeToggle } from "./pref-controls";

/* hidden:近期不上线的板块(NAV_HIDDEN)入口直接不渲染 */
const SECTIONS = [
  { href: "/community", icon: MessagesSquare, key: "nav.community", soon: false, hidden: false },
  { href: "/blog", icon: Newspaper, key: "nav.blog", soon: UPCOMING.blog, hidden: false },
  { href: "/learn", icon: BookOpen, key: "nav.learn", soon: UPCOMING.learn, hidden: false },
  { href: "/works", icon: GalleryVerticalEnd, key: "nav.works", soon: false, hidden: false },
  { href: "/awesome", icon: Star, key: "nav.awesome", soon: false, hidden: false },
  { href: "/usage", icon: BarChart3, key: "nav.usage", soon: false, hidden: false },
  { href: "/demo-night", icon: Presentation, key: "nav.demoNight", soon: false, hidden: NAV_HIDDEN.demoNight },
] as const;

export default function MobileNavDrawer({
  locale,
  unread = 0,
  profileHref,
  moderator = false,
  account,
  loggedIn = false,
}: {
  locale: Locale;
  unread?: number;
  profileHref?: string;
  /* admin/mod:账号导航里多「管理」入口(20260830 治理) */
  moderator?: boolean;
  /* 登录态块(头像 + @handle + 退出 / 登录入口),由服务端父组件组合进来。 */
  account?: ReactNode;
  /* 未登录(20260919):受限项(发帖/用量/通知/设置)直链 /login?next=… */
  loggedIn?: boolean;
}) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  /* 未登录时受限入口的目标(登录弹窗带回跳) */
  const gate = (path: string) =>
    loggedIn ? path : `/login?next=${encodeURIComponent(path)}`;

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const close = () => dialogRef.current?.close();
  const itemClass = (active: boolean) =>
    `flex min-h-12 items-center gap-3 border-l-2 px-4 font-mono text-sm transition-colors ${
      active
        ? "border-blue bg-blue/8 text-paper"
        : "border-transparent text-grey hover:bg-card hover:text-paper"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={t(locale, "nav.menu")}
        aria-haspopup="dialog"
        className="flex size-11 shrink-0 items-center justify-center text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="mobile-nav-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(88vw,22rem)] max-w-none overflow-hidden border-0 border-r border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/65"
      >
        <div className="flex h-full flex-col">
          <div className="flex min-h-16 items-center gap-3 border-b border-line px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-tile.svg" alt="" className="size-8 rounded-md" />
            <h2 id="mobile-nav-title" className="font-mono text-sm font-semibold tracking-wide">
              kimi<span className="text-blue">.</span>builders
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t(locale, "nav.closeMenu")}
              className="ml-auto flex size-11 items-center justify-center text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4">
            {/* 登录态块:头像 + @handle + 退出(未登录 = 登录入口),顶栏迁入 */}
            {account && (
              <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5 font-mono text-sm [&>a:last-child]:ml-auto">
                {account}
              </div>
            )}
            <Link
              href={gate("/community/new")}
              onClick={close}
              className="mx-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue px-4 font-mono text-sm font-semibold text-white shadow-lg shadow-blue/25 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <SquarePen size={16} aria-hidden="true" />
              {t(locale, "nav.post")}
            </Link>

            <nav aria-label={t(locale, "nav.menu")} className="mt-4 space-y-1">
              {/* SOON 降权(20260815 评审,与桌面 LeftNav 一致):未就绪板块
                  移到分组细线之后,不再占据列表头部 */}
              {SECTIONS.filter((section) => !section.hidden && !section.soon).map((section) => {
                const Icon = section.icon;
                const active = pathname.startsWith(section.href);
                /* 用量需登录:未登录直链登录弹窗(其余板块公开浏览) */
                const href =
                  section.href === "/usage" ? gate(section.href) : section.href;
                return (
                  <Link
                    key={section.href}
                    href={href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={itemClass(active)}
                  >
                    <Icon size={17} className="shrink-0" aria-hidden="true" />
                    <span>{t(locale, section.key)}</span>
                  </Link>
                );
              })}
            </nav>

            {SECTIONS.some((section) => !section.hidden && section.soon) && (
              <nav aria-label={t(locale, "nav.soon")} className="mt-2 space-y-1 border-t border-line pt-2">
                {SECTIONS.filter((section) => !section.hidden && section.soon).map((section) => {
                  const Icon = section.icon;
                  const active = pathname.startsWith(section.href);
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`${itemClass(active)} opacity-75`}
                    >
                      <Icon size={17} className="shrink-0" aria-hidden="true" />
                      <span>{t(locale, section.key)}</span>
                      <span className="ml-auto text-[10.5px] tracking-wider text-grey/70">
                        {t(locale, "nav.soon")}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            )}

            <div className="mx-4 my-4 border-t border-line" />

            <nav aria-label={zhOrEn(locale, "账号", "Account")} className="space-y-1">
              <Link
                href={gate("/community/notifications")}
                onClick={close}
                className={itemClass(pathname.startsWith("/community/notifications"))}
              >
                <span className="relative shrink-0">
                  <Bell size={17} aria-hidden="true" />
                  <UnreadBadge
                    initial={unread}
                    locale={locale}
                    className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue px-1 text-[8px] font-semibold text-white"
                  />
                </span>
                {t(locale, "notif.title")}
              </Link>
              <Link
                href={profileHref ?? gate("/settings")}
                onClick={close}
                className={itemClass(pathname.startsWith("/u/"))}
              >
                <User size={17} aria-hidden="true" />
                {t(locale, "nav.profile")}
              </Link>
              <Link
                href={gate("/settings")}
                onClick={close}
                className={itemClass(pathname.startsWith("/settings"))}
              >
                <Settings size={17} aria-hidden="true" />
                {t(locale, "nav.settings")}
              </Link>
              {moderator && (
                <Link
                  href="/admin"
                  onClick={close}
                  className={itemClass(pathname.startsWith("/admin"))}
                >
                  <ShieldCheck size={17} aria-hidden="true" />
                  {t(locale, "nav.admin")}
                </Link>
              )}
            </nav>
          </div>

          <div className="border-t border-line px-2 py-3">
            <ThemeToggle withLabel locale={locale} className={`${itemClass(false)} w-full`} />
            <VibeToggle withLabel locale={locale} className={`${itemClass(false)} w-full`} />
            <LocaleToggle withLabel locale={locale} className={`${itemClass(false)} w-full`} />
            <a href="https://github.com/kimi-builders" className={itemClass(false)}>
              <GithubIcon size={17} />
              GitHub
            </a>
            <Link href="/about" onClick={close} className={itemClass(false)}>
              <Info size={17} aria-hidden="true" />
              {t(locale, "nav.about")}
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

function zhOrEn(locale: Locale, zh: string, en: string): string {
  return locale === "zh" ? zh : en;
}
