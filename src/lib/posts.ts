/* 社区帖子的查询与变更。所有时间落库即 UTC(见 db.ts)。
   列表只取展示字段;正文只在详情页取。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { CATEGORIES, type CategoryId } from "./categories";
import { plainExcerpt } from "./format";

export { CATEGORIES, categoryLabel } from "./categories";
export type { CategoryId } from "./categories";

export interface FeedPost {
  id: number;
  type: string;
  category: string;
  title: string;
  excerpt: string;
  visibility: string;
  score: number;
  commentCount: number;
  createdAt: Date;
  handle: string;
  name: string;
  avatarUrl: string;
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

export interface CommentRow {
  id: number;
  parentId: number | null;
  userId: number | null;
  isAi: boolean;
  bodyMd: string;
  score: number;
  createdAt: Date;
  editedAt: Date | null;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
}

function mapFeed(r: RowDataPacket): FeedPost {
  return {
    id: Number(r.id),
    type: r.type,
    category: r.category,
    title: r.title,
    excerpt: r.body_excerpt ? plainExcerpt(r.body_excerpt) : "",
    visibility: r.visibility,
    score: Number(r.score),
    commentCount: Number(r.comment_count),
    createdAt: r.created_at,
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
  };
}

/* feed:热门 = (赞 + 评论×2) / (小时+2)^1.5,取前 50;最新按时间。
   subscriberId 给「订阅」页签用:只看自己订阅过的帖子。
   viewerId(登录浏览者):私密帖仅作者本人可见;被 viewer 点踩的帖从其 feed 消失。 */
export async function getFeed(opts: {
  sort: "hot" | "new";
  category?: string;
  subscriberId?: number;
  viewerId?: number;
}): Promise<FeedPost[]> {
  const where = ["p.deleted_at IS NULL"];
  const args: (string | number)[] = [];
  let join = "JOIN users u ON u.id = p.user_id";
  if (opts.viewerId) {
    where.push("(p.visibility = 'public' OR p.user_id = ?)");
    args.push(opts.viewerId);
    where.push(
      "NOT EXISTS (SELECT 1 FROM reactions rd WHERE rd.target_type = 'post' AND rd.target_id = p.id AND rd.user_id = ? AND rd.kind = 'down')",
    );
    args.push(opts.viewerId);
  } else {
    where.push("p.visibility = 'public'");
  }
  if (opts.subscriberId) {
    join += " JOIN post_subscriptions ps ON ps.post_id = p.id AND ps.user_id = ?";
    args.push(opts.subscriberId);
  }
  if (opts.category && CATEGORIES.some((c) => c.id === opts.category)) {
    where.push("p.category = ?");
    args.push(opts.category);
  }
  /* comment_count 是 UNSIGNED、score 是有符号:混合运算会被 MySQL 整体提升成
     UNSIGNED,负分帖直接 ER_DATA_OUT_OF_RANGE(整站 500)—— CAST 成 SIGNED 再算。 */
  const order =
    opts.sort === "new"
      ? "p.created_at DESC"
      : "(p.score + CAST(p.comment_count AS SIGNED) * 2) / POW(TIMESTAMPDIFF(HOUR, p.created_at, NOW()) + 2, 1.5) DESC, p.created_at DESC";
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.id, p.type, p.category, p.title, LEFT(p.body_md, 500) AS body_excerpt,
            p.visibility, p.score, p.comment_count, p.created_at,
            u.handle, u.name, u.avatar_url
     FROM posts p ${join}
     WHERE ${where.join(" AND ")}
     ORDER BY ${order} LIMIT 50`,
    args,
  );
  return rows.map(mapFeed);
}

export async function getPost(id: number): Promise<PostDetail | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.type, p.category, p.title, p.body_md, p.link_url,
            p.lang, p.ai_reply, p.visibility, p.score, p.comment_count,
            p.view_count, p.created_at, p.edited_at,
            u.handle, u.name, u.avatar_url
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
}

/* showAi=false 时过滤 AI 回复(v2 决策 3 的浏览侧开关)。 */
export async function getComments(
  postId: number,
  opts: { showAi: boolean },
): Promise<CommentRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT c.id, c.parent_id, c.user_id, c.is_ai, c.body_md, c.score,
            c.created_at, c.edited_at,
            u.handle, u.name, u.avatar_url
     FROM comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.deleted_at IS NULL ${opts.showAi ? "" : "AND c.is_ai = 0"}
     ORDER BY c.created_at ASC LIMIT 200`,
    [postId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    userId: r.user_id === null ? null : Number(r.user_id),
    isAi: !!r.is_ai,
    bodyMd: r.body_md,
    score: Number(r.score),
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
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
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, kind FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ? AND kind IN ('up','down') LIMIT 1",
    [userId, targetType, targetId],
  );
  const cur = rows[0];
  if (cur && cur.kind === kind) {
    await pool.query("DELETE FROM reactions WHERE id = ?", [cur.id]);
  } else if (cur) {
    await pool.query("UPDATE reactions SET kind = ? WHERE id = ?", [kind, cur.id]);
  } else {
    try {
      await pool.query(
        "INSERT INTO reactions (user_id, target_type, target_id, kind) VALUES (?, ?, ?, ?)",
        [userId, targetType, targetId, kind],
      );
    } catch {
      /* 并发重复 → 唯一键挡住,忽略 */
    }
  }
  const table = targetType === "post" ? "posts" : "comments";
  await pool.query(
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
export interface SidebarData {
  hot: { id: number; title: string; commentCount: number; score: number }[];
  stats: { members: number; posts: number; comments: number };
  newMembers: { handle: string; avatarUrl: string }[];
}

export async function getSidebarData(): Promise<SidebarData> {
  const pool = getPool();
  const [hotRows, statRows, memberRows] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT id, title, LEFT(body_md, 200) AS body_excerpt, comment_count, score FROM posts
       WHERE deleted_at IS NULL AND visibility = 'public' AND created_at > NOW() - INTERVAL 7 DAY
       ORDER BY CAST(comment_count AS SIGNED) * 2 + score DESC, created_at DESC LIMIT 5`,
    ).then(([rows]) => rows),
    pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users) AS members,
         (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND visibility = 'public') AS posts,
         (SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL) AS comments`,
    ).then(([rows]) => rows),
    pool.query<RowDataPacket[]>(
      "SELECT handle, avatar_url FROM users ORDER BY id DESC LIMIT 5",
    ).then(([rows]) => rows),
  ]);
  const s = statRows[0] ?? { members: 0, posts: 0, comments: 0 };
  return {
    hot: hotRows.map((r) => ({
      id: Number(r.id),
      /* 无标题帖回退到正文摘要(标题非强制) */
      title: r.title || plainExcerpt(r.body_excerpt ?? "", 60),
      commentCount: Number(r.comment_count),
      score: Number(r.score),
    })),
    stats: {
      members: Number(s.members),
      posts: Number(s.posts),
      comments: Number(s.comments),
    },
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

/* ---- 作者自助:编辑 / 删除 / 可见性 ----
   全部在 WHERE 里钉死作者归属(rowCount=0 即越权或已删,调用方按失败处理)。 */

export async function updatePost(
  userId: number,
  postId: number,
  fields: { title: string; bodyMd: string; linkUrl: string },
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE posts SET title = ?, body_md = ?, link_url = ?, edited_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [
      fields.title.slice(0, 200),
      fields.bodyMd,
      fields.linkUrl.slice(0, 500),
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
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT post_id FROM comments WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    [commentId, userId],
  );
  if (!rows[0]) return false;
  await pool.query("UPDATE comments SET deleted_at = NOW() WHERE id = ?", [commentId]);
  await pool.query(
    "UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ?",
    [rows[0].post_id],
  );
  return true;
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

/* 某用户的帖子(主页「帖子」页签):self=true 含私密帖,访客只见公开。 */
export async function getUserPosts(
  userId: number,
  self: boolean,
): Promise<FeedPost[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.id, p.type, p.category, p.title, LEFT(p.body_md, 500) AS body_excerpt,
            p.visibility, p.score, p.comment_count, p.created_at,
            u.handle, u.name, u.avatar_url
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ? AND p.deleted_at IS NULL ${self ? "" : "AND p.visibility = 'public'"}
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
}

/* 某用户的评论(主页「评论」页签):带上所在帖标题;访客视角不含私密帖下的评论。 */
export async function getUserComments(
  userId: number,
  self: boolean,
): Promise<UserCommentRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT c.id, c.post_id, LEFT(c.body_md, 300) AS body_excerpt, c.score, c.created_at,
            p.title, LEFT(p.body_md, 200) AS post_excerpt
     FROM comments c JOIN posts p ON p.id = c.post_id
     WHERE c.user_id = ? AND c.deleted_at IS NULL AND p.deleted_at IS NULL
           ${self ? "" : "AND p.visibility = 'public'"}
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
  }));
}
