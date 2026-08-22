/* Community posts: queries and mutations. All timestamps land as UTC (see
   db.ts). Lists select display fields only; the body is fetched on the
   detail page alone. getPost goes through React cache so the detail page
   and the rail metadata card share one query per request (degrades to a
   plain call without a dispatcher — unit tests / server actions). */
import { cache } from "react";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { CATEGORIES, type CategoryId } from "./categories";
import { canModerate } from "./featured";
import { plainExcerpt } from "./format";

export { CATEGORIES, categoryLabel } from "./categories";
export type { CategoryId } from "./categories";

export interface FeedPost {
  id: number;
  type: string;
  category: string;
  title: string;
  excerpt: string;
  /* Raw markdown prefix (LEFT(body_md,500) cut to the last full line);
     feed-card summaries only. */
  bodyMd: string;
  visibility: string;
  /* Moderation hiding: non-null = hidden by a moderator; filtered on
     public queries — only the author's own view receives the value
     (card/detail labeled "hidden by moderators"). */
  hiddenAt: Date | null;
  hiddenReason: string | null;
  score: number;
  commentCount: number;
  createdAt: Date;
  /* Solved: non-null = solved; the feed can filter to solved only. */
  solvedAt: Date | null;
  handle: string;
  name: string;
  avatarUrl: string;
  /* Author role (for official badges); the feed card only displays it, no
     permission logic. */
  role: string;
  aiReply: boolean;
}

export interface PostDetail extends FeedPost {
  userId: number;
  bodyMd: string;
  linkUrl: string;
  lang: string;
  aiReply: boolean;
  editedAt: Date | null;
  viewCount: number;
}

type Queryable = Pool | PoolConnection;
export type PostViewer = { id: number; role: string } | null;

/* Post detail, metadata, and interaction entry points share one visibility
   rule: private posts are author-only; moderation-hidden posts are visible
   to the author and admin/mod. */
export function canViewPost(
  post: Pick<PostDetail, "visibility" | "userId" | "hiddenAt">,
  viewer: PostViewer,
): boolean {
  if (post.visibility !== "public" && post.userId !== viewer?.id) return false;
  if (post.hiddenAt) {
    return !!viewer && (post.userId === viewer.id || canModerate(viewer.role));
  }
  return true;
}

/* A post the viewer cannot see yields only the generic site title —
   browser tabs and share previews must never leak its title or body. */
export function postMetadataTitle(
  post: Pick<PostDetail, "visibility" | "userId" | "hiddenAt" | "title" | "bodyMd">,
  viewer: PostViewer,
): string {
  if (!canViewPost(post, viewer)) return "kimi.builders";
  const name = post.title || plainExcerpt(post.bodyMd, 60);
  return `${name} — kimi.builders`;
}

export interface VisiblePostAccess {
  id: number;
  userId: number;
  visibility: string;
  hiddenAt: Date | null;
}

/* Lightweight gate query for Server Actions. Write paths pass a
   transaction connection with FOR UPDATE so the post cannot be made
   private, hidden, or soft-deleted between the check and the
   INSERT/UPDATE. */
export async function getVisiblePostAccess(
  postId: number,
  viewer: PostViewer,
  db: Queryable = getPool(),
  lock = false,
): Promise<VisiblePostAccess | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, user_id, visibility, hidden_at FROM posts
     WHERE id = ? AND deleted_at IS NULL LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [postId],
  );
  const r = rows[0];
  if (!r) return null;
  const post = {
    id: Number(r.id),
    userId: Number(r.user_id),
    visibility: String(r.visibility),
    hiddenAt: r.hidden_at ?? null,
  };
  return canViewPost(post, viewer) ? post : null;
}

export interface VisibleCommentAccess {
  id: number;
  postId: number;
  userId: number | null;
  isAi: boolean;
}

/* Comment reactions/replies validate both the comment and its parent
   post. Hidden comments pass only for the comment author and moderator
   roles; the JOIN + FOR UPDATE locks comment and post together inside the
   write transaction. */
export async function getVisibleCommentAccess(
  commentId: number,
  viewer: PostViewer,
  db: Queryable = getPool(),
  lock = false,
): Promise<VisibleCommentAccess | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.post_id, c.user_id, c.is_ai, c.hidden_at AS comment_hidden_at,
            p.user_id AS post_user_id, p.visibility, p.hidden_at AS post_hidden_at
     FROM comments c JOIN posts p ON p.id = c.post_id
     WHERE c.id = ? AND c.deleted_at IS NULL AND p.deleted_at IS NULL
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [commentId],
  );
  const r = rows[0];
  if (!r) return null;
  if (
    !canViewPost(
      {
        userId: Number(r.post_user_id),
        visibility: String(r.visibility),
        hiddenAt: r.post_hidden_at ?? null,
      },
      viewer,
    )
  )
    return null;
  const userId = r.user_id === null ? null : Number(r.user_id);
  if (
    r.comment_hidden_at &&
    !(viewer && (userId === viewer.id || canModerate(viewer.role)))
  )
    return null;
  return {
    id: Number(r.id),
    postId: Number(r.post_id),
    userId,
    isAi: !!r.is_ai,
  };
}

async function withVisiblePostLock<T>(
  postId: number,
  viewer: Exclude<PostViewer, null>,
  work: (conn: PoolConnection, post: VisiblePostAccess) => Promise<T>,
): Promise<T | null> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const post = await getVisiblePostAccess(postId, viewer, conn, true);
    if (!post) {
      await conn.rollback();
      return null;
    }
    const result = await work(conn, post);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function withVisibleCommentLock<T>(
  commentId: number,
  viewer: Exclude<PostViewer, null>,
  work: (conn: PoolConnection, comment: VisibleCommentAccess) => Promise<T>,
): Promise<T | null> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const comment = await getVisibleCommentAccess(commentId, viewer, conn, true);
    if (!comment) {
      await conn.rollback();
      return null;
    }
    const result = await work(conn, comment);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export interface CommentRow {
  id: number;
  parentId: number | null;
  userId: number | null;
  isAi: boolean;
  bodyMd: string;
  score: number;
  createdAt: Date;
  editedAt: Date | null;
  /* Moderation hiding: non-null = hidden; filtered on the public side,
     only the comment author's own view receives the value. */
  hiddenAt: Date | null;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/* Cut the 500-char prefix to the last complete line (no half markdown
   syntax); single-line long posts pass through unchanged. */
function mdPrefix(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  if (text.length < 500) return text;
  const cut = text.lastIndexOf("\n");
  return cut > 200 ? text.slice(0, cut) : text;
}

function mapFeed(r: RowDataPacket): FeedPost {
  return {
    id: Number(r.id),
    type: r.type,
    category: r.category,
    title: r.title,
    excerpt: r.body_excerpt ? plainExcerpt(r.body_excerpt) : "",
    bodyMd: mdPrefix(r.body_excerpt),
    visibility: r.visibility,
    hiddenAt: r.hidden_at ?? null,
    hiddenReason: r.hidden_reason ?? null,
    score: Number(r.score),
    commentCount: Number(r.comment_count),
    createdAt: r.created_at,
    solvedAt: r.solved_at ?? null,
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
    role: r.role ?? "member",
    aiReply: !!r.ai_reply,
  };
}

/* Feed cursor pagination: FEED_PAGE_SIZE rows per page plus one extra to
   detect the next. Three tabs, three cursor schemes:
   - hot = (ups + comments*2) / (hours+2)^1.5: the score drifts with NOW(),
     so paging recomputes against the asOf baseline pinned on page 1
     (FROM_UNIXTIME) — scores stay fixed within one paging session; key =
     (hot DESC, id DESC), composite cursor "asOf|hot|id".
   - new/subscribed paginate by time: auto-increment id tracks created_at
     monotonically (as with comments), so the cursor is just the post id.
   subscriberId serves the "subscribed" tab: only posts the viewer
   subscribed to, newest first. viewerId (logged in): private posts are
   author-only; posts the viewer down-voted disappear from their feed. */
/* Post body cap: the action layer reports a friendly error; this slice is
   the write-side backstop (edit consoles / internal calls bypassing the
   action still cannot land unbounded LONGTEXT). 100k characters is a sane
   ceiling for long-form markdown, far above real usage. */
export const POST_BODY_MAX = 100_000;

export const FEED_PAGE_SIZE = 50;

export interface FeedCursor {
  id: number;
  hot?: number;
  asOf?: number;
}

export function encodeFeedCursor(c: FeedCursor): string {
  return c.hot !== undefined && c.asOf !== undefined
    ? `${c.asOf}|${c.hot}|${c.id}`
    : String(c.id);
}

/* Strict parse; an invalid cursor returns null (callers treat as "no next
   page" — never a silent fallback to page one). */
export function decodeFeedCursor(raw: string, hot: boolean): FeedCursor | null {
  if (hot) {
    const m = /^(\d{1,12})\|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\|(\d{1,20})$/.exec(raw);
    if (!m) return null;
    const asOf = Number(m[1]);
    const score = Number(m[2]);
    const id = Number(m[3]);
    if (!Number.isSafeInteger(asOf) || asOf <= 0) return null;
    if (!Number.isFinite(score)) return null;
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return { id, hot: score, asOf };
  }
  if (!/^\d{1,20}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? { id } : null;
}

/* comment_count is UNSIGNED and score is signed: mixed arithmetic gets
   promoted to UNSIGNED by MySQL and a negative score ER_DATA_OUT_OF_RANGEs
   (a site-wide 500) — CAST to SIGNED before computing. */
function hotExpr(asOf: number): string {
  return `(p.score + CAST(p.comment_count AS SIGNED) * 2) / POW(TIMESTAMPDIFF(HOUR, p.created_at, FROM_UNIXTIME(${asOf})) + 2, 1.5)`;
}

export function feedPageQuery(opts: {
  sort: "hot" | "new";
  category?: string;
  /* Solved only: posts with non-null solved_at. */
  solved?: boolean;
  subscriberId?: number;
  viewerId?: number;
  cursor?: FeedCursor | null;
  /* Hot page 1's baseline instant (unix seconds); later pages use the asOf
     from the cursor. */
  asOf?: number;
}): { sql: string; args: (string | number)[] } {
  const where = ["p.deleted_at IS NULL"];
  const args: (string | number)[] = [];
  let join = "JOIN users u ON u.id = p.user_id";
  if (opts.viewerId) {
    where.push("(p.visibility = 'public' OR p.user_id = ?)");
    args.push(opts.viewerId);
    /* Moderation-hidden: filtered publicly; the author still sees their own
       card (labeled "hidden by moderators"). */
    where.push("(p.hidden_at IS NULL OR p.user_id = ?)");
    args.push(opts.viewerId);
    where.push(
      "NOT EXISTS (SELECT 1 FROM reactions rd WHERE rd.target_type = 'post' AND rd.target_id = p.id AND rd.user_id = ? AND rd.kind = 'down')",
    );
    args.push(opts.viewerId);
  } else {
    where.push("p.visibility = 'public'");
    where.push("p.hidden_at IS NULL");
  }
  if (opts.subscriberId) {
    join += " JOIN post_subscriptions ps ON ps.post_id = p.id AND ps.user_id = ?";
    args.push(opts.subscriberId);
  }
  if (opts.category && CATEGORIES.some((c) => c.id === opts.category)) {
    where.push("p.category = ?");
    args.push(opts.category);
  }
  if (opts.solved) where.push("p.solved_at IS NOT NULL");
  const hot = opts.sort === "hot" && !opts.subscriberId;
  let selectHot = "";
  let order: string;
  if (hot) {
    const asOf = opts.cursor?.asOf ?? opts.asOf ?? 0;
    const expr = hotExpr(asOf);
    selectHot = `, ${expr} AS hot`;
    if (opts.cursor?.hot !== undefined) {
      where.push(`(${expr} < ? OR (${expr} = ? AND p.id < ?))`);
      args.push(opts.cursor.hot, opts.cursor.hot, opts.cursor.id);
    }
    order = "hot DESC, p.id DESC";
  } else {
    if (opts.cursor) {
      where.push("p.id < ?");
      args.push(opts.cursor.id);
    }
    order = "p.created_at DESC, p.id DESC";
  }
  return {
    sql: `SELECT p.id, p.type, p.category, p.title, LEFT(p.body_md, 500) AS body_excerpt,
            p.visibility, p.hidden_at, p.hidden_reason, p.score, p.comment_count, p.created_at, p.ai_reply,
            p.solved_at,
            u.handle, u.name, u.avatar_url, u.role${selectHot}
     FROM posts p ${join}
     WHERE ${where.join(" AND ")}
     ORDER BY ${order} LIMIT ${FEED_PAGE_SIZE + 1}`,
    args,
  };
}

export interface FeedPage {
  posts: FeedPost[];
  nextCursor: string | null;
}

export async function getFeedPage(opts: {
  sort: "hot" | "new";
  category?: string;
  solved?: boolean;
  subscriberId?: number;
  viewerId?: number;
  after?: string;
}): Promise<FeedPage> {
  const hot = opts.sort === "hot" && !opts.subscriberId;
  const cursor = opts.after !== undefined ? decodeFeedCursor(opts.after, hot) : null;
  if (opts.after !== undefined && cursor === null) {
    return { posts: [], nextCursor: null };
  }
  const asOf = cursor?.asOf ?? Math.floor(Date.now() / 1000);
  const q = feedPageQuery({ ...opts, cursor, asOf });
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const kept = rows.length > FEED_PAGE_SIZE ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  let nextCursor: string | null = null;
  if (rows.length > FEED_PAGE_SIZE && kept.length > 0) {
    const last = kept[kept.length - 1];
    nextCursor = hot
      ? encodeFeedCursor({
          asOf,
          /* A NULL hot can only mean created_at is far ahead of the baseline
             (clock drift); treat as 0. */
          hot: last.hot === null ? 0 : Number(last.hot),
          id: Number(last.id),
        })
      : encodeFeedCursor({ id: Number(last.id) });
  }
  return { posts: kept.map(mapFeed), nextCursor };
}

export const getPost = cache(async (id: number): Promise<PostDetail | null> => {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.type, p.category, p.title, p.body_md, p.link_url,
            p.lang, p.ai_reply, p.visibility, p.hidden_at, p.hidden_reason, p.score, p.comment_count,
            p.view_count, p.created_at, p.edited_at, p.solved_at,
            u.handle, u.name, u.avatar_url, u.role
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...mapFeed(r),
    userId: Number(r.user_id),
    bodyMd: r.body_md ?? "",
    linkUrl: r.link_url,
    lang: r.lang,
    aiReply: !!r.ai_reply,
    editedAt: r.edited_at ?? null,
    viewCount: Number(r.view_count),
  };
});

/* Rail "related posts": recent public posts in the same category
   (excluding this one). The rail is a public context, public and unhidden
   only — others' private/hidden posts never leak through the rail. */
export interface RelatedPost {
  id: number;
  title: string;
  commentCount: number;
  score: number;
  createdAt: Date;
}

export function relatedPostsQuery(
  postId: number,
  category: string,
  limit = 5,
): { sql: string; args: (string | number)[] } {
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  return {
    sql: `SELECT p.id, p.title, LEFT(p.body_md, 200) AS body_excerpt,
            p.comment_count, p.score, p.created_at
     FROM posts p
     WHERE p.deleted_at IS NULL AND p.visibility = 'public' AND p.hidden_at IS NULL
           AND p.category = ? AND p.id <> ?
     ORDER BY p.created_at DESC, p.id DESC LIMIT ${n}`,
    args: [category, postId],
  };
}

export async function getRelatedPosts(
  postId: number,
  category: string,
  limit = 5,
): Promise<RelatedPost[]> {
  const q = relatedPostsQuery(postId, category, limit);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map((r) => ({
    id: Number(r.id),
    /* Untitled posts fall back to a body excerpt (same as getHotPosts). */
    title: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    commentCount: Number(r.comment_count),
    score: Number(r.score),
    createdAt: r.created_at,
  }));
}

/* Comment paging: pages of top-level comments (COMMENT_PAGE_SIZE each) with
   every visible reply under that page's roots. The cursor is the last
   top-level comment's id (ids track created_at monotonically — equivalent
   to a time cursor with a unique key; comments added while paging only
   append and never reshuffle pages seen). Visible roots are computed in
   SQL (WITH RECURSIVE walks the parent chain): when a parent is
   soft-deleted or AI-filtered (showAi=false, the v2 view-side switch), the
   reply is promoted to top level — same fallback as the old flatten-all
   behavior. The subquery fetches one extra root to detect the next page. */
export const COMMENT_PAGE_SIZE = 50;

export interface CommentPageRow extends CommentRow {
  rootId: number;
}

export interface CommentPage {
  comments: CommentPageRow[];
  /* Visible comment total: same rules as the list (soft-delete filtered;
     showAi=false excludes AI) — the page counter uses this directly. */
  total: number;
  nextCursor: number | null;
}

export function commentPageQuery(
  postId: number,
  opts: { showAi: boolean; after: number; viewerId?: number },
): { sql: string; args: number[] } {
  const aiC = opts.showAi ? "" : "AND c.is_ai = 0";
  const aiP = opts.showAi ? "" : "AND p.is_ai = 0";
  /* Moderation-hidden comments are invisible publicly; the comment author
     still sees them (labeled). When the parent is invisible to the viewer
     (soft-deleted/AI-filtered/hidden), the reply is promoted to top level —
     same semantics as soft delete. */
  const hidC = opts.viewerId
    ? "AND (c.hidden_at IS NULL OR c.user_id = ?)"
    : "AND c.hidden_at IS NULL";
  const hidP = opts.viewerId
    ? "AND (p.hidden_at IS NULL OR p.user_id = ?)"
    : "AND p.hidden_at IS NULL";
  const sql = `WITH RECURSIVE tree AS (
       SELECT c.id, c.id AS root_id
       FROM comments c
       LEFT JOIN comments p
         ON p.id = c.parent_id AND p.deleted_at IS NULL ${aiP} ${hidP}
       WHERE c.post_id = ? AND c.deleted_at IS NULL ${aiC} ${hidC}
             AND (c.parent_id IS NULL OR p.id IS NULL)
       UNION ALL
       SELECT c.id, t.root_id
       FROM comments c JOIN tree t ON c.parent_id = t.id
       WHERE c.deleted_at IS NULL ${aiC} ${hidC}
     )
     SELECT c.id, c.parent_id, c.user_id, c.is_ai, c.body_md, c.score,
            c.created_at, c.edited_at, c.hidden_at, t.root_id,
            u.handle, u.name, u.avatar_url
     FROM tree t
     JOIN comments c ON c.id = t.id
     LEFT JOIN users u ON u.id = c.user_id
     WHERE t.root_id IN (
       /* Wrapped in a derived table: MySQL forbids LIMIT directly inside
          IN/ALL/ANY subqueries (ER_NOT_SUPPORTED_YET) — materialize this
          page's roots first, then IN. */
       SELECT id FROM (
         SELECT id FROM tree WHERE id = root_id AND id > ?
         ORDER BY id ASC LIMIT ${COMMENT_PAGE_SIZE + 1}
       ) AS page_roots
     )
     ORDER BY c.created_at ASC, c.id ASC`;
  const args: number[] = [];
  if (opts.viewerId) args.push(opts.viewerId); /* hidP(anchor join) */
  args.push(postId);
  if (opts.viewerId) args.push(opts.viewerId, opts.viewerId); /* hidC anchor + recursive */
  args.push(opts.after);
  return { sql, args };
}

/* Visible comment total: same rules as commentPageQuery — the two must
   change together. */
export function commentCountQuery(
  postId: number,
  opts: { showAi: boolean; viewerId?: number },
): { sql: string; args: number[] } {
  const hid = opts.viewerId
    ? "AND (hidden_at IS NULL OR user_id = ?)"
    : "AND hidden_at IS NULL";
  return {
    sql: `SELECT COUNT(*) AS n FROM comments
          WHERE post_id = ? AND deleted_at IS NULL ${opts.showAi ? "" : "AND is_ai = 0"} ${hid}`,
    args: opts.viewerId ? [postId, opts.viewerId] : [postId],
  };
}

export async function getCommentsPage(
  postId: number,
  opts: { showAi: boolean; after?: number; viewerId?: number },
): Promise<CommentPage> {
  const count = commentCountQuery(postId, opts);
  const page = commentPageQuery(postId, {
    showAi: opts.showAi,
    after: opts.after ?? 0,
    viewerId: opts.viewerId,
  });
  const pool = getPool();
  const [countRows, rows] = await Promise.all([
    pool.query<RowDataPacket[]>(count.sql, count.args).then(([r]) => r),
    pool.query<RowDataPacket[]>(page.sql, page.args).then(([r]) => r),
  ]);
  /* Roots in first-appearance order (rows are time-ascending, a root
     precedes its replies); the extra root is dropped along with its
     replies. */
  const rootOrder: number[] = [];
  for (const r of rows) {
    const rootId = Number(r.root_id);
    if (!rootOrder.includes(rootId)) rootOrder.push(rootId);
  }
  const hasMore = rootOrder.length > COMMENT_PAGE_SIZE;
  const kept = new Set(rootOrder.slice(0, COMMENT_PAGE_SIZE));
  const comments = rows
    .filter((r) => kept.has(Number(r.root_id)))
    .map((r) => ({
      id: Number(r.id),
      parentId: r.parent_id === null ? null : Number(r.parent_id),
      userId: r.user_id === null ? null : Number(r.user_id),
      isAi: !!r.is_ai,
      bodyMd: r.body_md,
      score: Number(r.score),
      createdAt: r.created_at,
      editedAt: r.edited_at ?? null,
      hiddenAt: r.hidden_at ?? null,
      handle: r.handle,
      name: r.name,
      avatarUrl: r.avatar_url,
      rootId: Number(r.root_id),
    }));
  return {
    comments,
    total: Number(countRows[0]?.n ?? 0),
    nextCursor: hasMore ? rootOrder[COMMENT_PAGE_SIZE - 1] : null,
  };
}

/* Latest N visible comments (series discussion loop): soft-deleted and
   moderation-hidden filtered; AI comments return like the detail page's
   default (is_ai flag carried on the row); the post's own visibility is
   the caller's gate (not re-checked here). id DESC = newest first
   (comment ids track created_at). */
export function latestCommentsQuery(
  postId: number,
  limit = 3,
): { sql: string; args: number[] } {
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  return {
    sql: `SELECT c.id, c.parent_id, c.user_id, c.is_ai, c.body_md, c.score,
            c.created_at, c.edited_at, c.hidden_at,
            u.handle, u.name, u.avatar_url
     FROM comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.deleted_at IS NULL AND c.hidden_at IS NULL
     ORDER BY c.id DESC LIMIT ${n}`,
    args: [postId],
  };
}

export async function getLatestComments(
  postId: number,
  limit = 3,
): Promise<CommentRow[]> {
  const q = latestCommentsQuery(postId, limit);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map((r) => ({
    id: Number(r.id),
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    userId: r.user_id === null ? null : Number(r.user_id),
    isAi: !!r.is_ai,
    bodyMd: r.body_md,
    score: Number(r.score),
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
    hiddenAt: r.hidden_at ?? null,
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
  }));
}

export async function createPost(input: {
  userId: number;
  type: "text" | "link" | "poll";
  category: CategoryId;
  title: string;
  bodyMd: string;
  linkUrl: string;
  lang: string;
  aiReply: boolean;
  visibility: "public" | "private";
  options: string[];
}): Promise<number> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO posts (user_id, type, category, title, body_md, link_url, lang, ai_reply, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.type,
        input.category,
        input.title.slice(0, 200),
        input.bodyMd.slice(0, POST_BODY_MAX),
        input.linkUrl.slice(0, 500),
        input.lang,
        input.aiReply ? 1 : 0,
        input.visibility,
      ],
    );
    const id = Number(res.insertId);
    for (let i = 0; i < input.options.length; i++) {
      await conn.query(
        "INSERT INTO poll_options (post_id, label, position) VALUES (?, ?, ?)",
        [id, input.options[i].slice(0, 200), i],
      );
    }
    /* Authors auto-subscribe to their own posts: notified on any comment. */
    await conn.query(
      "INSERT IGNORE INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
      [input.userId, id],
    );
    await conn.commit();
    return id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* Notifications after a new comment: subscribers of the post get
   type=comment (everyone except the direct parent's author), the parent's
   author gets type=reply. actor NULL = AI. */
export async function notifyOnComment(input: {
  postId: number;
  commentId: number;
  actorId: number | null;
  parentId: number | null;
}): Promise<void> {
  const pool = getPool();
  let replyToUserId: number | null = null;
  if (input.parentId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id FROM comments WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [input.parentId],
    );
    const uid = rows[0]?.user_id;
    if (uid !== null && uid !== undefined && Number(uid) !== input.actorId) {
      replyToUserId = Number(uid);
    }
  }
  const [subs] = await pool.query<RowDataPacket[]>(
    `SELECT user_id FROM post_subscriptions
     WHERE post_id = ? AND (user_id != ? OR ? IS NULL)`,
    [input.postId, input.actorId ?? -1, input.actorId],
  );
  const rows: (number | string | null)[][] = [];
  if (replyToUserId !== null) {
    rows.push([replyToUserId, input.actorId, "reply", input.postId, input.commentId]);
  }
  for (const s of subs) {
    const uid = Number(s.user_id);
    if (uid === replyToUserId) continue; // reply wins; don't double-send
    rows.push([uid, input.actorId, "comment", input.postId, input.commentId]);
  }
  if (rows.length === 0) return;
  await pool.query(
    "INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES ?",
    [rows],
  );
}

export interface VisibleCommentCreated {
  id: number;
  parent: VisibleCommentAccess | null;
  /* Set when a same-user same-post same-text resubmission within 60
     seconds hits an existing comment (idempotent success, no new row). */
  duplicate?: boolean;
}

/* Safe comment entry for signed-in members: locks the parent post inside
   a transaction and re-runs the visibility check; the reply target must
   still belong to the same post and be visible. Comment, redundant
   counters, and auto-subscribe commit together. */
export async function createCommentForVisiblePost(
  viewer: Exclude<PostViewer, null>,
  postId: number,
  bodyMd: string,
  parentId: number | null = null,
): Promise<VisibleCommentCreated | null> {
  const created = await withVisiblePostLock(postId, viewer, async (conn) => {
    let parent: VisibleCommentAccess | null = null;
    if (parentId !== null) {
      parent = await getVisibleCommentAccess(parentId, viewer, conn, true);
      if (!parent || parent.postId !== postId) return null;
    }
    const body = bodyMd.slice(0, 10000);
    /* Server-side idempotency: the same user resubmitting the same text on
       the same post within 60 seconds counts as submitted. The client
       debounces posting, but network retries and refresh re-submits bypass
       it — no duplicate floor on a double click. */
    const [dup] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM comments
        WHERE post_id = ? AND user_id = ? AND body_md = ? AND deleted_at IS NULL
          AND created_at > TIMESTAMPADD(SECOND, -60, UTC_TIMESTAMP(3))
        LIMIT 1`,
      [postId, viewer.id, body],
    );
    if (dup[0]) return { id: Number(dup[0].id), parent, duplicate: true };
    const [res] = await conn.query<ResultSetHeader>(
      "INSERT INTO comments (post_id, parent_id, user_id, is_ai, body_md) VALUES (?, ?, ?, 0, ?)",
      [postId, parentId, viewer.id, body],
    );
    const id = Number(res.insertId);
    await conn.query(
      "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
      [postId],
    );
    await conn.query(
      "INSERT IGNORE INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
      [viewer.id, postId],
    );
    return { id, parent };
  });
  if (!created) return null;
  await notifyOnComment({
    postId,
    commentId: created.id,
    actorId: viewer.id,
    parentId,
  });
  return created;
}

/* Pre-reply validation + AI trigger check: returns the target comment's
   essentials; missing/cross-post/deleted -> null. */
export async function getCommentForReply(
  commentId: number,
  postId: number,
): Promise<{ id: number; isAi: boolean; userId: number | null } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, is_ai, user_id FROM comments WHERE id = ? AND post_id = ? AND deleted_at IS NULL LIMIT 1",
    [commentId, postId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    isAi: !!r.is_ai,
    userId: r.user_id === null ? null : Number(r.user_id),
  };
}

/* Up/down votes (posts.score / comments.score = net ups; recomputed each
   time for consistency). Toggle semantics: same direction again = cancel;
   opposite = switch (delete old, insert new). */
async function setReaction(
  userId: number,
  targetType: "post" | "comment",
  targetId: number,
  kind: "up" | "down",
  db: Queryable = getPool(),
): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id, kind FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ? AND kind IN ('up','down') LIMIT 1",
    [userId, targetType, targetId],
  );
  const cur = rows[0];
  if (cur && cur.kind === kind) {
    await db.query("DELETE FROM reactions WHERE id = ?", [cur.id]);
  } else if (cur) {
    await db.query("UPDATE reactions SET kind = ? WHERE id = ?", [kind, cur.id]);
  } else {
    try {
      await db.query(
        "INSERT INTO reactions (user_id, target_type, target_id, kind) VALUES (?, ?, ?, ?)",
        [userId, targetType, targetId, kind],
      );
    } catch {
      /* Concurrent duplicate — absorbed by the unique key, ignore. */
    }
  }
  const table = targetType === "post" ? "posts" : "comments";
  await db.query(
    `UPDATE ${table} t SET t.score =
       (SELECT COUNT(*) FROM reactions r WHERE r.target_type = ? AND r.target_id = ? AND r.kind = 'up') -
       (SELECT COUNT(*) FROM reactions r WHERE r.target_type = ? AND r.target_id = ? AND r.kind = 'down')
     WHERE t.id = ?`,
    [targetType, targetId, targetType, targetId, targetId],
  );
}

export async function setPostReactionForViewer(
  viewer: Exclude<PostViewer, null>,
  postId: number,
  kind: "up" | "down",
): Promise<boolean> {
  const changed = await withVisiblePostLock(postId, viewer, async (conn) => {
    await setReaction(viewer.id, "post", postId, kind, conn);
    if (kind === "up") {
      await conn.query(
        "INSERT IGNORE INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
        [viewer.id, postId],
      );
    }
    return true;
  });
  return changed === true;
}

export async function setCommentReactionForViewer(
  viewer: Exclude<PostViewer, null>,
  commentId: number,
  kind: "up" | "down",
): Promise<boolean> {
  const changed = await withVisibleCommentLock(commentId, viewer, async (conn) => {
    await setReaction(viewer.id, "comment", commentId, kind, conn);
    return true;
  });
  return changed === true;
}

export interface ReactionState {
  up: Set<number>;
  down: Set<number>;
}

/* Batch reaction state (feed rows / comment lists; one IN query avoids
   N+1). */
async function getReactedIds(
  userId: number,
  targetType: "post" | "comment",
  targetIds: number[],
): Promise<ReactionState> {
  if (targetIds.length === 0) return { up: new Set(), down: new Set() };
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT target_id, kind FROM reactions WHERE user_id = ? AND target_type = ? AND kind IN ('up','down') AND target_id IN (?)",
    [userId, targetType, targetIds],
  );
  const state: ReactionState = { up: new Set(), down: new Set() };
  for (const r of rows) {
    state[r.kind === "up" ? "up" : "down"].add(Number(r.target_id));
  }
  return state;
}

export function getPostReactions(
  userId: number,
  postIds: number[],
): Promise<ReactionState> {
  return getReactedIds(userId, "post", postIds);
}

export function getCommentReactions(
  userId: number,
  commentIds: number[],
): Promise<ReactionState> {
  return getReactedIds(userId, "comment", commentIds);
}

export async function toggleSubscribeForViewer(
  viewer: Exclude<PostViewer, null>,
  postId: number,
): Promise<boolean> {
  const changed = await withVisiblePostLock(postId, viewer, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT user_id FROM post_subscriptions WHERE user_id = ? AND post_id = ? LIMIT 1",
      [viewer.id, postId],
    );
    if (rows[0]) {
      await conn.query(
        "DELETE FROM post_subscriptions WHERE user_id = ? AND post_id = ?",
        [viewer.id, postId],
      );
    } else {
      await conn.query(
        "INSERT IGNORE INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
        [viewer.id, postId],
      );
    }
    return true;
  });
  return changed === true;
}

export async function isSubscribed(
  userId: number,
  postId: number,
): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM post_subscriptions WHERE user_id = ? AND post_id = ? LIMIT 1",
    [userId, postId],
  );
  return !!rows[0];
}

export interface PollData {
  options: { id: number; label: string; voteCount: number }[];
  total: number;
  myOptionId: number | null;
}

export async function getPoll(
  postId: number,
  userId: number | null,
): Promise<PollData | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, label, vote_count FROM poll_options WHERE post_id = ? ORDER BY position ASC",
    [postId],
  );
  if (!rows[0]) return null;
  let myOptionId: number | null = null;
  if (userId) {
    const [mine] = await pool.query<RowDataPacket[]>(
      `SELECT v.option_id FROM poll_votes v
       JOIN poll_options o ON o.id = v.option_id
       WHERE o.post_id = ? AND v.user_id = ? LIMIT 1`,
      [postId, userId],
    );
    if (mine[0]) myOptionId = Number(mine[0].option_id);
  }
  const options = rows.map((r) => ({
    id: Number(r.id),
    label: r.label,
    voteCount: Number(r.vote_count),
  }));
  return {
    options,
    total: options.reduce((s, o) => s + o.voteCount, 0),
    myOptionId,
  };
}

/* Rail widget data: 7-day hot / community stats / new members — three
   small queries. */
export interface HotPost {
  id: number;
  title: string;
  commentCount: number;
  score: number;
}

/* 7-day hot (comments*2 + net score): shared by the rail widget and the
   home featured slot's empty fallback. Public context: public and
   unhidden only. */
export async function getHotPosts(limit = 5): Promise<HotPost[]> {
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, title, LEFT(body_md, 200) AS body_excerpt, comment_count, score FROM posts
     WHERE deleted_at IS NULL AND visibility = 'public' AND hidden_at IS NULL AND created_at > NOW() - INTERVAL 7 DAY
     ORDER BY CAST(comment_count AS SIGNED) * 2 + score DESC, created_at DESC LIMIT ${n}`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    /* Untitled posts fall back to a body excerpt (titles are optional). */
    title: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    commentCount: Number(r.comment_count),
    score: Number(r.score),
  }));
}

export interface CommunityStats {
  members: number;
  posts: number;
  comments: number;
}

/* Community totals (members / public posts / comments): shared by the
   rail "community stats" and the home stats bar. Public definition:
   public, not soft-deleted, not hidden. */
export async function getCommunityStats(): Promise<CommunityStats> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS members,
       (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND visibility = 'public' AND hidden_at IS NULL) AS posts,
       (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id
         WHERE c.deleted_at IS NULL AND c.hidden_at IS NULL
           AND p.deleted_at IS NULL AND p.visibility = 'public' AND p.hidden_at IS NULL) AS comments`,
  );
  const s = rows[0] ?? { members: 0, posts: 0, comments: 0 };
  return {
    members: Number(s.members),
    posts: Number(s.posts),
    comments: Number(s.comments),
  };
}

export interface SidebarData {
  hot: HotPost[];
  stats: CommunityStats;
  newMembers: { handle: string; avatarUrl: string }[];
}

export async function getSidebarData(): Promise<SidebarData> {
  const [hot, stats, memberRows] = await Promise.all([
    getHotPosts(5),
    getCommunityStats(),
    getPool()
      .query<RowDataPacket[]>(
        "SELECT handle, avatar_url FROM users ORDER BY id DESC LIMIT 5",
      )
      .then(([rows]) => rows),
  ]);
  return {
    hot,
    stats,
    newMembers: memberRows.map((r) => ({
      handle: r.handle,
      avatarUrl: r.avatar_url,
    })),
  };
}

export type VisiblePollVoteResult = "ok" | "voted" | "bad_option" | "not_visible";

export async function votePollForViewer(
  viewer: Exclude<PostViewer, null>,
  postId: number,
  optionId: number,
): Promise<VisiblePollVoteResult> {
  const result = await withVisiblePostLock(postId, viewer, async (conn) => {
    const [opt] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM poll_options WHERE id = ? AND post_id = ? LIMIT 1 FOR UPDATE",
      [optionId, postId],
    );
    if (!opt[0]) return "bad_option" as const;
    const [dup] = await conn.query<RowDataPacket[]>(
      `SELECT v.id FROM poll_votes v JOIN poll_options o ON o.id = v.option_id
       WHERE o.post_id = ? AND v.user_id = ? LIMIT 1`,
      [postId, viewer.id],
    );
    if (dup[0]) return "voted" as const;
    try {
      await conn.query(
        "INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)",
        [optionId, viewer.id],
      );
    } catch {
      return "voted" as const;
    }
    await conn.query(
      "UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = ?",
      [optionId],
    );
    return "ok" as const;
  });
  return result ?? "not_visible";
}

/* ---- Author self-service: edit / delete / visibility ---- Ownership is
   pinned in WHERE (rowCount=0 means unauthorized or gone; callers treat as
   failure). */

export async function updatePost(
  userId: number,
  postId: number,
  fields: { title: string; bodyMd: string; linkUrl: string; category: string },
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE posts SET title = ?, body_md = ?, link_url = ?, category = ?, edited_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [
      fields.title.slice(0, 200),
      fields.bodyMd.slice(0, POST_BODY_MAX),
      fields.linkUrl.slice(0, 500),
      fields.category,
      postId,
      userId,
    ],
  );
  return res.affectedRows > 0;
}

export async function deletePost(userId: number, postId: number): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE posts SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    [postId, userId],
  );
  return res.affectedRows > 0;
}

export async function setPostVisibility(
  userId: number,
  postId: number,
  visibility: "public" | "private",
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE posts SET visibility = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    [visibility, postId, userId],
  );
  return res.affectedRows > 0;
}

/* Solved toggle: the author or moderation (admin/mod); affectedRows=0 =
   unauthorized/deleted. */
export async function setPostSolved(
  actor: { id: number; role: string },
  postId: number,
  solved: boolean,
): Promise<boolean> {
  const mod = canModerate(actor.role);
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE posts SET solved_at = ${solved ? "NOW()" : "NULL"}
     WHERE id = ? AND deleted_at IS NULL ${mod ? "" : "AND user_id = ?"}`,
    mod ? [postId] : [postId, actor.id],
  );
  return res.affectedRows > 0;
}

export async function updateComment(
  userId: number,
  commentId: number,
  bodyMd: string,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE comments SET body_md = ?, edited_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [bodyMd.slice(0, 10000), commentId, userId],
  );
  return res.affectedRows > 0;
}

export async function deleteComment(
  userId: number,
  commentId: number,
): Promise<boolean> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT post_id, hidden_at FROM comments
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [commentId, userId],
    );
    const target = rows[0];
    if (!target) {
      await conn.rollback();
      return false;
    }
    await conn.query("UPDATE comments SET deleted_at = NOW() WHERE id = ?", [commentId]);
    /* Already removed from the public counter when hidden; the author
       deleting afterwards must not subtract twice. */
    if (!target.hidden_at) {
      await conn.query(
        `UPDATE posts SET comment_count = GREATEST(0, CAST(comment_count AS SIGNED) - 1)
         WHERE id = ?`,
        [target.post_id],
      );
    }
    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/* View counts: recorded, never displayed (written via after() after the
   detail page renders). */
export async function incrementViewCount(postId: number): Promise<void> {
  await getPool().query(
    "UPDATE posts SET view_count = view_count + 1 WHERE id = ?",
    [postId],
  );
}

/* ---- Notifications ---- */

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export interface NotificationRow {
  id: number;
  type: string;
  /* Post notification target; work notifications (work summons) are
     null. */
  postId: number | null;
  postTitle: string;
  commentId: number | null;
  /* Work notification target (work summon reply); post notifications are
     null. */
  workId: number | null;
  workCommentId: number | null;
  workName: string | null;
  createdAt: Date;
  actorHandle: string | null;
  actorAvatar: string | null;
}

export async function getNotifications(
  userId: number,
): Promise<NotificationRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT n.id, n.type, n.post_id, n.comment_id, n.work_id, n.work_comment_id,
            n.created_at,
            p.title, LEFT(p.body_md, 200) AS body_excerpt,
            w.name AS work_name,
            u.handle AS actor_handle, u.avatar_url AS actor_avatar
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     LEFT JOIN posts p ON p.id = n.post_id
     LEFT JOIN works w ON w.id = n.work_id
     WHERE n.user_id = ?
     ORDER BY n.id DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    postId: r.post_id === null ? null : Number(r.post_id),
    postTitle: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    commentId: r.comment_id === null ? null : Number(r.comment_id),
    workId: r.work_id === null ? null : Number(r.work_id),
    workCommentId:
      r.work_comment_id === null ? null : Number(r.work_comment_id),
    workName: r.work_name ?? null,
    createdAt: r.created_at,
    actorHandle: r.actor_handle,
    actorAvatar: r.actor_avatar,
  }));
}

/* Opening the notifications page marks everything read. */
export async function markNotificationsRead(userId: number): Promise<void> {
  await getPool().query(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL",
    [userId],
  );
}

/* ---- Profile ---- */

/* A user's posts (profile "posts" tab): self=true includes private and
   hidden (labeled); visitors see public and unhidden only. */
export async function getUserPosts(
  userId: number,
  self: boolean,
): Promise<FeedPost[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.id, p.type, p.category, p.title, LEFT(p.body_md, 500) AS body_excerpt,
            p.visibility, p.hidden_at, p.hidden_reason, p.score, p.comment_count, p.created_at, p.ai_reply,
            u.handle, u.name, u.avatar_url, u.role
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ? AND p.deleted_at IS NULL ${self ? "" : "AND p.visibility = 'public' AND p.hidden_at IS NULL"}
     ORDER BY p.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(mapFeed);
}

export interface UserCommentRow {
  id: number;
  postId: number;
  postTitle: string;
  excerpt: string;
  score: number;
  createdAt: Date;
  /* Moderation-hidden: the comment or its post is hidden; only the
     owner's view includes such rows (labeled). */
  hidden: boolean;
}

/* A user's comments (profile "comments" tab) with the containing post's
   title; the visitor view excludes comments under private posts, hidden
   comments, and comments under hidden posts; the owner's view includes
   them (labeled "hidden by moderators"). */
export async function getUserComments(
  userId: number,
  self: boolean,
): Promise<UserCommentRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT c.id, c.post_id, LEFT(c.body_md, 300) AS body_excerpt, c.score, c.created_at,
            c.hidden_at AS c_hidden, p.hidden_at AS p_hidden,
            p.title, LEFT(p.body_md, 200) AS post_excerpt
     FROM comments c JOIN posts p ON p.id = c.post_id
     WHERE c.user_id = ? AND c.deleted_at IS NULL AND p.deleted_at IS NULL
           ${self ? "" : "AND p.visibility = 'public' AND c.hidden_at IS NULL AND p.hidden_at IS NULL"}
     ORDER BY c.id DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    postId: Number(r.post_id),
    postTitle: r.title || plainExcerpt(r.post_excerpt ?? "", 60),
    excerpt: plainExcerpt(r.body_excerpt ?? "", 140),
    score: Number(r.score),
    createdAt: r.created_at,
    hidden: r.c_hidden !== null || r.p_hidden !== null,
  }));
}
