/* Explore aggregation (monthly letters x tutorials merged; "shelf +
   lenses" redesign). The spine = series (the learn-series registry,
   curated sequences); lenses = structured facets for products
   (kb-products) and roles (kb-roles); presentation = formats
   (read/video/deck), derived from payload and body presence rather than
   stored (derived never lies: no body, no read); the long tail = tags
   (payload.tags) and the time archive. Counting/filtering/archiving are
   pure functions (unit-tested directly); lenses with 0 counts never
   render (same rule as "empty series don't ship"); DB access sits at the
   bottom, aligned with ./monthly. */
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

/* ---- Display types ---- */

/* Formats of one content unit (a unit can have several): read = article /
   video = video / deck = slides. */
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
  /* Owning tutorial series (letters are always null: the monthly is a
     periodical, never in a series). */
  series: string | null;
  tags: string[];
  /* Episode duration in minutes (guides only; letters undefined). */
  durationMin?: number;
  /* Product/role lenses (slugs; tagged in guide payloads, the letter
     contract has none -> always empty). */
  products: string[];
  roles: string[];
  /* Owning chapter (the chapter axis): inheritance payload.chapter ?? the
     series' chapter; letters never hang on a chapter -> always null. */
  chapter: string | null;
  /* Cover (payload.cover; null by default -> the list card's automatic
     chapter brick). */
  cover: string | null;
  /* Chapter-brick tone (payload.coverTone, same palette as work name
     bricks); null/theme = follow the theme; a cover image wins, the tone
     brick is the fallback. */
  coverTone: string | null;
  /* Available formats (derived from the presence of bodyMd/video/deck). */
  formats: GuideFormat[];
}

export interface TaxonomyCount {
  value: string;
  count: number;
}

/* Format derivation (derived never lies): no body, no read; no video,
   no video; no deck, no deck. read is always first (canonical text
   first). hasBody comes precomputed from SQL ((body_md IS NOT NULL AND
   TRIM(body_md)<>'') AS has_body) so lists and rails never fetch the
   LONGTEXT — one boolean is all the data plane pays. */
export function deriveFormats(
  hasBody: boolean,
  payload: unknown,
): GuideFormat[] {
  const p =
    typeof payload === "object" && payload !== null
      ? (payload as { video?: unknown; deck?: unknown })
      : {};
  const formats: GuideFormat[] = [];
  if (hasBody) formats.push("read");
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

/* ---- Pure functions: counts / filters / archive ---- */

/* Kind counts: value is the ArticleKind. */
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

/* Series counts: registered series only; empty ones don't appear (same
   as the catalog's "only series with episodes ship"). */
export function countSeries(items: ExploreItem[]): (TaxonomyCount & { slug: string })[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (i.series) counts.set(i.series, (counts.get(i.series) ?? 0) + 1);
  }
  return LEARN_SERIES.map((s) => ({ slug: s.slug, value: s.slug, count: counts.get(s.slug) ?? 0 }))
    .filter((c) => c.count > 0);
}

/* Product lens counts: vocabulary order (primary first); 0 counts never
   render chips. */
export function countByProduct(items: ExploreItem[]): TaxonomyCount[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    for (const p of i.products) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return KB_PRODUCTS
    .map((p) => ({ value: p.id, count: counts.get(p.id) ?? 0 }))
    .filter((c) => c.count > 0);
}

/* Role lens counts: same (vocabulary order, 0 counts never render). */
export function countByRoles(items: ExploreItem[]): TaxonomyCount[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    for (const r of i.roles) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return KB_ROLES
    .map((r) => ({ value: r.id, count: counts.get(r.id) ?? 0 }))
    .filter((c) => c.count > 0);
}

/* Role landing-page threshold (pure): a role needs >=3 published units
   before /explore/for/<role> may be curated — same discipline as "empty
   series don't ship": no walls of empty categories. */
export function roleLandingEligible(items: ExploreItem[], role: string): boolean {
  return items.filter((i) => i.roles.includes(role)).length >= 3;
}

/* Chapter counts (the chapter axis): four chapters in fixed order; a
   chapter's count = content resolving to it (series episodes via
   inheritance); chapters are a permanent frame — the page always renders
   all four, greying out zero counts. */
export function countByChapter(items: ExploreItem[]): TaxonomyCount[] {
  return KB_CHAPTERS.map((c) => ({
    value: c.id,
    count: items.filter((i) => i.chapter === c.id).length,
  }));
}

/* Archive: year desc -> month desc -> within a month by publish time desc
   (UTC, consistent with published_at). */
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
  /* Chapter axis (single-select; clicking again clears = param absent). */
  chapter?: string;
  /* Product/role lens (single-select; clicking again clears = param
     absent). */
  product?: string;
  role?: string;
  /* Format filter: a unit matches only if the format is available (the
     page no longer exposes the filter; the lib keeps the capability). */
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

/* Kind display names ("tutorial" as a concept is retired — guides are
   uniformly "articles"; series are one way to group content, not shown
   for now). */
export function categoryLabelOf(kind: ArticleKind, zh: boolean): string {
  if (kind === "letter") return zh ? "月刊评鉴" : "Monthly";
  return zh ? "文章" : "Article";
}

/* ---- DB: both kinds together ---- */

function mapExploreRow(r: RowDataPacket): Omit<ExploreItem, "fallback"> {
  const kind: ArticleKind = r.kind === "guide" ? "guide" : "letter";
  const payload =
    kind === "guide" ? guidePayloadFromDb(r.payload) : letterPayloadFromDb(r.payload);
  const seriesSlug = kind === "guide" ? (payload as { series?: string }).series ?? null : null;
  /* Chapter inheritance: an episode's own chapter ?? the series' registry
     chapter; letters always null. */
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
    /* Lenses: the fromDb tolerance layer already filtered invalid slugs,
       so take them directly; the letter payload contract has no lens
       fields -> always empty. */
    products: (payload as { products?: string[] }).products ?? [],
    roles: (payload as { roles?: string[] }).roles ?? [],
    chapter: (payload as { chapter?: string }).chapter ?? seriesChapter ?? null,
    cover: (payload as { cover?: string }).cover ?? null,
    coverTone: (payload as { coverTone?: string }).coverTone ?? null,
    formats: deriveFormats(!!r.has_body, payload),
  };
}

/* Language dedup (same semantics as the article engine's
   pickArticleVersions, reimplemented locally — fields differ): per slug
   pick the UI-locale version, falling back to the other language and
   marking fallback. */
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

/* React cache: the explore page, ExploreRail, and ArticleRail all need
   the same published list within one request (rails derive lens
   availability from it); dedupe keeps it one query. */
export const listExploreItems = cache(async function listExploreItems(
  uiLocale: ArticleLocale,
): Promise<ExploreItem[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT a.slug, a.kind, a.locale, a.title, a.summary,
            (a.body_md IS NOT NULL AND TRIM(a.body_md) <> '') AS has_body,
            a.published_at, a.payload, u.handle AS author_handle
     FROM articles a
     JOIN users u ON u.id = a.author_id
     WHERE a.kind IN ('letter', 'guide') AND a.published_at IS NOT NULL AND a.deleted_at IS NULL
     ORDER BY a.published_at DESC, a.id DESC`,
  );
  return pickLocaleVersions(rows.map(mapExploreRow), uiLocale);
});

/* Article detail rail (ArticleRail) metadata: single lookup by slug,
   React cache dedupes repeat calls within a request; unpublished/missing
   -> null (the rail doesn't render). Same shape as mapExploreRows
   (inheritance/lenses/formats resolved at once). */
export const getArticleRailMeta = cache(
  async (slug: string, uiLocale: ArticleLocale): Promise<ExploreItem | null> => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT a.slug, a.kind, a.locale, a.title, a.summary,
              (a.body_md IS NOT NULL AND TRIM(a.body_md) <> '') AS has_body,
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
