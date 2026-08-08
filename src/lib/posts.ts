/* 社区帖子的查询与变更。所有时间落库即 UTC(见 db.ts)。
   列表只取展示字段;正文只在详情页取。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { CATEGORIES, type CategoryId } from "./categories";
import { plainExcerpt } from "./format";

export { CATEGORIES, categoryZh } from "./categories";
export type { CategoryId } from "./categories";

export interface FeedPost {
  id: number;
  type: string;
  category: string;
  title: string;
  excerpt: string;
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
}

export interface CommentRow {
  id: number;
  parentId: number | null;
  isAi: boolean;
  bodyMd: string;
  score: number;
  createdAt: Date;
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
    score: Number(r.score),
    commentCount: Number(r.comment_count),
    createdAt: r.created_at,
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
  };
}

/* feed:热门 = (赞 + 评论×2) / (小时+2)^1.5,取前 50;最新按时间。
   subscriberId 给「订阅」页签用:只看自己订阅过的帖子。 */
export async function getFeed(opts: {
  sort: "hot" | "new";
  category?: string;
  subscriberId?: number;
}): Promise<FeedPost[]> {
  const where = ["p.deleted_at IS NULL"];
  const args: (string | number)[] = [];
  let join = "JOIN users u ON u.id = p.user_id";
  if (opts.subscriberId) {
    join += " JOIN post_subscriptions ps ON ps.post_id = p.id AND ps.user_id = ?";
    args.push(opts.subscriberId);
  }
  if (opts.category && CATEGORIES.some((c) => c.id === opts.category)) {
    where.push("p.category = ?");
    args.push(opts.category);
  }
  const order =
    opts.sort === "new"
      ? "p.created_at DESC"
      : "(p.score + p.comment_count * 2) / POW(TIMESTAMPDIFF(HOUR, p.created_at, NOW()) + 2, 1.5) DESC, p.created_at DESC";
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT p.id, p.type, p.category, p.title, LEFT(p.body_md, 500) AS body_excerpt,
            p.score, p.comment_count, p.created_at,
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
            p.lang, p.ai_reply, p.score, p.comment_count, p.created_at,
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
  };
}

/* showAi=false 时过滤 AI 回复(v2 决策 3 的浏览侧开关)。 */
export async function getComments(
  postId: number,
  opts: { showAi: boolean },
): Promise<CommentRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT c.id, c.parent_id, c.is_ai, c.body_md, c.score, c.created_at,
            u.handle, u.name, u.avatar_url
     FROM comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.deleted_at IS NULL ${opts.showAi ? "" : "AND c.is_ai = 0"}
     ORDER BY c.created_at ASC LIMIT 200`,
    [postId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    isAi: !!r.is_ai,
    bodyMd: r.body_md,
    score: Number(r.score),
    createdAt: r.created_at,
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
  options: string[];
}): Promise<number> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO posts (user_id, type, category, title, body_md, link_url, lang, ai_reply)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.type,
        input.category,
        input.title.slice(0, 200),
        input.bodyMd,
        input.linkUrl.slice(0, 500),
        input.lang,
        input.aiReply ? 1 : 0,
      ],
    );
    const id = Number(res.insertId);
    for (let i = 0; i < input.options.length; i++) {
      await conn.query(
        "INSERT INTO poll_options (post_id, label, position) VALUES (?, ?, ?)",
        [id, input.options[i].slice(0, 200), i],
      );
    }
    await conn.commit();
    return id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function createComment(
  postId: number,
  userId: number,
  bodyMd: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "INSERT INTO comments (post_id, user_id, is_ai, body_md) VALUES (?, ?, 0, ?)",
    [postId, userId, bodyMd.slice(0, 10000)],
  );
  await pool.query(
    "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
    [postId],
  );
}

/* 顶/取消顶(posts.score 冗余计数,每次重算保一致)。 */
export async function toggleUp(userId: number, postId: number): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM reactions WHERE user_id = ? AND target_type = 'post' AND target_id = ? AND kind = 'up' LIMIT 1",
    [userId, postId],
  );
  if (rows[0]) {
    await pool.query("DELETE FROM reactions WHERE id = ?", [rows[0].id]);
  } else {
    try {
      await pool.query(
        "INSERT INTO reactions (user_id, target_type, target_id, kind) VALUES (?, 'post', ?, 'up')",
        [userId, postId],
      );
    } catch {
      /* 并发重复顶 → 唯一键挡住,当已顶处理 */
    }
  }
  await pool.query(
    `UPDATE posts SET score =
       (SELECT COUNT(*) FROM reactions WHERE target_type = 'post' AND target_id = ? AND kind = 'up')
     WHERE id = ?`,
    [postId, postId],
  );
}

export async function hasUpVoted(
  userId: number,
  postId: number,
): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM reactions WHERE user_id = ? AND target_type = 'post' AND target_id = ? AND kind = 'up' LIMIT 1",
    [userId, postId],
  );
  return !!rows[0];
}

/* feed 行批量取点赞态:一条 IN 查询代替每行一次(避免 N+1)。 */
export async function getUpvotedPostIds(
  userId: number,
  postIds: number[],
): Promise<Set<number>> {
  if (postIds.length === 0) return new Set();
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT target_id FROM reactions WHERE user_id = ? AND target_type = 'post' AND kind = 'up' AND target_id IN (?)",
    [userId, postIds],
  );
  return new Set(rows.map((r) => Number(r.target_id)));
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
      `SELECT id, title, comment_count, score FROM posts
       WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL 7 DAY
       ORDER BY comment_count * 2 + score DESC, created_at DESC LIMIT 5`,
    ).then(([rows]) => rows),
    pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users) AS members,
         (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS posts,
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
      title: r.title,
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
