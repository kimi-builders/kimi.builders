/* 探索(Explore)聚合(20260821 月刊 × 教程合并;同日「货架 + 透镜」改版):
   脊柱 = 系列(learn-series 注册表,策展序列);透镜 = 产品(kb-products)/
   职业(kb-roles)结构化 facet;表现层 = 形态(read/video/deck),从 payload
   与正文**派生**不存储(派生不说谎:有文稿才有 read);长尾 = 标签(payload.tags)
   与时间归档。计数/过滤/归档是纯函数(单测直接测),0 计数透镜不渲染
   (与「0 集系列不上架」同口径);DB 读写在文件底部,写法对齐 ./monthly。 */
import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import type { ArticleKind, ArticleLocale } from "./articles";
import { KB_CHAPTERS } from "./kb-chapters";
import { KB_PRODUCTS } from "./kb-products";
import { KB_ROLES } from "./kb-roles";
import { getPool } from "./db";
import { LEARN_SERIES } from "./learn-series";
import { letterPayloadFromDb } from "./monthly";
import { guidePayloadFromDb } from "./tutorials";

/* ---- 展示层类型 ---- */

/* 内容单元的表现形态(同一单元可有多种):read=文章 / video=视频 / deck=演示稿 */
export type GuideFormat = "read" | "video" | "deck";

export interface ExploreItem {
  slug: string;
  kind: ArticleKind;
  title: string;
  summary: string;
  locale: ArticleLocale;
  fallback: boolean;
  publishedAt: Date;
  editorHandle: string;
  /* 所属教程系列(letter 恒 null:月刊本身是期刊,不注册系列) */
  series: string | null;
  tags: string[];
  /* 教程集的时长(分钟;letter 恒 undefined) */
  durationMin?: number;
  /* 产品/职业透镜(slug;guide 的 payload 打标,letter 契约暂不含 → 恒空) */
  products: string[];
  roles: string[];
  /* 所属章(章主轴):继承链 payload.chapter ?? 所属系列的 series.chapter;
     letter(月刊)不挂章 → 恒 null */
  chapter: string | null;
  /* 封面(payload.cover;缺省 null → 列表卡自动章字砖) */
  cover: string | null;
  /* 可得形态(派生:bodyMd/video/deck 的存在性) */
  formats: GuideFormat[];
}

export interface TaxonomyCount {
  value: string;
  count: number;
}

/* 形态推导(派生不说谎):有正文才有 read,有 video 才有 video,有 deck 才有
   deck。read 恒在数组首位(canonical 文稿优先的呈现序)。 */
export function deriveFormats(
  bodyMd: string | null | undefined,
  payload: unknown,
): GuideFormat[] {
  const p =
    typeof payload === "object" && payload !== null
      ? (payload as { video?: unknown; deck?: unknown })
      : {};
  const formats: GuideFormat[] = [];
  if (bodyMd && bodyMd.trim().length > 0) formats.push("read");
  if (p.video) formats.push("video");
  if (p.deck) formats.push("deck");
  return formats;
}

export interface ArchiveMonth {
  month: string; // YYYY-MM
  items: ExploreItem[];
}

export interface ArchiveYear {
  year: string;
  months: ArchiveMonth[];
}

/* ---- 纯函数:计数 / 过滤 / 归档 ---- */

/* 分类(kind)计数:value 即 ArticleKind */
export interface KindCount {
  value: ArticleKind;
  count: number;
}

export function countByKind(items: ExploreItem[]): KindCount[] {
  const counts = new Map<ArticleKind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

export function countTags(items: ExploreItem[]): TaxonomyCount[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/* 系列计数:只在册注册表系列,0 集的不出(与目录页「有集才上架」同口径) */
export function countSeries(items: ExploreItem[]): (TaxonomyCount & { slug: string })[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (i.series) counts.set(i.series, (counts.get(i.series) ?? 0) + 1);
  }
  return LEARN_SERIES.map((s) => ({ slug: s.slug, value: s.slug, count: counts.get(s.slug) ?? 0 }))
    .filter((c) => c.count > 0);
}

/* 产品透镜计数:按词表序出(主产品在前),0 计数不出 chips。 */
export function countByProduct(items: ExploreItem[]): TaxonomyCount[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    for (const p of i.products) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return KB_PRODUCTS
    .map((p) => ({ value: p.id, count: counts.get(p.id) ?? 0 }))
    .filter((c) => c.count > 0);
}

/* 职业透镜计数:同上(词表序,0 计数不出)。 */
export function countByRoles(items: ExploreItem[]): TaxonomyCount[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    for (const r of i.roles) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return KB_ROLES
    .map((r) => ({ value: r.id, count: counts.get(r.id) ?? 0 }))
    .filter((c) => c.count > 0);
}

/* 职业落地页门槛(纯函数,页面缓建):该职业下已发布单元 ≥3 才允许策展
   /explore/for/<role>(与「0 集系列不上架」同一条纪律——空分类墙不上架)。 */
export function roleLandingEligible(items: ExploreItem[], role: string): boolean {
  return items.filter((i) => i.roles.includes(role)).length >= 3;
}

/* 章计数(章主轴):四章固定序,计数 = 该章命中的内容数(系列内集按继承链
   解析后的 chapter);章是永久框架,页面渲染恒出四章、0 计数置灰。 */
export function countByChapter(items: ExploreItem[]): TaxonomyCount[] {
  return KB_CHAPTERS.map((c) => ({
    value: c.id,
    count: items.filter((i) => i.chapter === c.id).length,
  }));
}

/* 归档:年倒序 → 月倒序 → 月内按发布时间倒序(UTC 口径,与 published_at 一致)。 */
export function groupByArchive(items: ExploreItem[]): ArchiveYear[] {
  const byYear = new Map<string, Map<string, ExploreItem[]>>();
  for (const i of items) {
    const year = String(i.publishedAt.getUTCFullYear());
    const month = `${year}-${String(i.publishedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const months = byYear.get(year) ?? new Map<string, ExploreItem[]>();
    const list = months.get(month) ?? [];
    list.push(i);
    months.set(month, list);
    byYear.set(year, months);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, list]) => ({
          month,
          items: list.sort(
            (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
          ),
        })),
    }));
}

export interface ExploreSelection {
  category?: ArticleKind;
  series?: string;
  tag?: string;
  year?: string;
  /* 章主轴(单选;再次点击取消 = 参数缺席) */
  chapter?: string;
  /* 产品/职业透镜(单选;再次点击取消 = 参数缺席) */
  product?: string;
  role?: string;
  /* 形态过滤:单元「可得」该形态才命中(页面已不暴露筛选,lib 能力保留) */
  format?: GuideFormat;
}

export function filterExploreItems(
  items: ExploreItem[],
  sel: ExploreSelection,
): ExploreItem[] {
  return items.filter((i) => {
    if (sel.category && i.kind !== sel.category) return false;
    if (sel.series && i.series !== sel.series) return false;
    if (sel.tag && !i.tags.includes(sel.tag)) return false;
    if (sel.year && String(i.publishedAt.getUTCFullYear()) !== sel.year) return false;
    if (sel.chapter && i.chapter !== sel.chapter) return false;
    if (sel.product && !i.products.includes(sel.product)) return false;
    if (sel.role && !i.roles.includes(sel.role)) return false;
    if (sel.format && !i.formats.includes(sel.format)) return false;
    return true;
  });
}

/* 分类维度的展示名(20260822:「教程」概念下线——guide 统称「文章」;
   系列 = 内容的一种组合,现阶段不展示) */
export function categoryLabelOf(kind: ArticleKind, zh: boolean): string {
  if (kind === "letter") return zh ? "月刊评鉴" : "Monthly";
  return zh ? "文章" : "Article";
}

/* ---- DB:两 kind 合集 ---- */

function mapExploreRow(r: RowDataPacket): Omit<ExploreItem, "fallback"> {
  const kind: ArticleKind = r.kind === "guide" ? "guide" : "letter";
  const payload =
    kind === "guide" ? guidePayloadFromDb(r.payload) : letterPayloadFromDb(r.payload);
  const seriesSlug = kind === "guide" ? (payload as { series?: string }).series ?? null : null;
  /* 章继承链:集自带 chapter ?? 所属系列的注册表 chapter;letter 恒 null */
  const seriesChapter = seriesSlug
    ? LEARN_SERIES.find((s) => s.slug === seriesSlug)?.chapter
    : undefined;
  return {
    slug: r.slug,
    kind,
    title: r.title,
    summary: r.summary ?? "",
    locale: r.locale === "en" ? "en" : "zh",
    publishedAt: r.published_at,
    editorHandle: r.author_handle ?? "",
    series: seriesSlug,
    tags: (payload as { tags?: string[] }).tags ?? [],
    durationMin: (payload as { durationMin?: number }).durationMin,
    /* 透镜:payload 已在 fromDb 容错层过滤过非法 slug,这里直接取;
       letter 的 payload 契约不含透镜字段 → 恒空数组 */
    products: (payload as { products?: string[] }).products ?? [],
    roles: (payload as { roles?: string[] }).roles ?? [],
    chapter: (payload as { chapter?: string }).chapter ?? seriesChapter ?? null,
    cover: (payload as { cover?: string }).cover ?? null,
    formats: deriveFormats(r.body_md, payload),
  };
}

/* 语言去重(与文章引擎 pickArticleVersions 同语义,字段不同步故本地实现):
   同 slug 取 UI 语言版本,缺失回落另一语言并打 fallback 标。 */
function pickLocaleVersions(
  items: Omit<ExploreItem, "fallback">[],
  uiLocale: ArticleLocale,
): ExploreItem[] {
  const bySlug = new Map<string, Omit<ExploreItem, "fallback">[]>();
  for (const i of items) {
    const group = bySlug.get(i.slug);
    if (group) group.push(i);
    else bySlug.set(i.slug, [i]);
  }
  const out: ExploreItem[] = [];
  for (const group of bySlug.values()) {
    const pick = group.find((i) => i.locale === uiLocale) ?? group[0];
    out.push({ ...pick, fallback: pick.locale !== uiLocale });
  }
  return out;
}

export async function listExploreItems(
  uiLocale: ArticleLocale,
): Promise<ExploreItem[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT a.slug, a.kind, a.locale, a.title, a.summary, a.body_md,
            a.published_at, a.payload, u.handle AS author_handle
     FROM articles a
     JOIN users u ON u.id = a.author_id
     WHERE a.kind IN ('letter', 'guide') AND a.published_at IS NOT NULL AND a.deleted_at IS NULL
     ORDER BY a.published_at DESC, a.id DESC`,
  );
  return pickLocaleVersions(rows.map(mapExploreRow), uiLocale);
}

/* 文章详情右栏(ArticleRail)的元数据:按 slug 单查,React cache 与
   同请求内的重复调用去重;未发布/不存在 → null(rail 不渲染)。
   查询与 mapExploreRows 同构(章继承链/透镜/形态一次到位)。 */
export const getArticleRailMeta = cache(
  async (slug: string, uiLocale: ArticleLocale): Promise<ExploreItem | null> => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT a.slug, a.kind, a.locale, a.title, a.summary, a.body_md,
              a.published_at, a.payload, u.handle AS author_handle
       FROM articles a
       JOIN users u ON u.id = a.author_id
       WHERE a.slug = ? AND a.published_at IS NOT NULL AND a.deleted_at IS NULL
       LIMIT 1`,
      [slug],
    );
    if (rows.length === 0) return null;
    const item = mapExploreRow(rows[0]);
    return { ...item, fallback: item.locale !== uiLocale };
  },
);
