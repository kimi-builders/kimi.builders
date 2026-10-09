/* Explore — the destination page. Craft-style landing + Claude-style
   catalog in one route: the hero carries the manifesto, the shelf
   search (?q=), and the real count line; landing sections (start here,
   path shelves, the monthly band, chapter entries) render only on the
   unfiltered view; the catalog (content-shape tabs + chapter seg +
   lens dropdowns + grid/rows) always does and honors every param.
   Filtering rules are unchanged: content-gated lenses via
   availableExploreFilters, chapters comparable at >=2, filtered URLs
   (?chapter/?product/?role/?tag/?year/?type/?q) are noindex, combined
   empty states offer "clear filters + latest content". */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
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
  isExploreListType,
  listExploreItems,
  resolveStarters,
  searchExploreItems,
  seriesShelves,
  typeCounts,
  type ExploreListType,
} from "@/src/lib/explore";
import { KB_CHAPTERS, findKbChapter, isKbChapterId } from "@/src/lib/kb-chapters";
import { findKbProduct, isKbProductId } from "@/src/lib/kb-products";
import { KB_ROLES, isKbRoleId } from "@/src/lib/kb-roles";
import {
  availableExploreFilters,
  type ExploreFilterKey,
} from "@/src/lib/explore-filters";
import { canModerate } from "@/src/lib/featured";
import { monthLabel } from "@/src/lib/format";
import { UPCOMING } from "@/src/lib/upcoming";
import { getWorksView, isMobileRequest } from "@/src/lib/works-view-server";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import SoonPanel from "../_components/SoonPanel";
import WorksFilterBar from "../works/_components/WorksFilterBar";
import WorksViewToggle from "../works/_components/WorksViewToggle";
import ArticleGridCard from "./_components/ArticleGridCard";
import ArticleRowCard from "./_components/ArticleRowCard";
import ExploreSearch from "./_components/ExploreSearch";
import SeriesGridCard from "./_components/SeriesGridCard";
import { ChapterKeys } from "./_components/ExploreKeys";
import {
  SEG_ITEM_FLOW,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP_FLOW,
} from "@/components/seg-classes";

/* Single-select filter toggling (click again to clear): every other
   param survives, including q and type. */
function lensHref(
  basePath: string,
  current: Record<string, string | undefined>,
  change: Record<string, string | undefined>,
): string {
  const merged = { ...current, ...change };
  const params = new URLSearchParams();
  for (const key of ["chapter", "product", "role", "tag", "year", "type", "q"]) {
    const v = merged[key];
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/* Landing section shell: eyebrow over a hairline, shared by every
   curated block so the page keeps one section rhythm. */
function SectionHead({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
      <p className="kb-eyebrow">{label}</p>
      {aside}
    </div>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const locale = await getLocale();
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  /* Filtered URLs (chapter included, plus the type tab and the search
     query) are noindex (no crawl traps); the default view is indexable. */
  const filtered =
    first(sp.chapter) ||
    first(sp.product) ||
    first(sp.role) ||
    first(sp.tag) ||
    first(sp.year) ||
    first(sp.type) ||
    first(sp.q);
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

  const items = await listExploreItems(locale);
  const chapterCounts = countByChapter(items);
  const activeChapters = KB_CHAPTERS.filter(
    (chapter) => (chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0) > 0,
  );
  const chapterFilterVisible = activeChapters.length >= 2;
  const productCounts = countByProduct(items);
  const roleCounts = countByRoles(items);
  const tagCounts = countTags(items);
  const archiveGroups = groupByArchive(items);
  const tc = typeCounts(items);
  const shelves = seriesShelves(items);
  const starters = resolveStarters(items);
  const letters = items.filter((i) => i.kind === "letter");

  /* The one availability judgment (explore-filters.ts): toolbar
     dropdowns, rail links, and the URL channel below all honor the same
     set — a param for a lens without content is ignored, never
     filtered on silently. */
  const available = availableExploreFilters({
    product: productCounts.length,
    role: roleCounts.length,
    tag: tagCounts.length,
    year: archiveGroups.length,
  });
  const lensAvailable = (key: ExploreFilterKey) => available.includes(key);

  /* Chapter/lens/type allowlist validation (invalid = unselected); a
     lens param counts only when the lens is available, a type only when
     content fills it — availability, not the raw URL, decides. */
  const requestedChapter = (() => {
    const v = first(sp.chapter);
    return v && isKbChapterId(v) ? v : undefined;
  })();
  const selProduct = (() => {
    const v = first(sp.product);
    return lensAvailable("product") && v && isKbProductId(v) ? v : undefined;
  })();
  const selRole = (() => {
    const v = first(sp.role);
    return lensAvailable("role") && v && isKbRoleId(v) ? v : undefined;
  })();
  const selTag = lensAvailable("tag") ? first(sp.tag) || undefined : undefined;
  const selYear = lensAvailable("year") ? first(sp.year) || undefined : undefined;
  const rawType = first(sp.type);
  const selType: ExploreListType | undefined = (() => {
    if (!isExploreListType(rawType)) return undefined;
    if (rawType === "paths") return tc.paths > 0 ? rawType : undefined;
    if (rawType === "practices") return tc.practices > 0 ? rawType : undefined;
    return tc.letters > 0 ? rawType : undefined;
  })();
  const rawQ = first(sp.q)?.trim();
  const selQ = rawQ || undefined;

  const selChapter =
    chapterFilterVisible && activeChapters.some((chapter) => chapter.id === requestedChapter)
      ? requestedChapter
      : undefined;
  const anyFilter = !!(selChapter || selProduct || selRole || selTag || selYear || selType || selQ);

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
    type: selType,
  };
  const matched = anyFilter
    ? searchExploreItems(filterExploreItems(items, sel), selQ ?? "")
    : items;

  const current: Record<string, string | undefined> = {
    chapter: selChapter,
    product: selProduct,
    role: selRole,
    tag: selTag,
    year: selYear,
    type: selType,
    q: selQ,
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
    if (selType) params.set("type", selType);
    if (selQ) params.set("q", selQ);
    return params.toString();
  })();
  const searchBaseQuery = (() => {
    const params = new URLSearchParams(preservedQuery);
    for (const key of ["product", "role", "tag", "year"] as const) {
      const v = current[key];
      if (v) params.set(key, v);
    }
    return params.toString();
  })();

  /* Content-shape tabs (Claude-catalog grammar): a type with content
     gets its tab; the seg renders only when two types are comparable. */
  const typeEntries: { id: string | undefined; label: string; count: number }[] = [
    { id: undefined, label: t(locale, "explore.typeAll"), count: items.length },
    ...(tc.paths > 0
      ? [{ id: "paths", label: t(locale, "explore.typePaths"), count: tc.paths }]
      : []),
    ...(tc.practices > 0
      ? [{ id: "practices", label: t(locale, "explore.typePractices"), count: tc.practices }]
      : []),
    ...(tc.letters > 0
      ? [{ id: "letters", label: t(locale, "explore.typeLetters"), count: tc.letters }]
      : []),
  ];
  const typeSegVisible = typeEntries.length - 1 >= 2;

  /* Filters appear per the one availability judgment: a lens with
     content gets its dropdown, an empty one takes no slot — identical
     to what the URL channel honors and the rails link into. */
  const filterSpecs = [
    ...(lensAvailable("product")
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
    ...(lensAvailable("role")
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
    ...(lensAvailable("tag")
      ? [{
          key: "tag",
          label: zh ? "标签" : "Tag",
          options: tagCounts.map((tg) => ({ value: tg.value, label: `#${tg.value} (${tg.count})` })),
          single: true,
        }]
      : []),
    ...(lensAvailable("year")
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

  /* Card list renderer shared by every catalog state. */
  const listBody = (list: typeof items) =>
    view === "grid" ? (
      <div key={view} className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i) => (
          <ArticleGridCard key={i.slug} item={i} locale={locale} />
        ))}
      </div>
    ) : (
      <div key={view} className="stagger-in space-y-4">
        {list.map((i) => (
          <ArticleRowCard key={i.slug} item={i} locale={locale} />
        ))}
      </div>
    );

  const latestLetter = letters[0];
  const countLine = t(locale, "explore.countLine", {
    practices: items.filter((item) => item.kind === "guide").length,
    paths: shelves.length,
    letters: tc.letters,
  });

  return (
    <div>
      {/* <-/-> chapter cycling (keyboard shortcuts; the component no-ops internally when hrefs < 2) */}
      <ChapterKeys hrefs={chapterHrefs} index={chapterIndex} />
      <PageHeader
        eyebrow={t(locale, "explore.eyebrow")}
        title={t(locale, "nav.explore")}
        lede={t(locale, "explore.manifesto")}
        meta={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <ExploreSearch key={selQ ?? ""} q={selQ} baseQuery={searchBaseQuery} locale={locale} />
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-grey/80">
              {countLine}
            </p>
            {!anyFilter && items.length > 0 && (
              <a href="#explore-catalog" className="inline-flex min-h-11 items-center font-mono text-xs text-ui-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-blue">
                {t(locale, "explore.browseAll")}
              </a>
            )}
          </div>
        }
        actions={user && canModerate(user.role) ? composeLink : undefined}
      />

      {items.length === 0 ? (
        /* The cold-start state describes the content contract. */
        <div className="mt-10">
          <EmptyState
            message={
              zh
                ? "第一篇 Builder 实践正在筹备,发布时会附方法、证据与出处。"
                : "The first Builder practice is being prepared with its method, evidence, and sources."
            }
            actions={user && canModerate(user.role) ? composeLink : undefined}
          />
        </div>
      ) : (
        <>
          {/* ---- Curated landing (unfiltered view only): the editorial
               voice sits above the catalog; any filter drops straight
               into the catalog below. ---- */}
          {!anyFilter && starters.length > 0 && (
            <section className="mt-12">
              <SectionHead label={t(locale, "explore.startHere")} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {starters.map((i) => (
                  <ArticleGridCard key={i.slug} item={i} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {!anyFilter && shelves.length > 0 && (
            <section className="mt-12">
              <SectionHead label={t(locale, "explore.paths")} />
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {shelves.map(({ series, episodes }) => (
                  <SeriesGridCard key={series.slug} series={series} episodes={episodes} zh={zh} />
                ))}
              </div>
            </section>
          )}

          {!anyFilter && latestLetter && (
            <section className="mt-12">
              <SectionHead label={t(locale, "explore.monthly")} />
              <div className="mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                {/* The OG poster doubles as the issue cover (one asset,
                   two duties — the poster pipeline is the only cover
                   source letters have). */}
                <Link
                  href={`/explore/${latestLetter.slug}`}
                  className="group block w-full max-w-[240px] justify-self-start self-start overflow-hidden rounded-2xl border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-blue lg:max-w-none"
                  aria-label={latestLetter.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/share/letter/${latestLetter.slug}?locale=${locale}`}
                    alt=""
                    className="aspect-[3/4] w-full object-contain"
                  />
                </Link>
                <div className="flex min-w-0 flex-col">
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-grey">
                    {t(locale, "explore.kindLetter")} · {monthLabel(latestLetter.publishedAt)}
                  </p>
                  <h2 className="kb-h2 mt-2 transition-colors hover:text-ui-blue">
                    <Link href={`/explore/${latestLetter.slug}`}>{latestLetter.title}</Link>
                  </h2>
                  {latestLetter.summary && (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
                      {latestLetter.summary}
                    </p>
                  )}
                  <p className="mt-4">
                    <Link
                      href={`/explore/${latestLetter.slug}`}
                      className="font-mono text-xs text-ui-blue transition-opacity hover:opacity-80"
                    >
                      {t(locale, "explore.enterIssue")}
                    </Link>
                  </p>
                  {letters.length > 1 && (
                    <div className="mt-auto border-t border-line pt-4">
                      <p className="kb-eyebrow">{t(locale, "explore.pastIssues")}</p>
                      <ul className="mt-3 space-y-2">
                        {letters.slice(1).map((i) => (
                          <li key={i.slug}>
                            <Link
                              href={`/explore/${i.slug}`}
                              className="group flex items-baseline gap-3 text-sm text-paper transition-colors hover:text-ui-blue"
                            >
                              <span className="font-mono text-[11px] text-grey">
                                {monthLabel(i.publishedAt)}
                              </span>
                              <span className="min-w-0 truncate">{i.title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {!anyFilter && activeChapters.length > 0 && (
            <section className="mt-12">
              <SectionHead label={t(locale, "explore.byChapter")} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {activeChapters.map((chapter) => {
                  const count = chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0;
                  return (
                    <Link
                      key={chapter.id}
                      href={`/explore?chapter=${chapter.id}`}
                      className="group rounded-2xl border border-line bg-card p-5 transition-[border-color,translate] duration-base ease-standard hover:-translate-y-0.5 hover:border-paper/30"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-human text-4xl leading-none text-paper transition-colors group-hover:text-ui-blue">
                          {zh ? chapter.zh : chapter.en}
                        </span>
                        <span className="font-mono text-[11px] text-grey">{count}</span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-grey">
                        {zh ? chapter.tagline.zh : chapter.tagline.en}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---- Catalog: content-shape tabs + chapter seg + lens
               dropdowns + grid/rows; honors every param. ---- */}
          <section id="explore-catalog" className="mt-12 scroll-mt-24">
            <SectionHead
              label={t(locale, "explore.allContent")}
              aside={items.length > 0 && !mobile ? <WorksViewToggle locale={locale} view={view} /> : undefined}
            />

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {typeSegVisible && (
                <nav
                  aria-label={zh ? "内容形态" : "Content types"}
                  className={`${SEG_WRAP_FLOW} max-sm:w-full`}
                >
                  {typeEntries.map((entry) => {
                    const active =
                      entry.id === undefined ? !selType : selType === entry.id;
                    return (
                      <Link
                        key={entry.label}
                        href={lensHref("/explore", current, {
                          type: entry.id === undefined || selType === entry.id ? undefined : entry.id,
                        })}
                        scroll={false}
                        aria-current={active ? "page" : undefined}
                        className={`${SEG_ITEM_FLOW} ${active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
                      >
                        {entry.label}
                        <span className="ml-1 opacity-60">{entry.count}</span>
                      </Link>
                    );
                  })}
                </nav>
              )}
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
                    {zh ? "全部" : "All"}
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
            </div>

            {/* ---- Chapter banner: selecting a chapter gives the spine a
                 moment of ceremony — serif chapter word (same face as the
                 cover's chapter tile) + definition line; the flat list is
                 never regrouped ---- */}
            {selChapter &&
              (() => {
                const c = findKbChapter(selChapter)!;
                return (
                  <div className="mt-6 flex items-center gap-4 border-b border-line pb-4">
                    <span
                      aria-hidden="true"
                      className="font-human text-5xl leading-none text-paper"
                    >
                      {zh ? c.zh : c.en}
                    </span>
                    <p className="min-w-0 text-sm leading-relaxed text-grey">
                      {zh ? c.tagline.zh : c.tagline.en}
                    </p>
                  </div>
                );
              })()}

            <div className="mt-6">
              {matched.length === 0 ? (
                /* Combined empty state: clear-all + latest content — no
                   dead ends. */
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
                    <SectionHead label={t(locale, "explore.latest")} />
                    <div className="mt-4 space-y-4">
                      {items.slice(0, 3).map((i) => (
                        <ArticleRowCard key={i.slug} item={i} locale={locale} />
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  {anyFilter && (
                    /* Filters feel live: the result count updates with every
                       filter change */
                    <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-grey/80">
                      {t(locale, "explore.resultCount", {
                        n: matched.length,
                        total: items.length,
                      })}
                    </p>
                  )}
                  {/* key={view}: rows <-> wall remounts the whole list and
                     replays the stagger entrance; filter changes keep the
                     container and don't replay (same call as the feed). */}
                  {listBody(matched)}
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
