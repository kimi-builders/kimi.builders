/* 每周精选 v0(P1-7):编辑(admin/mod)的人为定夺 —— 一个编辑、一句话理由、
   一个位置,署名到具体的人。精选是叠加在算法 feed 之上的位置,不替换热门。
   posts/works 上 featured_at 非空即精选态,取消时三字段一起清空。
   权限判断 / 理由校验 / 查询构建 / 混排合并是纯函数(单测直接测),
   DB 读写在文件下半部分组装;查询风格对齐 ./posts、./works。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { plainExcerpt } from "./format";

/* 精选操作权限:users.role 为 admin / mod。 */
export function canModerate(role: string | null | undefined): boolean {
  return role === "admin" || role === "mod";
}

export const FEATURED_REASON_MAX = 280;

/* 理由必填、≤280 字;合法返回 trim 后的文本,否则 null。 */
export function normalizeFeaturedReason(raw: string): string | null {
  const reason = raw.trim();
  if (!reason || reason.length > FEATURED_REASON_MAX) return null;
  return reason;
}

/* 精选条目(帖子/作品统一视图):右栏 widget 与首页精选位共用。 */
export interface FeaturedItem {
  kind: "post" | "work";
  id: number;
  href: string; // 帖子 → /community/<id>;作品 → 作品链接(无链接 → /works)
  external: boolean; // href 是站外链接(作品直达,新窗口打开)
  title: string; // 帖子标题(无标题回落正文摘要)/ 作品名
  excerpt: string; // 帖子摘要 / 作品 tagline
  author: string; // @handle 或 awesome 条目的外部作者名
  authorHref: string | null; // 站内作者主页;外部作者为 null
  reason: string; // 精选理由(编辑填写)
  editorHandle: string; // 定夺编辑;编辑账号缺失时为空串(展示侧容错跳过)
  featuredAt: Date;
}

/* 最新精选帖子:联 users 两次 —— 作者(u)+ 定夺编辑(e)。
   私密帖不进精选位:即便误标,列表查询也不露出。 */
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

/* 最新精选作品:站内作者(u 可空 = awesome 外部条目)+ 定夺编辑(e)。
   私密作品不进精选位:即便误标,列表查询也不露出(同 featuredPostsQuery)。 */
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
    /* 标题非强制:无标题帖回退到正文摘要(同 feed) */
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

/* 帖子 + 作品混排:按精选时间倒序取前 limit。 */
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

/* 混排取前 limit:两路各取 limit 再合并裁剪。 */
export async function getFeaturedFeed(limit = 6): Promise<FeaturedItem[]> {
  const [posts, works] = await Promise.all([
    getFeaturedPosts(limit),
    getFeaturedWorks(limit),
  ]);
  return mergeFeatured(posts, works, limit);
}

/* 详情页徽章/操作态:当前帖的精选信息(未精选 → null)。 */
export async function getPostFeatured(
  postId: number,
): Promise<{ reason: string; editorHandle: string | null; at: Date } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.featured_at, p.featured_reason, e.handle AS editor_handle
     FROM posts p LEFT JOIN users e ON e.id = p.featured_by
     WHERE p.id = ? AND p.featured_at IS NOT NULL LIMIT 1`,
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

/* ---- 写操作(权限校验在 action 层:登录 + admin/mod,理由 normalizeFeaturedReason)---- */

/* 设精选:私密/已删/被屏蔽帖不可精选(WHERE 钉死,affectedRows=0 即失败)。 */
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

/* 设精选(作品):私密/被屏蔽作品不可精选(WHERE 钉死,affectedRows=0 即失败;同帖子口径)。 */
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
