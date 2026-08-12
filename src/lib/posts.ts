/* 社区帖子的查询与变更。所有时间落库即 UTC(见 db.ts)。
   列表只取展示字段;正文只在详情页取。
   getPost 走 React cache:详情页与右栏元数据卡同一请求共享一次查询
   (无 dispatcher 的环境 —— 单测/server action —— 自动退化为普通调用)。 */
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
  /* 原始 markdown 前缀(LEFT(body_md,500) 截到完整行):feed 卡格式化摘要专用。 */
  bodyMd: string;
  visibility: string;
  /* 治理屏蔽(20260830):非空 = 已被管理员屏蔽;公开侧已被查询滤掉,
     只有作者本人视角会拿到非空值(卡片/详情带「已被管理员屏蔽」标注) */
  hiddenAt: Date | null;
  hiddenReason: string | null;
  score: number;
  commentCount: number;
  createdAt: Date;
  handle: string;
  name: string;
  avatarUrl: string;
  /* 作者角色(官方标记用);feed 卡不做权限判断,仅展示。 */
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

/* 帖子详情、metadata 与互动入口共用同一可见性口径:
   私密帖只对作者开放;治理屏蔽帖对作者和 admin/mod 开放。 */
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

/* 不可见帖子只能返回站点通用标题，避免浏览器标签、分享预览泄露正文或标题。 */
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

/* Server Action 的轻量门禁查询。写路径传事务连接并 FOR UPDATE，确保从判定
   到 INSERT/UPDATE 之间帖子不能被并发转私密、屏蔽或软删。 */
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

/* 评论反应/回复同时校验评论本身和父帖。被屏蔽评论只放行评论作者与管理角色；
   JOIN + FOR UPDATE 在写事务里一起锁住评论和帖子。 */
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
  /* 治理屏蔽(20260830):非空 = 已被屏蔽;公开侧已滤,仅评论作者本人视角拿到非空 */
  hiddenAt: Date | null;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/* 500 字符前缀截到最后一个完整行,避免半截 markdown 语法;单行长帖原样保留。 */
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
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
    role: r.role ?? "member",
    aiReply: !!r.ai_reply,
  };
}

/* feed 游标分页(P1-4),每页 FEED_PAGE_SIZE 条,多取 1 条判断下一页。
   三个页签排序键不同,游标各自覆盖:
   - 热门 = (赞 + 评论×2) / (小时+2)^1.5:排序键是随 NOW() 漂移的计算分,翻页时
     用页 1 钉住的基准时刻 asOf(FROM_UNIXTIME)重算,同一翻页会话内分值确定;
     键 = (hot DESC, id DESC),复合游标 "asOf|hot|id"。
   - 最新/订阅按时间:id 自增随 created_at 单调(同评论分页),游标就是帖子 id。
   subscriberId 给「订阅」页签用:只看自己订阅过的帖子,按时间倒序。
   viewerId(登录浏览者):私密帖仅作者本人可见;被 viewer 点踩的帖从其 feed 消失。 */
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

/* 严格解析;非法游标返回 null(调用方按「没有下一页」处理,不静默回退到首页)。 */
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

/* comment_count 是 UNSIGNED、score 是有符号:混合运算会被 MySQL 整体提升成
   UNSIGNED,负分帖直接 ER_DATA_OUT_OF_RANGE(整站 500)—— CAST 成 SIGNED 再算。 */
function hotExpr(asOf: number): string {
  return `(p.score + CAST(p.comment_count AS SIGNED) * 2) / POW(TIMESTAMPDIFF(HOUR, p.created_at, FROM_UNIXTIME(${asOf})) + 2, 1.5)`;
}

export function feedPageQuery(opts: {
  sort: "hot" | "new";
  category?: string;
  subscriberId?: number;
  viewerId?: number;
  cursor?: FeedCursor | null;
  /* 热门页 1 的基准时刻(unix 秒);翻页页以游标里的 asOf 为准 */
  asOf?: number;
}): { sql: string; args: (string | number)[] } {
  const where = ["p.deleted_at IS NULL"];
  const args: (string | number)[] = [];
  let join = "JOIN users u ON u.id = p.user_id";
  if (opts.viewerId) {
    where.push("(p.visibility = 'public' OR p.user_id = ?)");
    args.push(opts.viewerId);
    /* 治理屏蔽:公开侧滤掉;作者本人仍可见(卡片带「已被管理员屏蔽」标注) */
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
          /* hot 为 NULL 只可能是 created_at 远超基准时刻(时钟漂移),按 0 处理 */
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
            p.view_count, p.created_at, p.edited_at,
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

/* 帖子详情右栏「相关帖子」:同板块近期公开帖(排除本帖)。
   右栏是公共上下文,只取 public 且未屏蔽 —— 别人的私密/被屏蔽帖不能借右栏漏出。 */
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
    /* 无标题帖回退到正文摘要(同 getHotPosts) */
    title: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    commentCount: Number(r.comment_count),
    score: Number(r.score),
    createdAt: r.created_at,
  }));
}

/* 评论分页:按顶层评论翻页(每页 COMMENT_PAGE_SIZE 条),该页顶层楼下的全部可见
   回复随根一起带出。游标 = 上一页最后一个顶层评论的 id(id 随 created_at 单调,
   等价时间游标且键唯一,翻页期间新增评论只追加在末尾,不会顶乱已翻过的页)。
   「可见根」在 SQL 里算(WITH RECURSIVE 沿 parent 链向上):父被软删或被 AI 过滤
   (showAi=false,v2 决策 3 的浏览侧开关)时,回复自身升级为顶层 —— 与旧全量拍平
   的兜底行为一致。子查询多取一个根判断是否还有下一页。 */
export const COMMENT_PAGE_SIZE = 50;

export interface CommentPageRow extends CommentRow {
  rootId: number;
}

export interface CommentPage {
  comments: CommentPageRow[];
  /* 可见评论总数:与列表同口径(滤软删;showAi=false 不计 AI),页面计数直接用它 */
  total: number;
  nextCursor: number | null;
}

export function commentPageQuery(
  postId: number,
  opts: { showAi: boolean; after: number; viewerId?: number },
): { sql: string; args: number[] } {
  const aiC = opts.showAi ? "" : "AND c.is_ai = 0";
  const aiP = opts.showAi ? "" : "AND p.is_ai = 0";
  /* 治理屏蔽(20260830):被屏蔽评论公开侧不可见;评论作者本人仍可见(带标注)。
     父评论对 viewer 不可见时(软删/AI 过滤/被屏蔽),回复升级为顶层 —— 与软删同语义。 */
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
       /* 派生表包裹:MySQL 不允许 IN/ALL/ANY 子查询里直接带 LIMIT(ER_NOT_SUPPORTED_YET),
          先物化出本页根再 IN */
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

/* 可见评论总数:与 commentPageQuery 同口径,两者必须一起改。 */
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
  /* 根按首次出现排序(行已按时间升序,根先于其回复出现);多取的那根连同其回复裁掉 */
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
        input.bodyMd,
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
    /* 作者自动订阅自己的帖子:有评论时收通知 */
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

/* 新评论后的通知:关注的帖子有新评论(type=comment,发给除直接 parent 作者外的订阅者)、
   我的评论被回复(type=reply,发给 parent 作者)。actor NULL = AI。 */
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
    if (uid === replyToUserId) continue; // reply 优先,不重复发 comment
    rows.push([uid, input.actorId, "comment", input.postId, input.commentId]);
  }
  if (rows.length === 0) return;
  await pool.query(
    "INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES ?",
    [rows],
  );
}

export async function createComment(
  postId: number,
  userId: number,
  bodyMd: string,
  parentId: number | null = null,
): Promise<number> {
  const pool = getPool();
  const [res] = await pool.query<ResultSetHeader>(
    "INSERT INTO comments (post_id, parent_id, user_id, is_ai, body_md) VALUES (?, ?, ?, 0, ?)",
    [postId, parentId, userId, bodyMd.slice(0, 10000)],
  );
  const id = Number(res.insertId);
  await pool.query(
    "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
    [postId],
  );
  /* 评论即自动 Follow 该帖(决策:点赞/评论都算参与讨论) */
  await pool.query(
    "INSERT IGNORE INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
    [userId, postId],
  );
  await notifyOnComment({ postId, commentId: id, actorId: userId, parentId });
  return id;
}

export interface VisibleCommentCreated {
  id: number;
  parent: VisibleCommentAccess | null;
}

/* 登录成员写评论的安全入口:事务内锁父帖并重做可见性判定，回复目标也必须
   仍属于同帖且可见。评论、冗余计数和自动订阅同事务提交。 */
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
    const [res] = await conn.query<ResultSetHeader>(
      "INSERT INTO comments (post_id, parent_id, user_id, is_ai, body_md) VALUES (?, ?, ?, 0, ?)",
      [postId, parentId, viewer.id, bodyMd.slice(0, 10000)],
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

/* 回复前校验 + AI 触发判断:返回目标评论概况;不存在/跨帖/已删除 → null。 */
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

/* 顶/踩(posts.score / comments.score = 顶-踩 净分,每次重算保一致)。
   切换语义:点同向 = 取消;点反向 = 换边(删旧存新)。 */
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
      /* 并发重复 → 唯一键挡住,忽略 */
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

export async function setPostReaction(
  userId: number,
  postId: number,
  kind: "up" | "down",
): Promise<void> {
  await setReaction(userId, "post", postId, kind);
  /* 点赞即自动 Follow(点踩不算参与,不订阅) */
  if (kind === "up") {
    await getPool().query(
      "INSERT IGNORE INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
      [userId, postId],
    );
  }
}

export async function setCommentReaction(
  userId: number,
  commentId: number,
  kind: "up" | "down",
): Promise<void> {
  await setReaction(userId, "comment", commentId, kind);
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

/* 批量取 reaction 态(feed 行 / 评论列表用,一条 IN 查询避免 N+1)。 */
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

/* 订阅=重点关注这个帖子的讨论;通知通道(回帖提醒)后补,先存关系。 */
export async function toggleSubscribe(
  userId: number,
  postId: number,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM post_subscriptions WHERE user_id = ? AND post_id = ? LIMIT 1",
    [userId, postId],
  );
  if (rows[0]) {
    await pool.query(
      "DELETE FROM post_subscriptions WHERE user_id = ? AND post_id = ?",
      [userId, postId],
    );
  } else {
    try {
      await pool.query(
        "INSERT INTO post_subscriptions (user_id, post_id) VALUES (?, ?)",
        [userId, postId],
      );
    } catch {
      /* 并发重复订阅 → 主键挡住,当已订阅处理 */
    }
  }
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

/* 右栏 widget 数据:7 日热门 / 社区数据 / 新成员,三条小查询。 */
export interface HotPost {
  id: number;
  title: string;
  commentCount: number;
  score: number;
}

/* 7 日热门(评论×2 + 净分):右栏 widget 与首页精选位的空态回落共用。
   公共上下文:仅公开且未被屏蔽。 */
export async function getHotPosts(limit = 5): Promise<HotPost[]> {
  const n = Math.max(1, Math.min(20, Math.floor(limit)));
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, title, LEFT(body_md, 200) AS body_excerpt, comment_count, score FROM posts
     WHERE deleted_at IS NULL AND visibility = 'public' AND hidden_at IS NULL AND created_at > NOW() - INTERVAL 7 DAY
     ORDER BY CAST(comment_count AS SIGNED) * 2 + score DESC, created_at DESC LIMIT ${n}`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    /* 无标题帖回退到正文摘要(标题非强制) */
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

/* 社区总量(成员 / 公开帖 / 评论):右栏「社区数据」与首页数据条共用。
   公共口径:公开、未软删且未被屏蔽。 */
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

/* 一人一票(整个投票维度);投过即返回 "voted"。 */
export async function votePoll(
  userId: number,
  postId: number,
  optionId: number,
): Promise<"ok" | "voted" | "bad_option"> {
  const pool = getPool();
  const [opt] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM poll_options WHERE id = ? AND post_id = ? LIMIT 1",
    [optionId, postId],
  );
  if (!opt[0]) return "bad_option";
  const [dup] = await pool.query<RowDataPacket[]>(
    `SELECT v.id FROM poll_votes v JOIN poll_options o ON o.id = v.option_id
     WHERE o.post_id = ? AND v.user_id = ? LIMIT 1`,
    [postId, userId],
  );
  if (dup[0]) return "voted";
  try {
    await pool.query(
      "INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)",
      [optionId, userId],
    );
  } catch {
    return "voted"; // 唯一键撞了 = 已投过
  }
  await pool.query(
    "UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = ?",
    [optionId],
  );
  return "ok";
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

/* ---- 作者自助:编辑 / 删除 / 可见性 ----
   全部在 WHERE 里钉死作者归属(rowCount=0 即越权或已删,调用方按失败处理)。 */

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
      fields.bodyMd,
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
    /* 屏蔽时已从公开冗余计数移除，作者再删除不能二次扣减。 */
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

/* 浏览量:只记录,不展示(详情页渲染后经 after() 写入)。 */
export async function incrementViewCount(postId: number): Promise<void> {
  await getPool().query(
    "UPDATE posts SET view_count = view_count + 1 WHERE id = ?",
    [postId],
  );
}

/* ---- 消息通知 ---- */

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
  postId: number;
  postTitle: string;
  commentId: number;
  createdAt: Date;
  actorHandle: string | null;
  actorAvatar: string | null;
}

export async function getNotifications(
  userId: number,
): Promise<NotificationRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT n.id, n.type, n.post_id, n.comment_id, n.created_at,
            p.title, LEFT(p.body_md, 200) AS body_excerpt,
            u.handle AS actor_handle, u.avatar_url AS actor_avatar
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     JOIN posts p ON p.id = n.post_id
     WHERE n.user_id = ?
     ORDER BY n.id DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    postId: Number(r.post_id),
    postTitle: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
    commentId: Number(r.comment_id),
    createdAt: r.created_at,
    actorHandle: r.actor_handle,
    actorAvatar: r.actor_avatar,
  }));
}

/* 打开消息页即全部已读。 */
export async function markNotificationsRead(userId: number): Promise<void> {
  await getPool().query(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL",
    [userId],
  );
}

/* ---- 个人主页 ---- */

/* 某用户的帖子(主页「帖子」页签):self=true 含私密帖与被屏蔽帖(带标注),
   访客只见公开且未被屏蔽的。 */
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
  /* 治理屏蔽(20260830):评论被屏蔽或所在帖被屏蔽;仅本人视角含这类行(带标注) */
  hidden: boolean;
}

/* 某用户的评论(主页「评论」页签):带上所在帖标题;访客视角不含私密帖下的评论,
   也不含被屏蔽的评论/被屏蔽帖下的评论;本人视角含(带「已被管理员屏蔽」标注)。 */
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
