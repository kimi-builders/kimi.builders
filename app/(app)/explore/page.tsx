/* Explore · the chapter-axis flat list. Mission: exploring the optimal
   conversion from intelligence to creativity (mirroring the official
   "Seeking the optimal conversion from energy to intelligence").
   Cold-start shape: one horizontal card per piece of content (cover
   left, content right, the WorkCard row grammar) — no series/tutorial
   scaffolding; the series mechanism stays in the data layer until
   content grows into it. The chapter seg (learn/build/measure/
   establish) is the spine; zero-count chapters grey out but stay
   visible. Products/roles/tags/archive are single-select dropdowns —
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
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
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
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  /* Filtered combo URLs (chapter included) are noindex (no crawl traps);
     the default view is indexable. */
  const filtered =
    first(sp.chapter) || first(sp.product) || first(sp.role) || first(sp.tag) || first(sp.year);
  return {
    title: "探索 — kimi.builders",
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
  const selChapter = (() => {
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
  const anyFilter = !!(selChapter || selProduct || selRole || selTag || selYear);

  const items = await listExploreItems(locale);
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

  /* Chapter counts (for the seg; all four always show, zero-count grey
     out). */
  const chapterCounts = countByChapter(items);

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
  const activeChapters = KB_CHAPTERS.filter(
    (c) => (chapterCounts.find((x) => x.value === c.id)?.count ?? 0) > 0,
  );
  const chapterHrefs = [
    lensHref("/explore", current, { chapter: undefined }),
    ...activeChapters.map((c) => lensHref("/explore", current, { chapter: c.id })),
  ];
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
      {/* ←→ 章循环(快捷键;hrefs<2 时组件内自行空转) */}
      <ChapterKeys hrefs={chapterHrefs} index={chapterIndex} />
      <PageHeader
        eyebrow={t(locale, "explore.eyebrow")}
        title={t(locale, "nav.explore")}
        lede={t(locale, "explore.lede")}
        actions={user && canModerate(user.role) ? composeLink : undefined}
      />

      {/* ---- 工具行:章 seg(主轴)+ 透镜下拉(有内容才出) ---- */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <nav
          aria-label={zh ? "章" : "Chapters"}
          className={`${SEG_WRAP} max-sm:w-full max-sm:flex-wrap`}
        >
          {/* 全部 = 默认态(不筛章);四章是永久框架,0 计数置灰恒可见 */}
          <Link
            href={lensHref("/explore", current, { chapter: undefined })}
            scroll={false}
            aria-current={!selChapter ? "page" : undefined}
            className={`${SEG_ITEM} ${!selChapter ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
          >
            {/* 计数走 ml-1 显式间距:SEG_ITEM 是 inline-flex,元素间的
                JSX 空格文本节点会被 flex 吞掉(字与数粘连,20260822 修复) */}
            {zh ? "全部" : "All"} <span className="ml-1 opacity-60">{items.length}</span>
          </Link>
          {KB_CHAPTERS.map((c) => {
            const count = chapterCounts.find((x) => x.value === c.id)?.count ?? 0;
            const label = (
              <>
                {zh ? c.zh : c.en} <span className="ml-1 opacity-60">{count}</span>
              </>
            );
            if (count === 0) {
              /* Greyed, not hidden: the four chapters are a permanent
                 frame and an empty chapter is a promise — hover shows the
                 call for submissions (data-tip with a 250ms delay, never
                 native title). */
              return (
                <span
                  key={c.id}
                  aria-disabled="true"
                  data-tip={t(locale, "explore.chapterCall", {
                    tagline: zh ? c.tagline.zh : c.tagline.en,
                  })}
                  className={`${SEG_ITEM} cursor-default text-grey/40`}
                >
                  {label}
                </span>
              );
            }
            return (
              <Link
                key={c.id}
                href={lensHref("/explore", current, {
                  chapter: selChapter === c.id ? undefined : c.id,
                })}
                scroll={false}
                aria-current={selChapter === c.id ? "page" : undefined}
                className={`${SEG_ITEM} ${selChapter === c.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
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

      {/* ---- 章横幅(20260821 评审):选中章时给主轴一次仪式感——serif
           章字(与封面章字砖同一字族)+ 定义句;不重组扁平列表 ---- */}
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

      {/* ---- 内容区:一篇一卡,行式 / 封面墙 ---- */}
      <div className="mt-6">
        {items.length === 0 ? (
          /* An honest empty state for the cold start. */
          <EmptyState
            message={
              zh
                ? "这里的第一篇内容,以「做完你拥有什么」为标准在筹备。"
                : "The first piece is being prepared — measured by what you walk away with."
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
            {/* 筛选生效感(20260821 评审):结果计数随筛选即时更新 */}
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
