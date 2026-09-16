/* Global content search (⌘K modal) — pure helpers shared by the API
   route and the client modal. LIKE-based title/summary lookup across
   four public object families (posts, works, articles, members); scope
   matches the "first pass covers 80%" bar from the product review —
   no full-text engine, no ranking beyond recency. This module must
   stay import-safe for client bundles (no DB imports); the queries
   live in the API route. */

export const CONTENT_SEARCH_MIN = 2;
export const CONTENT_SEARCH_MAX = 64;

/* LIKE patterns must neutralize user wildcards, or "100%" matches
   everything and "_" matches any char. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function contentSearchPattern(q: string): string {
  return `%${escapeLike(q.trim())}%`;
}

/* Query gate: the modal only asks the server once the input is long
   enough to be meaningful; the server re-checks (never trust the
   client). */
export function isSearchableQuery(q: string): boolean {
  const trimmed = q.trim();
  return trimmed.length >= CONTENT_SEARCH_MIN && trimmed.length <= CONTENT_SEARCH_MAX;
}

export interface ContentHit {
  href: string;
  label: string;
  description: string;
}

export interface ContentSearchResults {
  posts: ContentHit[];
  works: ContentHit[];
  articles: ContentHit[];
  users: ContentHit[];
}

export const EMPTY_CONTENT_RESULTS: ContentSearchResults = {
  posts: [],
  works: [],
  articles: [],
  users: [],
};
