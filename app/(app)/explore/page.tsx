/* 探索(Explore)· 四维浏览器(20260821 月刊 × 教程合并;同日视图语言对齐
   站内作品/Awesome:四维顶级 tabs(分段控件)+ 当前维度的筛选下拉
   (WorksFilterBar 同款,URL 驱动)+ 系列封面卡(作品网格卡语法)。
   四个维度:分类(kind)/ 系列(注册表)/ 标签(payload.tags)/ 时间(归档),
   全部由已发布内容算出(articles 两 kind 合集,src/lib/explore.ts 纯函数聚合),
   系列标题等元信息是注册表策展,0 集系列不上架。
   ?view=categories|series|tags|archives 切换 + 各维选中参数(?category/?series/?tag/?year)。
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
  groupByArchive,
  listExploreItems,
  type ExploreItem,
} from "@/src/lib/explore";
import { findLearnSeries } from "@/src/lib/learn-series";
import { UPCOMING } from "@/src/lib/upcoming";
import { getWorksView } from "@/src/lib/works-view-server";
import PageHeader from "@/components/PageHeader";
import SoonPanel from "../_components/SoonPanel";
import WorksFilterBar from "../works/_components/WorksFilterBar";
import WorksViewToggle from "../works/_components/WorksViewToggle";
import SeriesGridCard from "./_components/SeriesGridCard";
import SeriesRowCard from "./_components/SeriesRowCard";
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

function exploreHref(view: View): string {
  return view === "categories" ? "/explore" : `/explore?view=${view}`;
}

/* 结果列表行:eyebrow(分类 · 系列 · 日期)+ 标题 + 摘要 + 标签 */
function ItemRow({ item, zh, locale }: { item: ExploreItem; zh: boolean; locale: Locale }) {
  const series = item.series ? findLearnSeries(item.series) : undefined;
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

function ItemList({ items, zh, locale }: { items: ExploreItem[]; zh: boolean; locale: Locale }) {
  if (items.length === 0) {
    return (
      <p className="border-y border-line py-8 text-sm leading-relaxed text-grey">
        {zh ? "这个维度下还没有内容。" : "Nothing under this filter yet."}
      </p>
    );
  }
  return (
    <div>
      {items.map((i) => (
        <ItemRow key={i.slug} item={i} zh={zh} locale={locale} />
      ))}
    </div>
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
  const selSeries = first(sp.series);
  const selTag = first(sp.tag);
  const selYear = first(sp.year);

  const items = await listExploreItems(locale);
  /* 系列视图的行式/网格:与作品墙同一 cookie 偏好(kb-works-view) */
  const seriesView = await getWorksView();
  const kindCounts = countByKind(items);
  const seriesCounts = countSeries(items);
  const tagCounts = countTags(items);
  const archiveGroups = groupByArchive(items);

  /* 四维 tab 计数 = 各维不同值的数量 */
  const viewTabs: { view: View; zh: string; en: string; count: number }[] = [
    { view: "categories", zh: "分类", en: "Categories", count: kindCounts.length },
    { view: "series", zh: "系列", en: "Series", count: seriesCounts.length },
    { view: "tags", zh: "标签", en: "Tags", count: tagCounts.length },
    { view: "archives", zh: "归档", en: "Archives", count: archiveGroups.length },
  ];

  /* 当前维度的筛选器(作品/Awesome 同款单选下拉;空集 = 参数缺席 = 不限) */
  const filterSpecs = {
    categories: {
      key: "category",
      label: zh ? "分类" : "Category",
      options: kindCounts.map((c) => ({
        value: c.value,
        label: `${categoryLabelOf(c.value, zh)} (${c.count})`,
      })),
      single: true,
    },
    series: {
      key: "series",
      label: zh ? "系列" : "Series",
      options: seriesCounts.map((c) => {
        const s = findLearnSeries(c.slug);
        return {
          value: c.slug,
          label: `${s ? (zh ? s.title.zh : s.title.en) : c.slug} (${c.count})`,
        };
      }),
      single: true,
    },
    tags: {
      key: "tag",
      label: zh ? "标签" : "Tag",
      options: tagCounts.map((tg) => ({ value: tg.value, label: `#${tg.value} (${tg.count})` })),
      single: true,
    },
    archives: {
      key: "year",
      label: zh ? "归档" : "Year",
      options: archiveGroups.map((g) => ({
        value: g.year,
        label: `${g.year} (${g.months.reduce((n, m) => n + m.items.length, 0)})`,
      })),
      single: true,
    },
  } as const;

  const filtered = items.filter((i) => {
    if (view === "categories" && selCategory && i.kind !== selCategory) return false;
    if (view === "series" && selSeries && i.series !== selSeries) return false;
    if (view === "tags" && selTag && !i.tags.includes(selTag)) return false;
    if (view === "archives" && selYear && String(i.publishedAt.getUTCFullYear()) !== selYear) return false;
    return true;
  });

  /* 选中某系列时,该系列的集列表;否则系列视图 = 封面卡网格 */
  const selSeriesMeta = selSeries ? findLearnSeries(selSeries) : undefined;

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

      {/* 工具行(与作品/Awesome 同一结构):维度 seg + 当前维度筛选下拉同一行,
          选中项 chip 行在下一行(WorksFilterBar 内部生长);系列视图多出
          行式/网格切换(与作品墙同一 cookie 偏好) */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <nav
          aria-label={zh ? "浏览维度" : "Browse dimensions"}
          className={`${SEG_WRAP} max-sm:w-full max-sm:flex-wrap`}
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
        <WorksFilterBar
          basePath="/explore"
          preservedQuery={view === "categories" ? "" : `view=${view}`}
          locale={locale}
          filters={[filterSpecs[view]]}
          selected={{
            categories: { category: selCategory ? [selCategory] : [] },
            series: { series: selSeries ? [selSeries] : [] },
            tags: { tag: selTag ? [selTag] : [] },
            archives: { year: selYear ? [selYear] : [] },
          }[view]}
        />
        {view === "series" && !selSeries && (
          <WorksViewToggle locale={locale} view={seriesView} />
        )}
      </div>

      {/* 内容区 */}
      <div className="mt-6">
        {view === "series" && !selSeries ? (
          /* 系列:行式/网格随作品墙同一偏好(getWorksView cookie) */
          seriesCounts.length === 0 ? (
            <p className="border-y border-line py-8 text-sm leading-relaxed text-grey">
              {zh ? "还没有系列上架。" : "No series yet."}
            </p>
          ) : seriesView === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {seriesCounts.map((c) => {
                const s = findLearnSeries(c.slug)!;
                const list = items.filter((i) => i.series === c.slug);
                return (
                  <SeriesGridCard key={c.slug} series={s} episodes={list} zh={zh} />
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {seriesCounts.map((c) => {
                const s = findLearnSeries(c.slug)!;
                const list = items.filter((i) => i.series === c.slug);
                return (
                  <SeriesRowCard key={c.slug} series={s} episodes={list} zh={zh} />
                );
              })}
            </div>
          )
        ) : view === "series" && selSeriesMeta ? (
          /* 选中系列:该系列的集列表 + 进系列页入口 */
          <>
            <p className="kb-eyebrow flex items-center justify-between border-b border-line pb-4">
              <span>
                {selSeriesMeta.code} · {filtered.length} {zh ? "集" : "episodes"}
              </span>
              <Link
                href={`/explore/series/${selSeriesMeta.slug}`}
                className="text-ui-blue transition-opacity hover:opacity-80"
              >
                {zh ? "进系列页 →" : "Open series →"}
              </Link>
            </p>
            <ItemList items={filtered} zh={zh} locale={locale} />
          </>
        ) : view === "archives" && !selYear ? (
          /* 归档总览:年分组(年 eyebrow + 条目) */
          archiveGroups.map((g) => (
            <div key={g.year} className="mt-2 first:mt-0">
              <p className="kb-eyebrow border-b border-line py-4">
                {g.year} · {g.months.reduce((n, m) => n + m.items.length, 0)} {zh ? "篇" : "posts"}
              </p>
              {g.months.map((m) => (
                <ItemList key={m.month} items={m.items} zh={zh} locale={locale} />
              ))}
            </div>
          ))
        ) : (
          <ItemList items={filtered} zh={zh} locale={locale} />
        )}
      </div>

      {/* 纪律一行(原月刊 charter 收编) */}
      <p className="mt-12 border-t border-line pt-6 text-[11px] leading-relaxed text-grey/80">
        {zh
          ? "组装制:事实与定夺从真实数据汇编 · 署名到人:AI 参与必须披露 · 评鉴手写:选读与点评由编辑写,不外包给算法。"
          : "Assembled from real data · signed by named humans (AI disclosed) · hand-picked by editors, never delegated to an algorithm."}
      </p>
    </div>
  );
}
