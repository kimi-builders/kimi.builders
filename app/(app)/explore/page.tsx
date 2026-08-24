/* Explore collects reproducible, verifiable Builder practices with
   methods, evidence, and sources. Cold-start shape: one horizontal card
   per piece of content — no series/tutorial scaffolding until content
   grows into it. The chapter control only shows content-bearing options
   and disappears when fewer than two chapters can be compared.
   Products/roles/tags/archive are single-select dropdowns —
   options appear only when content exists, and a dimension with no
   content doesn't even render its dropdown. Formats (article/video/
   deck) don't filter — every piece carries all three media, marked on
   the card only. Filtered URLs (incl. ?chapter=) are noindex; combined
   empty states offer "clear filters + latest content". While the
   section switch is off, the whole page shows the placeholder. */
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  countByChapter,
  countByProduct,
  countByRoles,
  countTags,
  filterExploreItems,
  groupByArchive,
  listExploreItems,
} from "@/src/lib/explore";
import { KB_CHAPTERS, findKbChapter, isKbChapterId } from "@/src/lib/kb-chapters";
import { findKbProduct, isKbProductId } from "@/src/lib/kb-products";
import { KB_ROLES, isKbRoleId } from "@/src/lib/kb-roles";
import { isExploreFilterEnabled } from "@/src/lib/explore-filters";
import { canModerate } from "@/src/lib/featured";
import { UPCOMING } from "@/src/lib/upcoming";
import { getWorksView, isMobileRequest } from "@/src/lib/works-view-server";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import SoonPanel from "../_components/SoonPanel";
import WorksFilterBar from "../works/_components/WorksFilterBar";
import WorksViewToggle from "../works/_components/WorksViewToggle";
import ArticleGridCard from "./_components/ArticleGridCard";
import ArticleRowCard from "./_components/ArticleRowCard";
import { ChapterKeys } from "./_components/ExploreKeys";
import {
  SEG_ITEM_FLOW,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP_FLOW,
} from "@/components/seg-classes";

/* Single-select filter toggling (click again to clear): every other
   param survives. */
function lensHref(
  basePath: string,
  current: Record<string, string | undefined>,
  change: Record<string, string | undefined>,
): string {
  const merged = { ...current, ...change };
  const params = new URLSearchParams();
  for (const key of ["chapter", "product", "role", "tag", "year"]) {
    const v = merged[key];
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const locale = await getLocale();
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  /* Filtered combo URLs (chapter included) are noindex (no crawl traps);
     the default view is indexable. */
  const filtered =
    first(sp.chapter) || first(sp.product) || first(sp.role) || first(sp.tag) || first(sp.year);
  return {
    title: t(locale, "meta.explore"),
    description: t(locale, "metaDesc.explore"),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (UPCOMING.explore) {
    return (
      <SoonPanel
        title={t(locale, "nav.explore")}
        locale={locale}
        expect={t(locale, "soon.exploreExpect")}
      />
    );
  }
  const zh = locale === "zh";
  const sp = await searchParams;
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  /* Chapter/lens allowlist validation (invalid = unselected); legacy
     four-dimension and format params are ignored. */
  const requestedChapter = (() => {
    const v = first(sp.chapter);
    return v && isKbChapterId(v) ? v : undefined;
  })();
  const selProduct = (() => {
    const v = first(sp.product);
    return v && isKbProductId(v) ? v : undefined;
  })();
  const selRole = (() => {
    const v = first(sp.role);
    return v && isKbRoleId(v) ? v : undefined;
  })();
  const selTag = first(sp.tag) || undefined;
  const selYear = first(sp.year) || undefined;

  const items = await listExploreItems(locale);
  const chapterCounts = countByChapter(items);
  const activeChapters = KB_CHAPTERS.filter(
    (chapter) => (chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0) > 0,
  );
  const chapterFilterVisible = activeChapters.length >= 2;
  const selChapter =
    chapterFilterVisible && activeChapters.some((chapter) => chapter.id === requestedChapter)
      ? requestedChapter
      : undefined;
  const anyFilter = !!(selChapter || selProduct || selRole || selTag || selYear);

  /* Rows/cover wall: the same cookie preference as the works wall
     (kb-works-view); mobile is always rows (converged inside
     getWorksView) and the toggle isn't rendered. */
  const [view, mobile] = await Promise.all([getWorksView(), isMobileRequest()]);

  const sel = {
    chapter: selChapter,
    product: selProduct,
    role: selRole,
    tag: selTag,
    year: selYear,
  };
  const filtered = anyFilter ? filterExploreItems(items, sel) : items;

  const productCounts = countByProduct(items);
  const roleCounts = countByRoles(items);
  const tagCounts = countTags(items);
  const archiveGroups = groupByArchive(items);

  const current: Record<string, string | undefined> = {
    chapter: selChapter,
    product: selProduct,
    role: selRole,
    tag: selTag,
    year: selYear,
  };
  /* The <- -> chapter cycle's target sequence: "all" + chapters with
     content (empty chapters are dead ends and stay out of the cycle);
     hrefs come from lensHref so lenses survive a chapter switch. */
  const chapterHrefs = chapterFilterVisible
    ? [
        lensHref("/explore", current, { chapter: undefined }),
        ...activeChapters.map((c) => lensHref("/explore", current, { chapter: c.id })),
      ]
    : [];
  const chapterIndex = selChapter
    ? activeChapters.findIndex((c) => c.id === selChapter) + 1
    : 0;
  const preservedQuery = (() => {
    const params = new URLSearchParams();
    if (selChapter) params.set("chapter", selChapter);
    return params.toString();
  })();

  /* Filters appear per config and content: only dimensions enabled in
     explore-filters.ts and holding options get a dropdown — an empty
     dimension takes no slot; disabled dimensions (roles/archive) keep
     their vocabularies and counting logic, ready the moment the config
     flips. */
  const filterSpecs = [
    ...(isExploreFilterEnabled("product") && productCounts.length
      ? [{
          key: "product",
          label: zh ? "产品" : "Product",
          options: productCounts.map((c) => {
            const p = findKbProduct(c.value)!;
            const Icon = p.icon;
            return {
              value: c.value,
              label: `${zh ? p.zh : p.en} (${c.count})`,
              icon: <Icon size={13} aria-hidden="true" />,
            };
          }),
          single: true,
        }]
      : []),
    ...(isExploreFilterEnabled("role") && roleCounts.length
      ? [{
          key: "role",
          label: zh ? "职业" : "Role",
          options: roleCounts.map((c) => {
            const r = KB_ROLES.find((x) => x.id === c.value)!;
            return { value: c.value, label: `${zh ? r.zh : r.en} (${c.count})` };
          }),
          single: true,
        }]
      : []),
    ...(isExploreFilterEnabled("tag") && tagCounts.length
      ? [{
          key: "tag",
          label: zh ? "标签" : "Tag",
          options: tagCounts.map((tg) => ({ value: tg.value, label: `#${tg.value} (${tg.count})` })),
          single: true,
        }]
      : []),
    ...(isExploreFilterEnabled("year") && archiveGroups.length
      ? [{
          key: "year",
          label: zh ? "归档" : "Year",
          options: archiveGroups.map((g) => ({
            value: g.year,
            label: `${g.year} (${g.months.reduce((n, m) => n + m.items.length, 0)})`,
          })),
          single: true,
        }]
      : []),
  ];

  /* Publish entry: admin/mod only (beyond the page gate, the action
     layer re-checks). */
  const composeHref = "/blog/admin/new";
  const composeLink = (
    <Link
      href={composeHref}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
    >
      {t(locale, "explore.compose")}
    </Link>
  );

  return (
    <div>
      {/* <-/-> chapter cycling (keyboard shortcuts; the component no-ops internally when hrefs < 2) */}
      <ChapterKeys hrefs={chapterHrefs} index={chapterIndex} />
      <PageHeader
        eyebrow={t(locale, "explore.eyebrow")}
        title={t(locale, "nav.explore")}
        lede={t(locale, "explore.lede")}
        actions={user && canModerate(user.role) ? composeLink : undefined}
      />

      {/* ---- Tool row: content-bearing chapter seg + populated lens dropdowns ---- */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {chapterFilterVisible && (
          <nav
            aria-label={zh ? "章" : "Chapters"}
            className={`${SEG_WRAP_FLOW} max-sm:w-full`}
          >
            <Link
              href={lensHref("/explore", current, { chapter: undefined })}
              scroll={false}
              aria-current={!selChapter ? "page" : undefined}
              className={`${SEG_ITEM_FLOW} ${!selChapter ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
            >
              {zh ? "全部" : "All"} <span className="ml-1 opacity-60">{items.length}</span>
            </Link>
            {activeChapters.map((chapter) => {
              const count = chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0;
              return (
                <Link
                  key={chapter.id}
                  href={lensHref("/explore", current, {
                    chapter: selChapter === chapter.id ? undefined : chapter.id,
                  })}
                  scroll={false}
                  aria-current={selChapter === chapter.id ? "page" : undefined}
                  className={`${SEG_ITEM_FLOW} ${selChapter === chapter.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
                >
                  {zh ? chapter.zh : chapter.en}
                  <span className="ml-1 opacity-60">{count}</span>
                </Link>
              );
            })}
          </nav>
        )}
        {filterSpecs.length > 0 && (
          <WorksFilterBar
            basePath="/explore"
            preservedQuery={preservedQuery}
            locale={locale}
            filters={filterSpecs}
            selected={{
              ...(selProduct ? { product: [selProduct] } : { product: [] }),
              ...(selRole ? { role: [selRole] } : { role: [] }),
              ...(selTag ? { tag: [selTag] } : { tag: [] }),
              ...(selYear ? { year: [selYear] } : { year: [] }),
            }}
          />
        )}
        {items.length > 0 && !mobile && <WorksViewToggle locale={locale} view={view} />}
      </div>

      {/* ---- Chapter banner: selecting a chapter gives the spine a moment of
           ceremony — serif chapter word (same face as the cover's chapter
           tile) + definition line; the flat list is never regrouped ---- */}
      {selChapter &&
        (() => {
          const c = findKbChapter(selChapter)!;
          return (
            <section className="mt-6 flex items-center gap-4 border-b border-line pb-4">
              <span
                aria-hidden="true"
                className="font-human text-5xl leading-none text-paper"
              >
                {zh ? c.zh : c.en}
              </span>
              <p className="min-w-0 text-sm leading-relaxed text-grey">
                {zh ? c.tagline.zh : c.tagline.en}
              </p>
            </section>
          );
        })()}

      {/* ---- Content area: one card per piece, row list / cover wall ---- */}
      <div className="mt-6">
        {items.length === 0 ? (
          /* The cold-start state describes the content contract. */
          <EmptyState
            message={
              zh
                ? "第一篇 Builder 实践正在筹备,发布时会附方法、证据与出处。"
                : "The first Builder practice is being prepared with its method, evidence, and sources."
            }
            actions={user && canModerate(user.role) ? composeLink : undefined}
          />
        ) : !anyFilter ? (
          view === "grid" ? (
            <div key={view} className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((i) => (
                <ArticleGridCard key={i.slug} item={i} locale={locale} />
              ))}
            </div>
          ) : (
            <div key={view} className="stagger-in space-y-4">
              {items.map((i) => (
                <ArticleRowCard key={i.slug} item={i} locale={locale} />
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          /* Combined empty state: clear-all + latest content — no dead
             ends. */
          <>
            <EmptyState
              message={t(locale, "explore.emptyFilter")}
              actions={
                <Link
                  href="/explore"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  {t(locale, "works.clearFilters")}
                </Link>
              }
            />
            <section className="mt-8">
              <p className="kb-eyebrow border-b border-line pb-4">{t(locale, "explore.latest")}</p>
              <div className="mt-4 space-y-4">
                {items.slice(0, 3).map((i) => (
                  <ArticleRowCard key={i.slug} item={i} locale={locale} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Filters feel live: the result count updates with every filter change */}
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-grey/80">
              {t(locale, "explore.resultCount", {
                n: filtered.length,
                total: items.length,
              })}
            </p>
            {view === "grid" ? (
              /* key={view}: rows <-> wall remounts the whole list and
                 replays the stagger entrance; filter changes keep the
                 container and don't replay (same call as the feed). */
              <div key={view} className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((i) => (
                  <ArticleGridCard key={i.slug} item={i} locale={locale} />
                ))}
              </div>
            ) : (
              <div key={view} className="stagger-in space-y-4">
                {filtered.map((i) => (
                  <ArticleRowCard key={i.slug} item={i} locale={locale} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
