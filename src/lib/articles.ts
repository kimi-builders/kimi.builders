/* 文章引擎(S3-1):一张 articles 表承载两个分区 ——
   /blog 月刊《给 Kimi 官方的一封信》(kind='letter')与 /learn 策划制学习路径(kind='guide')。
   双语版本 = 同 slug 两行不同 locale,(slug, locale) 复合唯一;列表按当前 UI 语言优先,
   缺失时回落另一语言并在卡片标注语言(pickArticleVersions 打 fallback 标)。
   published_at NULL = 草稿(前台不露出);撤稿 = 置回 NULL;软删 deleted_at 风格对齐 posts。
   校验 / 查询构建 / 语言回落是纯函数(单测直接测),DB 读写在文件下半部分组装;
   写法对齐 ./featured。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export const ARTICLE_SLUG_MAX = 160;
export const ARTICLE_TITLE_MAX = 200;
export const ARTICLE_SUMMARY_MAX = 500;
export const ARTICLE_SORT_MAX = 9999;

export type ArticleKind = "letter" | "guide";
export type ArticleLocale = "zh" | "en";

/* slug:小写字母/数字/连字符,连字符只在段间(不首尾、不连排)。合法返回规范化值,否则 null。 */
export function normalizeArticleSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug || slug.length > ARTICLE_SLUG_MAX) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

export function normalizeArticleKind(raw: string): ArticleKind | null {
  return raw === "letter" || raw === "guide" ? raw : null;
}

export function normalizeArticleLocale(raw: string): ArticleLocale | null {
  return raw === "zh" || raw === "en" ? raw : null;
}

/* sort_order:非负整数,非法/越界回落 0(guide 的策划序号,letter 忽略)。 */
export function normalizeSortOrder(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, ARTICLE_SORT_MAX);
}

/* 表单 → 库的输入契约(action 层校验后构造)。 */
export interface ArticleInput {
  slug: string;
  kind: ArticleKind;
  locale: ArticleLocale;
  title: string;
  summary: string;
  bodyMd: string;
  sortOrder: number;
}

/* 列表条目(月刊卡片 / 编号路径共用);fallback=实际语言≠UI 语言(卡片要标注)。 */
export interface ArticleListItem {
  id: number;
  slug: string;
  locale: ArticleLocale;
  title: string;
  summary: string;
  authorHandle: string; // 署名编辑
  publishedAt: Date;
  sortOrder: number;
  fallback: boolean;
}

export interface ArticleDetail extends ArticleListItem {
  bodyMd: string;
}

/* 编辑表单初始值(含草稿:不看 published_at)。 */
export interface ArticleForEdit {
  id: number;
  slug: string;
  kind: ArticleKind;
  locale: ArticleLocale;
  title: string;
  summary: string;
  bodyMd: string;
  sortOrder: number;
  publishedAt: Date | null;
}

const LIST_COLS = `a.id, a.slug, a.locale, a.title, a.summary, a.sort_order, a.published_at,
         u.handle AS author_handle`;

/* 列表:两种语言的已发布条目一起取出,语言去重在 JS 侧(pickArticleVersions)。
   letter 按发布时间倒序(新期在前);guide 按策划序号升序(01/02/03 的路径感)。 */
export function listArticlesQuery(kind: ArticleKind): {
  sql: string;
  args: string[];
} {
  const order =
    kind === "guide"
      ? "a.sort_order ASC, a.published_at ASC, a.id ASC"
      : "a.published_at DESC, a.id DESC";
  return {
    sql: `SELECT ${LIST_COLS}
          FROM articles a
          JOIN users u ON u.id = a.author_id
          WHERE a.kind = ? AND a.published_at IS NOT NULL AND a.deleted_at IS NULL
          ORDER BY ${order}`,
    args: [kind],
  };
}

/* 语言回落:同 slug 取 UI 语言版本,缺失时回落另一语言并打 fallback 标。
   输入已按展示序排好(SQL ORDER BY),同 slug 的两行谁先谁后不定,这里按 slug 归组。 */
export function pickArticleVersions(
  rows: Omit<ArticleListItem, "fallback">[],
  uiLocale: ArticleLocale,
): ArticleListItem[] {
  const bySlug = new Map<string, Omit<ArticleListItem, "fallback">[]>();
  for (const r of rows) {
    const group = bySlug.get(r.slug);
    if (group) group.push(r);
    else bySlug.set(r.slug, [r]);
  }
  const out: ArticleListItem[] = [];
  for (const group of bySlug.values()) {
    const pick = group.find((r) => r.locale === uiLocale) ?? group[0];
    out.push({ ...pick, fallback: pick.locale !== uiLocale });
  }
  return out;
}

/* 详情:slug + UI 语言优先,缺失回落另一语言(ORDER BY (locale = ?) DESC 取第一行)。 */
export function articleBySlugQuery(
  kind: ArticleKind,
  slug: string,
  uiLocale: ArticleLocale,
): { sql: string; args: string[] } {
  return {
    sql: `SELECT ${LIST_COLS}, a.body_md
          FROM articles a
          JOIN users u ON u.id = a.author_id
          WHERE a.kind = ? AND a.slug = ? AND a.locale IN ('zh', 'en')
                AND a.published_at IS NOT NULL AND a.deleted_at IS NULL
          ORDER BY (a.locale = ?) DESC
          LIMIT 1`,
    args: [kind, slug, uiLocale],
  };
}

/* 编辑态:按 slug+locale 精确定位(草稿也要能取到,所以不看 published_at)。 */
export function articleForEditQuery(
  slug: string,
  locale: ArticleLocale,
): { sql: string; args: string[] } {
  return {
    sql: `SELECT a.id, a.slug, a.kind, a.locale, a.title, a.summary, a.body_md,
                 a.sort_order, a.published_at
          FROM articles a
          WHERE a.slug = ? AND a.locale = ? AND a.deleted_at IS NULL
          LIMIT 1`,
    args: [slug, locale],
  };
}

/* 新建:publish=true 立即发布(NOW()),否则存草稿(NULL)。 */
export function insertArticleQuery(
  authorId: number,
  input: ArticleInput,
  publish: boolean,
): { sql: string; args: (string | number)[] } {
  return {
    sql: `INSERT INTO articles
            (slug, kind, locale, title, summary, body_md, author_id, sort_order, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, IF(?, NOW(), NULL))`,
    args: [
      input.slug,
      input.kind,
      input.locale,
      input.title.slice(0, ARTICLE_TITLE_MAX),
      input.summary.slice(0, ARTICLE_SUMMARY_MAX),
      input.bodyMd,
      authorId,
      input.sortOrder,
      publish ? 1 : 0,
    ],
  };
}

/* 更新:发布语义 —— publish=true 保留首次发布时间(COALESCE),false = 撤稿(置 NULL)。
   WHERE 钉死未删行,affectedRows=0 即目标不存在/已删。 */
export function updateArticleQuery(
  id: number,
  input: ArticleInput,
  publish: boolean,
): { sql: string; args: (string | number)[] } {
  return {
    sql: `UPDATE articles
          SET slug = ?, kind = ?, locale = ?, title = ?, summary = ?,
              body_md = ?, sort_order = ?,
              published_at = IF(?, COALESCE(published_at, NOW()), NULL)
          WHERE id = ? AND deleted_at IS NULL`,
    args: [
      input.slug,
      input.kind,
      input.locale,
      input.title.slice(0, ARTICLE_TITLE_MAX),
      input.summary.slice(0, ARTICLE_SUMMARY_MAX),
      input.bodyMd,
      input.sortOrder,
      publish ? 1 : 0,
      id,
    ],
  };
}

/* 软删(风格对齐 posts):置 deleted_at,物理行保留。 */
export function softDeleteArticleQuery(id: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `UPDATE articles SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    args: [id],
  };
}

/* ---- DB 组装(权限校验在 action 层:登录 + admin/mod,复用 featured.canModerate)---- */

function mapListRow(r: RowDataPacket): Omit<ArticleListItem, "fallback"> {
  return {
    id: Number(r.id),
    slug: r.slug,
    locale: r.locale === "en" ? "en" : "zh",
    title: r.title,
    summary: r.summary ?? "",
    authorHandle: r.author_handle ?? "",
    publishedAt: r.published_at,
    sortOrder: Number(r.sort_order) || 0,
  };
}

export async function listArticles(
  kind: ArticleKind,
  uiLocale: ArticleLocale,
): Promise<ArticleListItem[]> {
  const q = listArticlesQuery(kind);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return pickArticleVersions(rows.map(mapListRow), uiLocale);
}

export async function getArticleBySlug(
  kind: ArticleKind,
  slug: string,
  uiLocale: ArticleLocale,
): Promise<ArticleDetail | null> {
  const q = articleBySlugQuery(kind, slug, uiLocale);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const r = rows[0];
  if (!r) return null;
  const base = mapListRow(r);
  return {
    ...base,
    fallback: base.locale !== uiLocale,
    bodyMd: r.body_md ?? "",
  };
}

export async function getArticleForEdit(
  slug: string,
  locale: ArticleLocale,
): Promise<ArticleForEdit | null> {
  const q = articleForEditQuery(slug, locale);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    slug: r.slug,
    kind: r.kind === "guide" ? "guide" : "letter",
    locale: r.locale === "en" ? "en" : "zh",
    title: r.title,
    summary: r.summary ?? "",
    bodyMd: r.body_md ?? "",
    sortOrder: Number(r.sort_order) || 0,
    publishedAt: r.published_at ?? null,
  };
}

export async function createArticle(
  authorId: number,
  input: ArticleInput,
  publish: boolean,
): Promise<number> {
  const q = insertArticleQuery(authorId, input, publish);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return Number(res.insertId);
}

export async function updateArticle(
  id: number,
  input: ArticleInput,
  publish: boolean,
): Promise<boolean> {
  const q = updateArticleQuery(id, input, publish);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}

export async function softDeleteArticle(id: number): Promise<boolean> {
  const q = softDeleteArticleQuery(id);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}
