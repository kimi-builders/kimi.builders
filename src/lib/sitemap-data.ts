/* Sitemap data (app/sitemap.ts): static public routes + recent public
   content — posts, works, published articles, and registered series
   with published episodes. Visibility predicates mirror the public
   surfaces: posts/works = visibility='public' AND hidden_at IS NULL
   (posts also deleted_at IS NULL); articles = published_at IS NOT NULL
   AND deleted_at IS NULL, one URL per slug (zh/en rows share it).
   Query builders are pure; DB reads sit at the bottom and every fetch
   fails soft — the sitemap degrades to its static routes, never 500s. */
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { LEARN_SERIES } from "./learn-series";

const ORIGIN = "https://kimi.builders";

/* Per-class cap keeps the map small; newest first. */
export const SITEMAP_DYNAMIC_CAP = 500;

export const SITEMAP_STATIC_PATHS = [
  "/",
  "/community",
  "/explore",
  "/works",
  "/awesome",
  "/usage",
  "/usage/leaderboard",
  "/about",
  "/demo-night",
] as const;

export interface SitemapData {
  postIds: number[];
  workIds: number[];
  articleSlugs: string[];
  seriesSlugs: string[];
}

/* Pure assembly: one absolute URL per entry, static routes first. */
export function sitemapUrls(d: SitemapData): string[] {
  return [
    ...SITEMAP_STATIC_PATHS.map((p) => `${ORIGIN}${p}`),
    ...d.postIds.map((id) => `${ORIGIN}/community/${id}`),
    ...d.workIds.map((id) => `${ORIGIN}/works/${id}`),
    ...d.articleSlugs.map((s) => `${ORIGIN}/explore/${s}`),
    ...d.seriesSlugs.map((s) => `${ORIGIN}/explore/series/${s}`),
  ];
}

/* Registered series that actually carry published episodes (the same
   "0-episode series stay unlisted" rule as the catalog). Pure: the
   registry side of the join. */
export function sitemapSeriesSlugs(episodeSeries: string[]): string[] {
  const withEpisodes = new Set(episodeSeries);
  return LEARN_SERIES.map((s) => s.slug).filter((s) => withEpisodes.has(s));
}

/* ---- Query builders (pure) ---- */

export function sitemapPostsQuery(): string {
  return `SELECT id FROM posts
          WHERE visibility = 'public' AND hidden_at IS NULL AND deleted_at IS NULL
          ORDER BY id DESC LIMIT ${SITEMAP_DYNAMIC_CAP}`;
}

export function sitemapWorksQuery(): string {
  return `SELECT id FROM works
          WHERE visibility = 'public' AND hidden_at IS NULL
          ORDER BY id DESC LIMIT ${SITEMAP_DYNAMIC_CAP}`;
}

export function sitemapArticlesQuery(): string {
  return `SELECT DISTINCT slug FROM articles
          WHERE published_at IS NOT NULL AND deleted_at IS NULL
          ORDER BY slug LIMIT ${SITEMAP_DYNAMIC_CAP}`;
}

export function sitemapEpisodeSeriesQuery(): string {
  return `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.series')) AS series_slug
          FROM articles
          WHERE kind = 'guide' AND published_at IS NOT NULL AND deleted_at IS NULL`;
}

/* ---- DB reads (fail soft per class) ---- */

async function tryQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function emptySitemapData(): SitemapData {
  return { postIds: [], workIds: [], articleSlugs: [], seriesSlugs: [] };
}

export async function getSitemapData(): Promise<SitemapData> {
  let pool: ReturnType<typeof getPool>;
  try {
    pool = getPool();
  } catch {
    return emptySitemapData();
  }
  const [postIds, workIds, articleSlugs, episodeSeries] = await Promise.all([
    tryQuery(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(sitemapPostsQuery());
      return rows.map((r) => Number(r.id));
    }, [] as number[]),
    tryQuery(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(sitemapWorksQuery());
      return rows.map((r) => Number(r.id));
    }, [] as number[]),
    tryQuery(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(sitemapArticlesQuery());
      return rows.map((r) => String(r.slug));
    }, [] as string[]),
    tryQuery(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(sitemapEpisodeSeriesQuery());
      return rows.map((r) => String(r.series_slug)).filter((s) => s && s !== "null");
    }, [] as string[]),
  ]);
  return {
    postIds,
    workIds,
    articleSlugs,
    seriesSlugs: sitemapSeriesSlugs(episodeSeries),
  };
}
