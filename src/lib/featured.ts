/* Weekly featured v0: an editorial (admin/mod) human decision — one
   editor, one-line reason, one slot, attributed to a person. Featuring is
   a slot layered on top of the algorithmic feed, never a replacement for
   hot. A non-null featured_at on posts/works means featured; clearing
   empties all three columns together. Permission check / reason
   validation / query building / merge are pure functions (unit-tested
   directly); DB access is assembled in the lower half, style aligned with
   ./posts and ./works. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { plainExcerpt } from "./format";

/* Featuring permission: users.role of admin / mod. */
export function canModerate(role: string | null | undefined): boolean {
  return role === "admin" || role === "mod";
}

export const FEATURED_REASON_MAX = 280;

/* Reason required, <= 280 chars; returns the trimmed text when valid,
   else null. */
export function normalizeFeaturedReason(raw: string): string | null {
  const reason = raw.trim();
  if (!reason || reason.length > FEATURED_REASON_MAX) return null;
  return reason;
}

/* Featured entries (posts/works in one view): shared by the rail widget
   and the home featured slot. */
export interface FeaturedItem {
  kind: "post" | "work";
  id: number;
  href: string; // post -> /community/<id>; work -> its link (or /works
                // when none)
  external: boolean; // href is an external link (works with a URL open
                      // in a new tab)
  title: string; // post title (falls back to a body excerpt) / work name
  excerpt: string; // post excerpt / work tagline
  author: string; // @handle or the awesome entry's external author name
  authorHref: string | null; // on-site profile path; null for external
                              // authors
  reason: string; // featuring reason (written by the editor)
  editorHandle: string; // deciding editor; empty string when the account
                         // is gone (display tolerates and skips)
  featuredAt: Date;
}

/* Latest featured posts: joins users twice — author (u) + deciding editor
   (e). Private posts never reach the featured slot: even a mislabel
   cannot leak, the list query filters it. */
export function featuredPostsQuery(limit: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `SELECT p.id, p.title, LEFT(p.body_md, 300) AS body_excerpt,
                 p.featured_at, p.featured_reason,
                 u.handle AS author_handle, e.handle AS editor_handle
          FROM posts p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN users e ON e.id = p.featured_by
          WHERE p.deleted_at IS NULL AND p.visibility = 'public' AND p.hidden_at IS NULL
                AND p.featured_at IS NOT NULL
          ORDER BY p.featured_at DESC, p.id DESC LIMIT ?`,
    args: [limit],
  };
}

/* Latest featured works: on-site author (u nullable = awesome external
   entry) + deciding editor (e). Private works never reach the slot (same
   as featuredPostsQuery). */
export function featuredWorksQuery(limit: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `SELECT w.id, w.name, w.tagline, w.url, w.repo_url, w.author_label,
                 w.featured_at, w.featured_reason,
                 u.handle AS author_handle, e.handle AS editor_handle
          FROM works w
          LEFT JOIN users u ON u.id = w.user_id
          LEFT JOIN users e ON e.id = w.featured_by
          WHERE w.featured_at IS NOT NULL AND w.visibility = 'public' AND w.hidden_at IS NULL
          ORDER BY w.featured_at DESC, w.id DESC LIMIT ?`,
    args: [limit],
  };
}

function mapFeaturedPost(r: RowDataPacket): FeaturedItem {
  const id = Number(r.id);
  return {
    kind: "post",
    id,
    href: `/community/${id}`,
    external: false,
    /* Titles are optional: untitled posts fall back to a body excerpt
       (same as the feed). */
    title: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    excerpt: r.title ? plainExcerpt(r.body_excerpt ?? "", 140) : "",
    author: `@${r.author_handle}`,
    authorHref: `/u/${r.author_handle}`,
    reason: r.featured_reason ?? "",
    editorHandle: r.editor_handle ?? "",
    featuredAt: r.featured_at,
  };
}

function mapFeaturedWork(r: RowDataPacket): FeaturedItem {
  const id = Number(r.id);
  const url: string = r.url || r.repo_url || "";
  return {
    kind: "work",
    id,
    href: url || "/works",
    external: !!url,
    title: r.name,
    excerpt: r.tagline ?? "",
    author: r.author_handle ? `@${r.author_handle}` : r.author_label,
    authorHref: r.author_handle ? `/u/${r.author_handle}` : null,
    reason: r.featured_reason ?? "",
    editorHandle: r.editor_handle ?? "",
    featuredAt: r.featured_at,
  };
}

/* Posts + works merged: top limit by featured time, newest first. */
export function mergeFeatured(
  posts: FeaturedItem[],
  works: FeaturedItem[],
  limit: number,
): FeaturedItem[] {
  return [...posts, ...works]
    .sort((a, b) => b.featuredAt.getTime() - a.featuredAt.getTime())
    .slice(0, limit);
}

export async function getFeaturedPosts(limit = 5): Promise<FeaturedItem[]> {
  const q = featuredPostsQuery(limit);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map(mapFeaturedPost);
}

export async function getFeaturedWorks(limit = 5): Promise<FeaturedItem[]> {
  const q = featuredWorksQuery(limit);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map(mapFeaturedWork);
}

/* Merged top limit: each side fetches limit, then merge and trim. */
export async function getFeaturedFeed(limit = 6): Promise<FeaturedItem[]> {
  const [posts, works] = await Promise.all([
    getFeaturedPosts(limit),
    getFeaturedWorks(limit),
  ]);
  return mergeFeatured(posts, works, limit);
}

/* Detail-page badge/action state: the post's featured info (null when
   unfeatured). Liveness predicates match featuredPostsQuery: deleted/
   hidden/private posts never show a badge even with a leftover featured_at
   — the slot belongs to publicly visible content only. */
export async function getPostFeatured(
  postId: number,
): Promise<{ reason: string; editorHandle: string | null; at: Date } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.featured_at, p.featured_reason, e.handle AS editor_handle
     FROM posts p LEFT JOIN users e ON e.id = p.featured_by
     WHERE p.id = ? AND p.deleted_at IS NULL AND p.visibility = 'public'
       AND p.hidden_at IS NULL AND p.featured_at IS NOT NULL LIMIT 1`,
    [postId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    reason: r.featured_reason ?? "",
    editorHandle: r.editor_handle ?? null,
    at: r.featured_at,
  };
}

/* ---- Writes (permissions in the action layer: login + admin/mod,
   reason via normalizeFeaturedReason) ---- */

/* Feature: private/deleted/hidden posts cannot be featured (pinned in
   WHERE; affectedRows=0 = failure). */
export async function setPostFeatured(
  editorId: number,
  postId: number,
  reason: string,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE posts SET featured_at = NOW(), featured_reason = ?, featured_by = ?
     WHERE id = ? AND deleted_at IS NULL AND visibility = 'public' AND hidden_at IS NULL`,
    [reason.slice(0, FEATURED_REASON_MAX), editorId, postId],
  );
  return res.affectedRows > 0;
}

export async function clearPostFeatured(postId: number): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE posts SET featured_at = NULL, featured_reason = NULL, featured_by = NULL
     WHERE id = ? AND featured_at IS NOT NULL`,
    [postId],
  );
  return res.affectedRows > 0;
}

/* Feature (works): private/hidden works cannot be featured (pinned in
   WHERE; same as posts). */
export async function setWorkFeatured(
  editorId: number,
  workId: number,
  reason: string,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE works SET featured_at = NOW(), featured_reason = ?, featured_by = ?
     WHERE id = ? AND visibility = 'public' AND hidden_at IS NULL`,
    [reason.slice(0, FEATURED_REASON_MAX), editorId, workId],
  );
  return res.affectedRows > 0;
}

export async function clearWorkFeatured(workId: number): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE works SET featured_at = NULL, featured_reason = NULL, featured_by = NULL
     WHERE id = ? AND featured_at IS NOT NULL`,
    [workId],
  );
  return res.affectedRows > 0;
}
