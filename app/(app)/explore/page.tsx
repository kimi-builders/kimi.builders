/* 探索(Explore)· 章主轴扁平列表(20260822 简化改版):
   使命:探索将智能转化为创造力的最优解(镜像官方 Seeking the optimal
   conversion from energy to intelligence 句式)。
   冷启动形态:一篇内容一张横列卡(封面左、内容右,WorkCard 行式语法),
   不做系列/教程架子——系列机制在数据层保留,内容长出来再上架。
   章(学/做/得/立)seg = 主轴,0 计数章置灰恒可见;
   产品/职业/标签/归档 = 单选下拉,**有内容才出选项,整维无内容连下拉都不出**;
   形态(文章/视频/演示稿)不筛选——每篇内容三媒体齐备,仅作卡上标记。
   筛选 URL(含 ?chapter=)noindex;组合空态给「清除筛选 + 最近内容」。
   板块开关未就绪时整页换「正在路上」。 */
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
import { KB_CHAPTERS, isKbChapterId } from "@/src/lib/kb-chapters";
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
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

/* 筛选参数的单选切换(再点取消):其余参数原样保留 */
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
  /* 筛选组合 URL(含章)不索引(防组合爬陷);默认视图可索引 */
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
  /* 章/透镜白名单校验(非法值 = 未选);旧四维与形态参数忽略 */
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
  /* 行式/封面墙:与作品墙同一 cookie 偏好(kb-works-view);
     移动端恒行式(getWorksView 内收敛),切换器也不渲染 */
  const [view, mobile] = await Promise.all([getWorksView(), isMobileRequest()]);

  const sel = {
    chapter: selChapter,
    product: selProduct,
    role: selRole,
    tag: selTag,
    year: selYear,
  };
  const filtered = anyFilter ? filterExploreItems(items, sel) : items;

  /* 章计数(seg 用,恒出四章;0 计数置灰) */
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
  const preservedQuery = (() => {
    const params = new URLSearchParams();
    if (selChapter) params.set("chapter", selChapter);
    return params.toString();
  })();

  /* 筛选器按配置与内容出现:配置启用(explore-filters.ts)且有选项的维度才给
     下拉,整维无内容不占位;未启用的维度(职业/归档等)词表与计数都在,
     翻开配置即用 */
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

  /* 发布入口:仅 admin/mod 可见(页面门槛之外,action 层再兜底) */
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
      <PageHeader
        eyebrow={`— ${zh ? "探索" : "EXPLORE"}`}
        title={
          <>
            {zh ? "探索将智能转化为创造力的最优解" : "Seeking the optimal conversion from intelligence to creativity"}
            <span className="text-ui-blue">.</span>
          </>
        }
        lede={
          zh
            ? "学,把智能变成认知;做,把认知变成东西;得,把东西变成价值;立,把价值变成位置与自我。"
            : "Learn turns intelligence into judgment; Build turns judgment into things; Gain turns things into value; Become turns value into who you are."
        }
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
              /* 置灰不隐藏:四章是永久框架,空章也是承诺 */
              return (
                <span
                  key={c.id}
                  aria-disabled="true"
                  title={zh ? c.tagline.zh : c.tagline.en}
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

      {/* ---- 内容区:一篇一卡,行式 / 封面墙 ---- */}
      <div className="mt-6">
        {items.length === 0 ? (
          /* 冷启动诚实空态 */
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
            <div className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((i) => (
                <ArticleGridCard key={i.slug} item={i} locale={locale} />
              ))}
            </div>
          ) : (
            <div className="stagger-in space-y-4">
              {items.map((i) => (
                <ArticleRowCard key={i.slug} item={i} locale={locale} />
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
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
            <section className="mt-8">
              <p className="kb-eyebrow border-b border-line pb-4">{t(locale, "explore.latest")}</p>
              <div className="mt-4 space-y-4">
                {items.slice(0, 3).map((i) => (
                  <ArticleRowCard key={i.slug} item={i} locale={locale} />
                ))}
              </div>
            </section>
          </>
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((i) => (
              <ArticleGridCard key={i.slug} item={i} locale={locale} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((i) => (
              <ArticleRowCard key={i.slug} item={i} locale={locale} />
            ))}
          </div>
        )}
      </div>

      {/* 纪律一行(20260822 随「一篇一卡」形态重写) */}
      <p className="mt-12 border-t border-line pt-6 text-[11px] leading-relaxed text-grey/80">
        {zh
          ? "每篇以「做完你拥有什么」收口——产物可带走、路径可复走 · 署名到人:AI 参与必须披露 · 编辑手选:上不上架由人拍板,不外包给算法。"
          : "Every piece ends with what you walk away with — assets to take, paths to re-walk · signed by named humans, AI disclosed · hand-picked by editors, never delegated to an algorithm."}
      </p>
    </div>
  );
}
