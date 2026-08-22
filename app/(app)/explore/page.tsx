/* 探索(Explore)· 货架 + 透镜(20260821 透镜改版):
   脊柱 = 系列货架(策展序列,验证戳/讨论/毕业归因挂在系列级);
   透镜 = 产品(kb-products)/职业(kb-roles)chips + 形态(read/video/deck)
   + 标签/年份下拉(WorksFilterBar);形态从 payload 与正文派生,不存储。
   交互纪律(NN/g 筛选共识):chips 单选、再点取消;计数随其余筛选动态
   更新,0 计数置灰不隐藏(上下文稳定);组合空态给「清除全部 + 最近内容」,
   不给死胡同;筛选组合 URL noindex(防组合爬陷),默认视图可索引。
   旧四维参数兼容:?view=/?category=/?series= 被忽略渲染默认视图,
   ?tag=/?year= 继续生效——外链不断内容。
   板块开关未就绪时整页换「正在路上」。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Play, Presentation } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { monthLabel } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  categoryLabelOf,
  countSeries,
  countTags,
  filterExploreItems,
  groupByArchive,
  listExploreItems,
  type ExploreItem,
  type GuideFormat,
} from "@/src/lib/explore";
import { KB_PRODUCTS, findKbProduct, isKbProductId } from "@/src/lib/kb-products";
import { KB_ROLES, isKbRoleId } from "@/src/lib/kb-roles";
import { findLearnSeries } from "@/src/lib/learn-series";
import { UPCOMING } from "@/src/lib/upcoming";
import { getWorksView } from "@/src/lib/works-view-server";
import EmptyState from "@/components/EmptyState";
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

const FORMAT_KEYS = ["read", "video", "deck"] as const satisfies readonly GuideFormat[];

function normalizeFormat(raw: string | undefined): GuideFormat | undefined {
  return FORMAT_KEYS.find((f) => f === raw);
}

/* 透镜/形态 chips 的单选切换(再点取消):其余参数原样保留 */
function lensHref(
  basePath: string,
  current: Record<string, string | undefined>,
  change: Record<string, string | undefined>,
): string {
  const merged = { ...current, ...change };
  const params = new URLSearchParams();
  for (const key of ["product", "role", "format", "tag", "year"]) {
    const v = merged[key];
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

const FORMAT_ICON = {
  read: FileText,
  video: Play,
  deck: Presentation,
} as const;

const FORMAT_LABEL_KEY = {
  read: "explore.formatRead",
  video: "explore.formatVideo",
  deck: "explore.formatDeck",
} as const;

/* 结果列表行:eyebrow(分类 · 系列码 · 产品 · 形态 · 日期)+ 标题 + 摘要 + 标签 */
function ItemRow({ item, zh, locale }: { item: ExploreItem; zh: boolean; locale: Locale }) {
  const series = item.series ? findLearnSeries(item.series) : undefined;
  const shownProducts = item.products.slice(0, 2);
  const overflowProducts = item.products.length - shownProducts.length;
  return (
    <article className="border-b border-line last:border-b-0">
      <Link href={`/explore/${item.slug}`} className="group flex gap-4 py-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-grey">
            <span>{categoryLabelOf(item.kind, zh)}</span>
            {series && <span>· {series.code}</span>}
            <span>· {monthLabel(item.publishedAt)}</span>
            {shownProducts.length > 0 && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal" aria-label={zh ? "产品" : "Products"}>
                {shownProducts.map((id) => {
                  const p = findKbProduct(id);
                  if (!p) return null;
                  const Icon = p.icon;
                  return (
                    <span key={id} title={zh ? p.zh : p.en} className="inline-flex items-center gap-0.5">
                      <Icon size={12} aria-hidden="true" />
                      <span className="hidden sm:inline">{zh ? p.zh : p.en}</span>
                    </span>
                  );
                })}
                {overflowProducts > 0 && <span>+{overflowProducts}</span>}
              </span>
            )}
            {item.formats.length > 0 && (
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal" aria-label={t(locale, "explore.format")}>
                {item.formats.map((f) => {
                  const Icon = FORMAT_ICON[f];
                  return (
                    <span
                      key={f}
                      title={t(locale, FORMAT_LABEL_KEY[f])}
                      className="inline-flex items-center"
                    >
                      <Icon size={12} aria-hidden="true" className="text-grey/70" />
                    </span>
                  );
                })}
              </span>
            )}
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
        {zh ? "这里还没有内容。" : "Nothing here yet."}
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

/* 透镜 chip:active = 蓝实底(与 solved pill 同语法);0 计数置灰不可点 */
function LensChip({
  href,
  active,
  disabled,
  count,
  children,
}: {
  href: string;
  active: boolean;
  disabled: boolean;
  count: number;
  children: React.ReactNode;
}) {
  const cls = `inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
    active
      ? "border-blue/60 bg-blue/10 font-semibold text-blue"
      : disabled
        ? "cursor-default border-line text-grey/40"
        : "border-line text-grey hover:border-ui-blue/50 hover:text-ui-blue"
  }`;
  if (disabled) {
    return (
      <span className={cls} aria-disabled="true">
        {children} <span className="opacity-60">{count}</span>
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} aria-pressed={active} className={cls}>
      {children} <span className="opacity-60">{count}</span>
    </Link>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  /* 筛选组合 URL 不索引(防组合爬陷);默认视图(货架)可索引 */
  const filtered =
    first(sp.product) || first(sp.role) || first(sp.format) || first(sp.tag) || first(sp.year);
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
  /* 旧四维参数(?view/?category/?series)忽略——渲染默认货架视图;
     ?tag/?year 继续生效,透镜参数白名单校验(非法值 = 未选) */
  const selProduct = (() => {
    const v = first(sp.product);
    return v && isKbProductId(v) ? v : undefined;
  })();
  const selRole = (() => {
    const v = first(sp.role);
    return v && isKbRoleId(v) ? v : undefined;
  })();
  const selFormat = normalizeFormat(first(sp.format));
  const selTag = first(sp.tag) || undefined;
  const selYear = first(sp.year) || undefined;
  const anyFilter = !!(selProduct || selRole || selFormat || selTag || selYear);

  const items = await listExploreItems(locale);
  /* 系列货架的行式/网格:与作品墙同一 cookie 偏好(kb-works-view) */
  const seriesView = await getWorksView();

  const sel = {
    product: selProduct,
    role: selRole,
    format: selFormat,
    tag: selTag,
    year: selYear,
  };
  const filtered = anyFilter
    ? filterExploreItems(items, sel)
    : items;

  /* 动态计数(NN/g):每一维的计数在「其余筛选生效」的结果集上算,
     组合下命中 0 的值置灰而非消失——上下文稳定,不玩捉迷藏 */
  const productScope = filterExploreItems(items, { ...sel, product: undefined });
  const productChipCount = (id: string) =>
    productScope.filter((i) => i.products.includes(id)).length;
  const roleScope = filterExploreItems(items, { ...sel, role: undefined });
  const roleChipCount = (id: string) =>
    roleScope.filter((i) => i.roles.includes(id)).length;
  /* 职业 chips 只出「全站有内容」的职业(词表序;空词不出 = 不撑空墙) */
  const roleIds = KB_ROLES.filter((r) => items.some((i) => i.roles.includes(r.id)));

  const tagCounts = countTags(items);
  const archiveGroups = groupByArchive(items);

  const current: Record<string, string | undefined> = {
    product: selProduct,
    role: selRole,
    format: selFormat,
    tag: selTag,
    year: selYear,
  };
  const preservedQuery = (() => {
    const params = new URLSearchParams();
    for (const key of ["product", "role", "format"]) {
      if (current[key]) params.set(key, current[key]!);
    }
    return params.toString();
  })();

  /* 系列货架:无筛选 = 全部在架系列;有筛选 = 命中系列(卡角 命中 n/N) */
  const shelfSeries = countSeries(anyFilter ? filtered : items).map((c) => {
    const total = items.filter((i) => i.series === c.slug).length;
    return { slug: c.slug, hit: c.count, total, episodes: filtered.filter((i) => i.series === c.slug) };
  });

  /* 无筛选时的单篇流:月刊 + 不入系列的教程 */
  const standalone = items.filter((i) => !i.series);

  const formatTabs: { key: GuideFormat | undefined; label: string }[] = [
    { key: undefined, label: t(locale, "explore.formatAll") },
    { key: "read", label: t(locale, "explore.formatRead") },
    { key: "video", label: t(locale, "explore.formatVideo") },
    { key: "deck", label: t(locale, "explore.formatDeck") },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={`— ${zh ? "探索" : "EXPLORE"}`}
        title={
          <>
            {zh ? "系列是路,产品与职业是门" : "Series are the paths; products and roles are the doors"}
            <span className="text-ui-blue">.</span>
          </>
        }
        lede={
          zh
            ? "月刊评鉴与教程住在同一架上——按你在用的产品、你的职业、你偏爱的形态找到入口,沿着系列走完它。"
            : "The monthly review and the tutorials live on the same shelf — enter by the product you use, the work you do, or the format you prefer, then follow a series to the end."
        }
      />

      {/* ---- 透镜区:产品 chips + 职业 chips + 形态 seg + 标签/年份下拉 ---- */}
      <section aria-label={t(locale, "explore.filterAria")} className="mt-8 space-y-4">
        <div>
          <p className="kb-eyebrow mb-2">{t(locale, "explore.lensProducts")}</p>
          <div className="flex max-w-3xl flex-wrap gap-1.5">
            {KB_PRODUCTS.map((p) => {
              const Icon = p.icon;
              const count = productChipCount(p.id);
              return (
                <LensChip
                  key={p.id}
                  href={lensHref("/explore", current, {
                    product: selProduct === p.id ? undefined : p.id,
                  })}
                  active={selProduct === p.id}
                  disabled={count === 0}
                  count={count}
                >
                  <Icon size={13} aria-hidden="true" />
                  {zh ? p.zh : p.en}
                </LensChip>
              );
            })}
          </div>
        </div>
        {roleIds.length > 0 && (
          <div>
            <p className="kb-eyebrow mb-2">{t(locale, "explore.lensRoles")}</p>
            <div className="flex max-w-3xl flex-wrap gap-1.5">
              {roleIds.map((r) => {
                const count = roleChipCount(r.id);
                return (
                  <LensChip
                    key={r.id}
                    href={lensHref("/explore", current, {
                      role: selRole === r.id ? undefined : r.id,
                    })}
                    active={selRole === r.id}
                    disabled={count === 0}
                    count={count}
                  >
                    {zh ? r.zh : r.en}
                  </LensChip>
                );
              })}
            </div>
          </div>
        )}
        {/* 工具行:形态 seg + 标签/年份下拉(WorksFilterBar 双行结构,
            preservedQuery 带上透镜参数,下拉切换不丢) */}
        <div className="flex flex-wrap items-center gap-3">
          <nav
            aria-label={t(locale, "explore.format")}
            className={`${SEG_WRAP} max-sm:w-full max-sm:flex-wrap`}
          >
            {formatTabs.map((f) => (
              <Link
                key={f.key ?? "all"}
                href={lensHref("/explore", current, {
                  format: f.key === undefined ? undefined : f.key,
                })}
                scroll={false}
                aria-current={selFormat === f.key ? "page" : undefined}
                className={`${SEG_ITEM} ${selFormat === f.key ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <WorksFilterBar
            basePath="/explore"
            preservedQuery={preservedQuery}
            locale={locale}
            filters={[
              {
                key: "tag",
                label: zh ? "标签" : "Tag",
                options: tagCounts.map((tg) => ({ value: tg.value, label: `#${tg.value} (${tg.count})` })),
                single: true,
              },
              {
                key: "year",
                label: zh ? "归档" : "Year",
                options: archiveGroups.map((g) => ({
                  value: g.year,
                  label: `${g.year} (${g.months.reduce((n, m) => n + m.items.length, 0)})`,
                })),
                single: true,
              },
            ]}
            selected={{
              tag: selTag ? [selTag] : [],
              year: selYear ? [selYear] : [],
            }}
          />
          {!anyFilter && shelfSeries.length > 0 && (
            <WorksViewToggle locale={locale} view={seriesView} />
          )}
        </div>
      </section>

      {/* ---- 内容区 ---- */}
      <div className="mt-6">
        {shelfSeries.length > 0 && (
          <section>
            <p className="kb-eyebrow flex items-center justify-between border-b border-line pb-4">
              <span>
                {t(locale, "explore.shelfSeries")} · {shelfSeries.length}
              </span>
            </p>
            <div className="mt-4">
              {seriesView === "grid" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {shelfSeries.map((s) => {
                    const meta = findLearnSeries(s.slug)!;
                    return (
                      <SeriesGridCard
                        key={s.slug}
                        series={meta}
                        episodes={s.episodes}
                        zh={zh}
                        matched={anyFilter ? { hit: s.hit, total: s.total } : undefined}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {shelfSeries.map((s) => {
                    const meta = findLearnSeries(s.slug)!;
                    return (
                      <SeriesRowCard
                        key={s.slug}
                        series={meta}
                        episodes={s.episodes}
                        zh={zh}
                        matched={anyFilter ? { hit: s.hit, total: s.total } : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 条目列表:无筛选 = 单篇与月刊;有筛选 = 全部命中(系列内集也单列行) */}
        {anyFilter ? (
          filtered.length === 0 ? (
            /* 组合空态:清除全部 + 最近内容,不给死胡同 */
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
              {items.length > 0 && (
                <section className="mt-8">
                  <p className="kb-eyebrow border-b border-line pb-4">{t(locale, "explore.latest")}</p>
                  <ItemList items={items.slice(0, 3)} zh={zh} locale={locale} />
                </section>
              )}
            </>
          ) : (
            <section className="mt-8">
              <ItemList items={filtered} zh={zh} locale={locale} />
            </section>
          )
        ) : (
          <section className="mt-8">
            <p className="kb-eyebrow border-b border-line pb-4">
              {t(locale, "explore.standalone")} · {standalone.length}
            </p>
            <ItemList items={standalone} zh={zh} locale={locale} />
          </section>
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
