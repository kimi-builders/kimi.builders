/* 探索(Explore)四维聚合(20260821 月刊 × 教程合并):
   分类(articles.kind:letter=月刊评鉴 / guide=教程)/ 系列(learn-series 注册表)/
   标签(payload.tags)/ 时间(published_at 归档)。
   数据源 = articles 表两 kind 合集(已发布、未软删),语言去重走
   pickArticleVersions(UI 语言优先,缺失回落打 fallback 标)。
   计数/过滤/归档是纯函数(单测直接测),DB 读写在文件底部;
   写法对齐 ./monthly(纯函数与 DB 分离)。 */
import type { RowDataPacket } from "mysql2";
import type { ArticleKind, ArticleLocale } from "./articles";
import { getPool } from "./db";
import { LEARN_SERIES } from "./learn-series";
import { letterPayloadFromDb } from "./monthly";
import { guidePayloadFromDb } from "./tutorials";

/* ---- 展示层类型 ---- */

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
}

export interface TaxonomyCount {
  value: string;
  count: number;
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
    return true;
  });
}

/* 分类维度的展示名(两种 kind 即首批两类) */
export function categoryLabelOf(kind: ArticleKind, zh: boolean): string {
  if (kind === "letter") return zh ? "月刊评鉴" : "Monthly";
  return zh ? "教程" : "Tutorials";
}

/* ---- DB:两 kind 合集 ---- */

function mapExploreRow(r: RowDataPacket): Omit<ExploreItem, "fallback"> {
  const kind: ArticleKind = r.kind === "guide" ? "guide" : "letter";
  const payload =
    kind === "guide" ? guidePayloadFromDb(r.payload) : letterPayloadFromDb(r.payload);
  return {
    slug: r.slug,
    kind,
    title: r.title,
    summary: r.summary ?? "",
    locale: r.locale === "en" ? "en" : "zh",
    publishedAt: r.published_at,
    editorHandle: r.author_handle ?? "",
    series: kind === "guide" ? (payload as { series?: string }).series ?? null : null,
    tags: (payload as { tags?: string[] }).tags ?? [],
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
    `SELECT a.slug, a.kind, a.locale, a.title, a.summary,
            a.published_at, a.payload, u.handle AS author_handle
     FROM articles a
     JOIN users u ON u.id = a.author_id
     WHERE a.kind IN ('letter', 'guide') AND a.published_at IS NOT NULL AND a.deleted_at IS NULL
     ORDER BY a.published_at DESC, a.id DESC`,
  );
  return pickLocaleVersions(rows.map(mapExploreRow), uiLocale);
}
