"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { searchSiteItems, type SiteSearchItem } from "@/src/lib/site-search";
import { NAV_HIDDEN, UPCOMING } from "@/src/lib/upcoming";

/* 未就绪板块(src/lib/upcoming.ts):搜索结果里保留词条但挂 SOON 标 */
const soon = (locale: Locale, gated: boolean) =>
  gated ? ` · ${t(locale, "nav.soon")}` : "";

function catalog(locale: Locale): SiteSearchItem[] {
  return [
    {
      href: "/community",
      label: t(locale, "nav.community"),
      description: t(locale, "search.community"),
      keywords: ["community", "社区", "posts", "帖子", "discussion"],
    },
    {
      href: "/works",
      label: t(locale, "nav.works"),
      description: t(locale, "search.works"),
      keywords: ["works", "作品", "projects", "gallery"],
    },
    {
      href: "/awesome",
      label: t(locale, "nav.awesome"),
      description: t(locale, "search.awesome"),
      keywords: ["awesome", "推荐", "external", "外部"],
    },
    {
      href: "/learn",
      label: t(locale, "nav.learn") + soon(locale, UPCOMING.learn),
      description: t(locale, "search.learn"),
      keywords: ["learn", "知识库", "guide", "指南"],
    },
    {
      href: "/blog",
      label: t(locale, "nav.blog") + soon(locale, UPCOMING.blog),
      description: t(locale, "search.blog"),
      keywords: ["blog", "月刊", "letter", "文章"],
    },
    {
      href: "/usage",
      label: t(locale, "nav.usage"),
      description: t(locale, "search.usage"),
      keywords: ["usage", "用量", "token", "dashboard", "analytics"],
    },
    /* 近期不上线的板块(NAV_HIDDEN)连搜索词条一并摘掉 */
    ...(NAV_HIDDEN.demoNight
      ? []
      : [
          {
            href: "/demo-night",
            label: t(locale, "search.demoNightTitle"),
            description: t(locale, "search.demoNight"),
            keywords: ["demo", "night", "展示夜", "event", "活动"],
          },
        ]),
    {
      href: "/settings",
      label: t(locale, "nav.settings"),
      description: t(locale, "search.settings"),
      keywords: ["settings", "设置", "profile", "privacy", "偏好"],
    },
  ];
}

export default function GlobalSearch({
  locale,
  mode,
  className = "",
}: {
  locale: Locale;
  mode: "desktop" | "mobile";
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const items = useMemo(() => catalog(locale), [locale]);
  const results = useMemo(() => searchSiteItems(items, query), [items, query]);

  const open = () => {
    dialogRef.current?.showModal();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const close = () => {
    dialogRef.current?.close();
    setQuery("");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      if ((mode === "desktop") !== desktop) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        data-tip={t(locale, "search.open")}
        data-tip-side="bottom"
        data-tip-align="right"
        aria-label={t(locale, "search.open")}
        className={className}
      >
        <Search size={16} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${mode}-search-title`}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed left-1/2 top-[12vh] m-0 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper shadow-2xl backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={18} className="shrink-0 text-ui-blue" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="站内搜索 / Search site"
            placeholder={t(locale, "search.placeholder")}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-paper outline-none placeholder:text-grey/70"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t(locale, "modal.close")}
            className="flex size-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[min(62vh,32rem)] overflow-y-auto p-2">
          <h2 id={`${mode}-search-title`} className="px-3 pb-2 pt-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
            {query ? t(locale, "search.results") : t(locale, "search.jumpTo")}
          </h2>
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-moon focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-semibold text-paper">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-grey">{item.description}</span>
                  </span>
                  <ArrowUpRight size={16} className="shrink-0 text-grey transition-colors group-hover:text-ui-blue" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Search size={24} className="text-grey/60" aria-hidden="true" />
              <p className="mt-3 font-mono text-sm text-paper">{t(locale, "search.empty")}</p>
              <p className="mt-1 text-xs text-grey">{t(locale, "search.emptyHint")}</p>
            </div>
          )}
        </div>
        <p className="border-t border-line px-4 py-2 text-right font-mono text-xs text-grey/70">
          {t(locale, "search.shortcut")}
        </p>
      </dialog>
    </>
  );
}
