/* Article engine: one articles table serves two sections — /blog monthly
   letters (kind='letter') and /learn curated learn series
   (kind='guide'). Bilingual versions = two rows sharing a slug with
   different locales, (slug, locale) composite-unique; lists prefer the
   current UI locale, falling back to the other language and labeling the
   card (pickArticleVersions sets the fallback flag). published_at NULL =
   draft (invisible in front); unpublishing sets it back to NULL;
   soft-delete deleted_at follows the posts convention. Validation /
   query building / locale fallback are pure functions (unit-tested
   directly); DB access is assembled in the lower half, aligned with
   ./featured. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export const ARTICLE_SLUG_MAX = 160;
export const ARTICLE_TITLE_MAX = 200;
export const ARTICLE_SUMMARY_MAX = 500;
export const ARTICLE_SORT_MAX = 9999;

export type ArticleKind = "letter" | "guide";
export type ArticleLocale = "zh" | "en";

/* Slug: lowercase letters/digits/hyphens, hyphens only between segments
   (never leading/trailing/doubled). Returns the normalized value or
   null. */
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

/* sort_order: non-negative integer; invalid/out-of-range falls back to 0
   (the guide's curated order; letters ignore it). */
export function normalizeSortOrder(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, ARTICLE_SORT_MAX);
}

/* Form -> DB input contract (constructed after action-layer validation).
   payload: the letter's issue metadata as JSON text (validated in
   src/lib/monthly.ts), NULL = pure automatic assembly. */
export interface ArticleInput {
  slug: string;
  kind: ArticleKind;
  locale: ArticleLocale;
  title: string;
  summary: string;
  bodyMd: string;
  sortOrder: number;
  payload: string | null;
}

/* List entry (shared by monthly cards / numbered paths); fallback =
   actual language differs from UI locale (the card labels it). payloadRaw
   = articles.payload as-is (driver-parsed JSON; consumed by monthly.ts
   assembly). */
export interface ArticleListItem {
  id: number;
  slug: string;
  locale: ArticleLocale;
  title: string;
  summary: string;
  authorHandle: string; // credited editor
  publishedAt: Date;
  sortOrder: number;
  fallback: boolean;
  payloadRaw: unknown;
}

export interface ArticleDetail extends ArticleListItem {
  bodyMd: string;
}

/* Edit-form initial values (drafts included: published_at not consulted).
   payload = JSON text (textarea-editable). */
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
  payload: string;
}

const LIST_COLS = `a.id, a.slug, a.locale, a.title, a.summary, a.sort_order, a.published_at,
         a.payload, u.handle AS author_handle`;

/* List: published entries of both languages fetched together; language
   dedup happens in JS (pickArticleVersions). Letters order by publish
   time desc (newest first); guides by sort_order asc (the 01/02/03 path
   feel). */
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

/* Locale fallback: per slug pick the UI-locale version, else the other
   language with a fallback flag. Input arrives in display order (SQL
   ORDER BY); the two rows of a slug may come in any order — grouped here
   by slug. */
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

/* Detail: slug + UI locale preferred, falling back to the other language
   (ORDER BY (locale = ?) DESC takes the first row). */
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

/* Edit state: located by slug+locale exactly (drafts must resolve too —
   published_at not consulted). */
export function articleForEditQuery(
  slug: string,
  locale: ArticleLocale,
): { sql: string; args: string[] } {
  return {
    sql: `SELECT a.id, a.slug, a.kind, a.locale, a.title, a.summary, a.body_md,
                 a.sort_order, a.published_at, a.payload
          FROM articles a
          WHERE a.slug = ? AND a.locale = ? AND a.deleted_at IS NULL
          LIMIT 1`,
    args: [slug, locale],
  };
}

/* Create: publish=true publishes immediately (NOW()), otherwise a draft
   (NULL). payload is action-validated JSON text (or NULL) stored as-is. */
export function insertArticleQuery(
  authorId: number,
  input: ArticleInput,
  publish: boolean,
): { sql: string; args: (string | number | null)[] } {
  return {
    sql: `INSERT INTO articles
            (slug, kind, locale, title, summary, body_md, payload, author_id, sort_order, published_at)
          VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, IF(?, NOW(), NULL))`,
    args: [
      input.slug,
      input.kind,
      input.locale,
      input.title.slice(0, ARTICLE_TITLE_MAX),
      input.summary.slice(0, ARTICLE_SUMMARY_MAX),
      input.bodyMd,
      input.payload,
      authorId,
      input.sortOrder,
      publish ? 1 : 0,
    ],
  };
}

/* Update: publish semantics — true keeps the first publish time
   (COALESCE), false unpublishes (NULL). WHERE pins undeleted rows;
   affectedRows=0 = missing/deleted. */
export function updateArticleQuery(
  id: number,
  input: ArticleInput,
  publish: boolean,
): { sql: string; args: (string | number | null)[] } {
  return {
    sql: `UPDATE articles
          SET slug = ?, kind = ?, locale = ?, title = ?, summary = ?,
              body_md = ?, payload = CAST(? AS JSON), sort_order = ?,
              published_at = IF(?, COALESCE(published_at, NOW()), NULL)
          WHERE id = ? AND deleted_at IS NULL`,
    args: [
      input.slug,
      input.kind,
      input.locale,
      input.title.slice(0, ARTICLE_TITLE_MAX),
      input.summary.slice(0, ARTICLE_SUMMARY_MAX),
      input.bodyMd,
      input.payload,
      input.sortOrder,
      publish ? 1 : 0,
      id,
    ],
  };
}

/* Soft delete (posts convention): set deleted_at, keep the physical
   row. */
export function softDeleteArticleQuery(id: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `UPDATE articles SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    args: [id],
  };
}

/* ---- DB assembly (permissions in the action layer: login + admin/mod,
   reusing featured.canModerate) ---- */

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
    payloadRaw: r.payload ?? null,
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
    /* Edit state yields JSON text (the driver may already have parsed an
       object); no payload yields an empty string. */
    payload:
      r.payload === null || r.payload === undefined
        ? ""
        : typeof r.payload === "string"
          ? r.payload
          : JSON.stringify(r.payload, null, 2),
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

/* Fetch old values (slug + payload.series) by row id: called before an
   update to invalidate the old slug's detail page and both series pages
   — after a rename or series change, stale caches on old paths would
   keep serving outdated content. Drafts/unpublished included
   (invalidation ignores state). */
export async function getArticleSlugAndSeriesById(
  id: number,
): Promise<{ slug: string; series: string | null } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT slug, payload->>'$.series' AS series FROM articles WHERE id = ? LIMIT 1",
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const series = r.series === null || r.series === undefined ? null : String(r.series);
  return { slug: String(r.slug), series: series && series.length > 0 ? series : null };
}
