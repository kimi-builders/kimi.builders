/* 探索(Explore)· 四维浏览器(20260821 月刊 × 教程合并)
   四个维度:分类(kind)/ 系列(注册表)/ 标签(payload.tags)/ 时间(归档),
   ?view=categories|series|tags|archives 切换 + 各维选中参数(?category/?tag/?year;
   系列选中直接进系列页 /explore/series/<slug>)。
   数据 = articles 两 kind 合集(src/lib/explore.ts,纯函数聚合)。
   板块开关未就绪时整页换「正在路上」。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { monthLabel } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  categoryLabelOf,
  countByKind,
  countSeries,
  countTags,
  filterExploreItems,
  groupByArchive,
  listExploreItems,
  type ExploreItem,
} from "@/src/lib/explore";
import { LEARN_SERIES } from "@/src/lib/learn-series";
import { UPCOMING } from "@/src/lib/upcoming";
import PageHeader from "@/components/PageHeader";
import SoonPanel from "../_components/SoonPanel";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

export const metadata: Metadata = { title: "探索 — kimi.builders" };

type View = "categories" | "series" | "tags" | "archives";

function normalizeView(raw: string | undefined): View {
  return raw === "series" || raw === "tags" || raw === "archives" ? raw : "categories";
}

function exploreHref(view: View, extra: Record<string, string | null> = {}): string {
  const params = new URLSearchParams();
  if (view !== "categories") params.set("view", view);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

/* 结果列表行:eyebrow(分类 · 系列 · 日期)+ 标题 + 摘要 + 标签 */
function ItemRow({ item, zh, locale }: { item: ExploreItem; zh: boolean; locale: Locale }) {
  const series = item.series
    ? LEARN_SERIES.find((s) => s.slug === item.series)
    : undefined;
  return (
    <article className="border-b border-line last:border-b-0">
      <Link href={`/explore/${item.slug}`} className="group flex gap-4 py-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-grey">
            <span>{categoryLabelOf(item.kind, zh)}</span>
            {series && <span>· {series.code}</span>}
            <span>· {monthLabel(item.publishedAt)}</span>
            {item.fallback && (
              <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
                {t(locale, item.locale === "zh" ? "art.langZh" : "art.langEn")}
              </span>
            )}
          </p>
          <h3 className="kb-h3 mt-2 transition-colors group-hover:text-ui-blue">
            {item.title}
          </h3>
          {item.summary && (
            <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm leading-relaxed text-grey">
              {item.summary}
            </p>
          )}
          {item.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-grey/80">
              {item.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </p>
          )}
        </div>
        <ArrowRight
          size={15}
          aria-hidden="true"
          className="mt-1 shrink-0 text-grey/50 transition-colors group-hover:text-ui-blue"
        />
      </Link>
    </article>
  );
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
  const view = normalizeView(first(sp.view));
  const selCategory = first(sp.category);
  const selTag = first(sp.tag);
  const selYear = first(sp.year);

  const items = await listExploreItems(locale);
  const kindCounts = countByKind(items);
  const seriesCounts = countSeries(items);
  const tagCounts = countTags(items);
  const archiveGroups = groupByArchive(items);

  /* 四维 tab 计数 = 各维不同值的数量(website 同口径) */
  const viewTabs: { view: View; zh: string; en: string; count: number }[] = [
    { view: "categories", zh: "分类", en: "Categories", count: kindCounts.length },
    { view: "series", zh: "系列", en: "Series", count: seriesCounts.length },
    { view: "tags", zh: "标签", en: "Tags", count: tagCounts.length },
    { view: "archives", zh: "归档", en: "Archives", count: archiveGroups.length },
  ];

  /* 选中后的结果列表(分类/标签/年) */
  const filtered = filterExploreItems(items, {
    category: selCategory === "letter" || selCategory === "guide" ? selCategory : undefined,
    tag: selTag,
    year: selYear,
  });

  return (
    <div>
      <PageHeader
        eyebrow={`— ${zh ? "探索" : "EXPLORE"}`}
        title={
          <>
            {zh ? "沿分类、系列、标签和时间回到内容" : "Back to content by category, series, tag, and time"}
            <span className="text-ui-blue">.</span>
          </>
        }
        lede={
          zh
            ? "月刊评鉴与教程是同一架上的文章——四维都是入口。"
            : "The monthly review and the tutorials live on the same shelf — four ways in."
        }
      />

      {/* 维度切换(链接式 tabs,计数随行) */}
      <nav
        aria-label={zh ? "浏览维度" : "Browse dimensions"}
        className={`${SEG_WRAP} mt-8 max-sm:w-full max-sm:flex-wrap`}
      >
        {viewTabs.map((v) => (
          <Link
            key={v.view}
            href={exploreHref(v.view)}
            scroll={false}
            aria-current={view === v.view ? "page" : undefined}
            className={`${SEG_ITEM} ${view === v.view ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
          >
            {zh ? v.zh : v.en} <span className="opacity-60">{v.count}</span>
          </Link>
        ))}
      </nav>

      {/* 分类:目录行;选中 → 结果列表 */}
      {view === "categories" && (
        <section className="mt-8">
          {!selCategory ? (
            kindCounts.map((c) => {
              const sample = filterExploreItems(items, {
                category: c.value,
              })[0];
              return (
                <Link
                  key={c.value}
                  href={exploreHref("categories", { category: c.value })}
                  className="group flex items-baseline gap-4 border-b border-line py-6 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="kb-h3 transition-colors group-hover:text-ui-blue">
                      {categoryLabelOf(c.value, zh)}
                    </span>
                    {sample && (
                      <span className="mt-1 block truncate text-sm text-grey">
                        {zh ? "最新:" : "Latest: "}
                        {sample.title}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-2xl font-semibold text-grey/60 transition-colors group-hover:text-ui-blue">
                    {c.count}
                  </span>
                </Link>
              );
            })
          ) : (
            <>
              <p className="kb-eyebrow border-b border-line pb-4">
                {categoryLabelOf(selCategory === "letter" ? "letter" : "guide", zh)} · {filtered.length}
              </p>
              {filtered.map((i) => (
                <ItemRow key={i.slug} item={i} zh={zh} locale={locale} />
              ))}
            </>
          )}
        </section>
      )}

      {/* 系列:注册表目录行 → 系列页 */}
      {view === "series" && (
        <section className="mt-8">
          {seriesCounts.length === 0 ? (
            <p className="border-y border-line py-8 text-sm leading-relaxed text-grey">
              {zh ? "还没有系列上架。" : "No series yet."}
            </p>
          ) : (
            seriesCounts.map((c) => {
              const s = LEARN_SERIES.find((x) => x.slug === c.slug)!;
              return (
                <Link
                  key={c.slug}
                  href={`/explore/series/${c.slug}`}
                  className="group flex items-baseline gap-4 border-b border-line py-6 last:border-b-0"
                >
                  <span className="shrink-0 font-mono text-[11px] text-ui-blue">{s.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="kb-h3 transition-colors group-hover:text-ui-blue">
                      {zh ? s.title.zh : s.title.en}
                    </span>
                    <span className="mt-1 line-clamp-1 block text-sm text-grey">
                      {zh ? s.summary.zh : s.summary.en}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-2xl font-semibold text-grey/60 transition-colors group-hover:text-ui-blue">
                    {c.count}
                  </span>
                </Link>
              );
            })
          )}
        </section>
      )}

      {/* 标签:chips 云;选中 → 结果列表 */}
      {view === "tags" && (
        <section className="mt-8">
          {tagCounts.length === 0 ? (
            <p className="border-y border-line py-8 text-sm leading-relaxed text-grey">
              {zh ? "还没有标签。" : "No tags yet."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tagCounts.map((tg) => (
                <Link
                  key={tg.value}
                  href={exploreHref("tags", { tag: tg.value === selTag ? null : tg.value })}
                  scroll={false}
                  aria-current={selTag === tg.value ? "page" : undefined}
                  className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-blue ${
                    selTag === tg.value
                      ? "border-paper bg-paper text-bg font-medium"
                      : "border-line text-grey hover:border-ui-blue/60 hover:text-ui-blue"
                  }`}
                >
                  #{tg.value} <span className="opacity-60">{tg.count}</span>
                </Link>
              ))}
            </div>
          )}
          {selTag && (
            <div className="mt-6">
              {filtered.map((i) => (
                <ItemRow key={i.slug} item={i} zh={zh} locale={locale} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 归档:年 → 月 → 条目 */}
      {view === "archives" && (
        <section className="mt-8">
          <div className="flex flex-wrap gap-2">
            {archiveGroups.map((g) => (
              <Link
                key={g.year}
                href={exploreHref("archives", { year: g.year === selYear ? null : g.year })}
                scroll={false}
                aria-current={selYear === g.year ? "page" : undefined}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-blue ${
                  selYear === g.year
                    ? "border-paper bg-paper text-bg font-medium"
                    : "border-line text-grey hover:border-ui-blue/60 hover:text-ui-blue"
                }`}
              >
                {g.year}{" "}
                <span className="opacity-60">
                  {g.months.reduce((n, m) => n + m.items.length, 0)}
                </span>
              </Link>
            ))}
          </div>
          {archiveGroups
            .filter((g) => !selYear || g.year === selYear)
            .map((g) => (
              <div key={g.year} className="mt-8">
                <p className="kb-eyebrow border-b border-line pb-3">{g.year}</p>
                {g.months.map((m) => (
                  <div key={m.month} className="mt-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey/70">
                      {m.month}
                    </p>
                    {m.items.map((i) => (
                      <ItemRow key={i.slug} item={i} zh={zh} locale={locale} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
        </section>
      )}

      {/* 纪律一行(原月刊 charter 收编) */}
      <p className="mt-12 border-t border-line pt-6 text-[11px] leading-relaxed text-grey/80">
        {zh
          ? "组装制:事实与定夺从真实数据汇编 · 署名到人:AI 参与必须披露 · 评鉴手写:选读与点评由编辑写,不外包给算法。"
          : "Assembled from real data · signed by named humans (AI disclosed) · hand-picked by editors, never delegated to an algorithm."}
      </p>
    </div>
  );
}
