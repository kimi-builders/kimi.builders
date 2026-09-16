"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Search, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { searchSiteItems, type SiteSearchItem } from "@/src/lib/site-search";
import {
  isSearchableQuery,
  type ContentHit,
  type ContentSearchResults,
} from "@/src/lib/site-content-search";
import { NAV_HIDDEN, UPCOMING } from "@/src/lib/upcoming";

/* Not-yet-ready sections: search results keep the entry but tag it
   SOON. */
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
      href: "/explore",
      label: t(locale, "nav.explore") + soon(locale, UPCOMING.explore),
      description: t(locale, "search.explore"),
      keywords: ["explore", "探索", "月刊", "教程", "letter", "guide", "articles", "文章"],
    },
    {
      href: "/usage",
      label: t(locale, "nav.usage"),
      description: t(locale, "search.usage"),
      keywords: ["usage", "用量", "token", "dashboard", "analytics"],
    },
    /* Sections not shipping soon (NAV_HIDDEN) drop out of search
       results entirely. */
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  /* The dialog portals to <body> (client-only): the home page re-scopes
     color tokens on its poster facade, and a dialog rendered inside that
     subtree inherits the warm poster palette — portaling keeps the modal
     on the app's standard tokens, identical everywhere. The
     useSyncExternalStore triple is the lint-clean hydration check (false
     on the server, true on the client, no subscription). */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  /* Arrow-key selection: the first item preselected, Enter opens the
     selection; resets when the query changes; clamps into range when
     results shrink. The flat list spans section-jump entries and every
     content hit, so one axis of navigation covers the whole modal. */
  const [active, setActive] = useState(0);
  const items = useMemo(() => catalog(locale), [locale]);
  const results = useMemo(() => searchSiteItems(items, query), [items, query]);
  /* Content search (posts/works/articles/members): debounced, aborted
     on retype; only fires once the trimmed query clears the shared
     length gate. Results carry the query they answer — a stale answer
     (retype mid-flight) is dropped by comparison, not by a reset.
     Failures keep the previous results — the modal stays usable as a
     section jumper. */
  const [fetched, setFetched] = useState<{
    q: string;
    results: ContentSearchResults;
  } | null>(null);
  const trimmed = query.trim();
  const content = fetched && fetched.q === trimmed ? fetched.results : null;
  useEffect(() => {
    if (!isSearchableQuery(trimmed)) return;
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: ac.signal,
        });
        if (res.ok) {
          const results = (await res.json()) as ContentSearchResults;
          setFetched({ q: trimmed, results });
        }
      } catch {
        /* aborted mid-flight or offline; keep the jump list */
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [trimmed]);
  const contentGroups = useMemo(
    () =>
      content
        ? ([
            [t(locale, "search.groupPosts"), content.posts],
            [t(locale, "search.groupWorks"), content.works],
            [t(locale, "search.groupArticles"), content.articles],
            [t(locale, "search.groupUsers"), content.users],
          ] as [string, ContentHit[]][]).filter(([, hits]) => hits.length > 0)
        : [],
    [content, locale],
  );
  const flat: { href: string; label: string; description: string }[] = useMemo(
    () => [
      ...results,
      ...contentGroups.flatMap(([, hits]) => hits),
    ],
    [results, contentGroups],
  );
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));

  const open = () => {
    dialogRef.current?.showModal();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const close = () => {
    dialogRef.current?.close();
  };
  /* Every close path (X, backdrop, ESC's native cancel, programmatic)
     funnels into the dialog's close event: reset the query and hand
     focus back to the trigger, so a keyboard user isn't dropped at the
     document top (same focus contract as the route modals). */
  const onDialogClose = () => {
    setQuery("");
    setActive(0);
    triggerRef.current?.focus();
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };

  /* Arrows/Enter inside the input: listened on this one field only,
     never touching page-level shortcuts. */
  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (flat.length === 0) return;
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + dir + flat.length) % flat.length);
      return;
    }
    if (event.key === "Enter") {
      const item = flat[activeIndex];
      if (!item) return;
      event.preventDefault();
      go(item.href);
    }
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
        ref={triggerRef}
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
      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby={`${mode}-search-title`}
            onClose={onDialogClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed left-1/2 top-[12vh] m-0 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={18} className="shrink-0 text-ui-blue" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            aria-label="站内搜索 / Search site"
            placeholder={t(locale, "search.placeholder")}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-paper outline-none placeholder:text-grey/70"
          />
          <button
            type="button"
            onClick={close}
            data-tip={t(locale, "modal.close")}
            data-tip-side="bottom"
            data-tip-align="right"
            aria-label={t(locale, "modal.close")}
            className="flex size-11 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[min(62vh,32rem)] overflow-y-auto p-2" role="listbox" aria-label={t(locale, "search.results")}>
          {results.length > 0 && (
            <>
              <h2 id={`${mode}-search-title`} className="px-3 pb-2 pt-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
                {query ? t(locale, "search.resultsJump") : t(locale, "search.jumpTo")}
              </h2>
              <div className="space-y-1">
                {results.map((item, i) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    onMouseEnter={() => setActive(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                      i === activeIndex ? "bg-moon" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-semibold text-paper">{item.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-grey">{item.description}</span>
                    </span>
                    <ArrowUpRight size={16} className={`shrink-0 text-grey transition-colors ${i === activeIndex ? "text-ui-blue" : "group-hover:text-ui-blue"}`} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </>
          )}
          {/* Content hits: appended under their family headings; the
              flat index continues from the jump entries so arrow keys
              walk the whole modal in visual order. */}
          {contentGroups.map(([label, hits], gi) => {
            const base = results.length + contentGroups.slice(0, gi).reduce((n, [, h]) => n + h.length, 0);
            return (
              <div key={label} role="group" aria-label={label}>
                <h2 className="px-3 pb-2 pt-3 font-mono text-xs uppercase tracking-[0.08em] text-grey">
                  {label}
                </h2>
                <div className="space-y-1">
                  {hits.map((item, i) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      onMouseEnter={() => setActive(base + i)}
                      role="option"
                      aria-selected={base + i === activeIndex}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                        base + i === activeIndex ? "bg-moon" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-semibold text-paper">{item.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-grey">{item.description}</span>
                      </span>
                      <ArrowUpRight size={16} className={`shrink-0 text-grey transition-colors ${base + i === activeIndex ? "text-ui-blue" : "group-hover:text-ui-blue"}`} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          {flat.length === 0 && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Search size={24} className="text-grey/60" aria-hidden="true" />
              <p className="mt-3 font-mono text-sm text-paper">
                {content === null && isSearchableQuery(trimmed)
                  ? t(locale, "search.searching")
                  : t(locale, "search.empty")}
              </p>
              <p className="mt-1 text-xs text-grey">{t(locale, "search.emptyHint")}</p>
            </div>
          )}
        </div>
        <p className="border-t border-line px-4 py-2 text-right font-mono text-xs text-grey/70">
          {t(locale, "search.shortcut")}
        </p>
          </dialog>,
          document.body,
        )}
    </>
  );
}
