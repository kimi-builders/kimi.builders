/* 作品库:社区成员用 Kimi 构建的真实作品(works 表)。
   source=site → 成员作品,上 /works 墙;source=awesome → 推荐的站外项目
   (author_label 是外部作者名),只上 /awesome。/awesome 展示全部来源。
   agents = 参与构建的 Agent 品牌键(注册表 src/lib/agents.ts)。
   作者自助增改删,归属校验钉在 SQL WHERE 里(同帖子)。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface WorkRow {
  id: number;
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  screenshotUrl: string;
  tags: string[];
  agents: string[];
  source: string;
  createdAt: Date;
  /* 站内作者(user_id 空 = awesome 外部条目,用 authorLabel) */
  userId: number | null;
  handle: string | null;
  avatarUrl: string | null;
  authorLabel: string;
  /* 每周精选 v0:featured_at 非空 = 精选态(理由/定夺编辑在 featured.ts 查询) */
  featuredAt: Date | null;
  featuredReason: string | null;
  /* 冗余计数(P1-2,随 work_votes / work_comments 写路径维护) */
  voteCount: number;
  commentCount: number;
}

function parseStrArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapWork(r: RowDataPacket): WorkRow {
  return {
    id: Number(r.id),
    name: r.name,
    tagline: r.tagline,
    url: r.url,
    repoUrl: r.repo_url,
    screenshotUrl: r.screenshot_url,
    tags: parseStrArray(r.tags),
    agents: parseStrArray(r.agents),
    source: r.source,
    createdAt: r.created_at,
    userId: r.user_id === null ? null : Number(r.user_id),
    handle: r.handle ?? null,
    avatarUrl: r.avatar_url ?? null,
    authorLabel: r.author_label,
    featuredAt: r.featured_at ?? null,
    featuredReason: r.featured_reason ?? null,
    voteCount: Number(r.vote_count ?? 0),
    commentCount: Number(r.comment_count ?? 0),
  };
}

const WORK_COLUMNS = `w.id, w.user_id, w.name, w.tagline, w.url, w.repo_url,
       w.screenshot_url, w.tags, w.agents, w.source, w.author_label, w.created_at,
       w.featured_at, w.featured_reason, w.vote_count, w.comment_count`;

const SELECT_WORKS = `SELECT ${WORK_COLUMNS},
       u.handle, u.avatar_url
     FROM works w LEFT JOIN users u ON u.id = w.user_id`;

/* 详情页(P1-2):多联一次定夺编辑(featured_by → handle,精选徽章 tooltip 署名)。 */
const SELECT_WORK_DETAIL = `SELECT ${WORK_COLUMNS},
       u.handle, u.avatar_url, e.handle AS editor_handle
     FROM works w LEFT JOIN users u ON u.id = w.user_id
     LEFT JOIN users e ON e.id = w.featured_by`;

/* 作品列表分页(P1-4):id 游标 —— id 自增随 created_at 单调(同评论分页的取舍),
   键唯一且走主键范围扫;ORDER BY w.id DESC 与原 created_at DESC 可见顺序一致。
   每页多取 1 条判断是否还有下一页。 */
export const WORKS_PAGE_SIZE = 100;
export const AWESOME_PAGE_SIZE = 200;

export interface WorksPage {
  works: WorkRow[];
  nextCursor: number | null;
}

export function worksPageQuery(opts: {
  source: "site" | "all";
  agent?: string;
  after?: number;
}): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.source === "site") where.push("w.source = 'site'");
  /* agent 非空时按参与 Agent 过滤(JSON 数组成员) */
  if (opts.agent) {
    where.push("JSON_CONTAINS(w.agents, JSON_QUOTE(?))");
    args.push(opts.agent);
  }
  if (opts.after !== undefined && Number.isSafeInteger(opts.after) && opts.after > 0) {
    where.push("w.id < ?");
    args.push(opts.after);
  }
  const size = opts.source === "site" ? WORKS_PAGE_SIZE : AWESOME_PAGE_SIZE;
  return {
    sql: `${SELECT_WORKS} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY w.id DESC LIMIT ${size + 1}`,
    args,
  };
}

async function runWorksPage(
  q: { sql: string; args: (string | number)[] },
  size: number,
): Promise<WorksPage> {
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const kept = rows.length > size ? rows.slice(0, size) : rows;
  return {
    works: kept.map(mapWork),
    nextCursor:
      rows.length > size && kept.length > 0
        ? Number(kept[kept.length - 1].id)
        : null,
  };
}

/* /works 墙:只看成员自己的作品。 */
export async function getWorksPage(after?: number): Promise<WorksPage> {
  return runWorksPage(worksPageQuery({ source: "site", after }), WORKS_PAGE_SIZE);
}

/* /awesome:全部来源。 */
export async function getAwesomeWorksPage(
  agent?: string,
  after?: number,
): Promise<WorksPage> {
  return runWorksPage(
    worksPageQuery({ source: "all", agent, after }),
    AWESOME_PAGE_SIZE,
  );
}

/* 个人主页「作品」页签:成员自有作品(source=site)。作品本来就公开,访客/本人同视图。 */
export async function getUserWorks(userId: number): Promise<WorkRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `${SELECT_WORKS} WHERE w.source = 'site' AND w.user_id = ? ORDER BY w.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(mapWork);
}

/* 徽章值:作者 opt-in 后的全部时间 token 总量;null = 完全不显示徽章
   (awesome 外部条目无站内作者 / 未 opt-in / 无数据 —— 均无负面标记)。 */
export function badgeTokensOf(
  w: Pick<WorkRow, "userId">,
  totals: Map<number, number>,
): number | null {
  if (w.userId === null) return null;
  const v = totals.get(w.userId);
  return v !== undefined && v > 0 ? v : null;
}

export async function getWork(id: number): Promise<WorkRow | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `${SELECT_WORKS} WHERE w.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapWork(rows[0]) : null;
}

export interface WorkFields {
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  screenshotUrl: string;
  tags: string[];
  agents: string[];
  authorLabel: string; // 非空 → source=awesome(推荐站外项目)
}

export async function createWork(
  userId: number,
  f: WorkFields,
): Promise<number> {
  const source = f.authorLabel ? "awesome" : "site";
  const [res] = await getPool().query<ResultSetHeader>(
    `INSERT INTO works (user_id, name, tagline, url, repo_url, screenshot_url, tags, agents, source, author_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      f.name.slice(0, 120),
      f.tagline.slice(0, 300),
      f.url.slice(0, 500),
      f.repoUrl.slice(0, 500),
      f.screenshotUrl.slice(0, 500),
      JSON.stringify(f.tags.slice(0, 5)),
      JSON.stringify(f.agents.slice(0, 10)),
      source,
      f.authorLabel.slice(0, 120),
    ],
  );
  return Number(res.insertId);
}

export async function updateWork(
  userId: number,
  workId: number,
  f: WorkFields,
): Promise<boolean> {
  const source = f.authorLabel ? "awesome" : "site";
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE works SET name = ?, tagline = ?, url = ?, repo_url = ?, screenshot_url = ?,
       tags = ?, agents = ?, source = ?, author_label = ?
     WHERE id = ? AND user_id = ?`,
    [
      f.name.slice(0, 120),
      f.tagline.slice(0, 300),
      f.url.slice(0, 500),
      f.repoUrl.slice(0, 500),
      f.screenshotUrl.slice(0, 500),
      JSON.stringify(f.tags.slice(0, 5)),
      JSON.stringify(f.agents.slice(0, 10)),
      source,
      f.authorLabel.slice(0, 120),
      workId,
      userId,
    ],
  );
  return res.affectedRows > 0;
}

export async function deleteWork(
  userId: number,
  workId: number,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM works WHERE id = ? AND user_id = ?",
    [workId, userId],
  );
  return res.affectedRows > 0;
}


/* ---- 作品详情 + 互动(P1-2)----
   支持:只有「顶」没有踩,再点取消;复合主键 (work_id, user_id) 天然幂等。
   评论:单层(无楼中楼)、软删;评论作者本人或作品作者可删,权限钉在 SQL WHERE。
   冗余计数 vote_count / comment_count 随写路径维护,减侧 GREATEST 兜底(并发不击穿 0)。
   AI 不介入作品评论(无 is_ai、不触发 ai_reply_jobs)。 */

export interface WorkDetail extends WorkRow {
  /* 精选定夺编辑(featured_by)的 handle;未精选/账号已注销 → null */
  editorHandle: string | null;
}

export async function getWorkDetail(id: number): Promise<WorkDetail | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `${SELECT_WORK_DETAIL} WHERE w.id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  return r ? { ...mapWork(r), editorHandle: r.editor_handle ?? null } : null;
}

/* 浏览者是否已支持(详情页支持按钮初态)。 */
export async function hasWorkVote(
  userId: number,
  workId: number,
): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM work_votes WHERE work_id = ? AND user_id = ? LIMIT 1",
    [workId, userId],
  );
  return !!rows[0];
}

/* INSERT IGNORE:并发重复/双击由复合主键挡住,不报错的幂等插入。 */
export function workVoteInsertQuery(
  workId: number,
  userId: number,
): { sql: string; args: number[] } {
  return {
    sql: "INSERT IGNORE INTO work_votes (work_id, user_id) VALUES (?, ?)",
    args: [workId, userId],
  };
}

export function workVoteDeleteQuery(
  workId: number,
  userId: number,
): { sql: string; args: number[] } {
  return {
    sql: "DELETE FROM work_votes WHERE work_id = ? AND user_id = ?",
    args: [workId, userId],
  };
}

/* 减侧先 CAST 成 SIGNED 再 GREATEST:UNSIGNED 直接 -1 会回绕成巨值
   (同 posts.ts hotExpr 的坑),兜底在并发误删时不击穿 0。 */
export function workVoteCountQuery(
  workId: number,
  delta: 1 | -1,
): { sql: string; args: number[] } {
  return {
    sql:
      delta > 0
        ? "UPDATE works SET vote_count = vote_count + 1 WHERE id = ?"
        : "UPDATE works SET vote_count = GREATEST(0, CAST(vote_count AS SIGNED) - 1) WHERE id = ?",
    args: [workId],
  };
}

/* insert 的 affectedRows:1 = 这次新支持(计数 +1);0 = 已支持过(这次 = 取消)。 */
export function workVoteBranch(insertAffectedRows: number): "support" | "cancel" {
  return insertAffectedRows > 0 ? "support" : "cancel";
}

/* 支持 toggle:插入成功即支持,已存在则删除取消;返回本次终态(客户端乐观路径
   只关心 ok,返回值供调用方/测试对齐语义)。 */
export async function toggleWorkVote(
  userId: number,
  workId: number,
): Promise<"support" | "cancel"> {
  const pool = getPool();
  const ins = workVoteInsertQuery(workId, userId);
  const [res] = await pool.query<ResultSetHeader>(ins.sql, ins.args);
  const branch = workVoteBranch(res.affectedRows);
  if (branch === "support") {
    const q = workVoteCountQuery(workId, 1);
    await pool.query(q.sql, q.args);
  } else {
    const del = workVoteDeleteQuery(workId, userId);
    const [d] = await pool.query<ResultSetHeader>(del.sql, del.args);
    if (d.affectedRows > 0) {
      const q = workVoteCountQuery(workId, -1);
      await pool.query(q.sql, q.args);
    }
  }
  return branch;
}

/* ---- 评论 ---- */

export interface WorkCommentRow {
  id: number;
  workId: number;
  userId: number;
  body: string;
  createdAt: Date;
  handle: string | null;
  avatarUrl: string | null;
}

/* 单层评论分页:id 游标,时间正序(旧的在前,对话从下往上长),每页多取 1 条
   判断下一页;翻页期间新增评论只追加在末尾,不会顶乱已翻过的页(同社区取舍)。 */
export const WORK_COMMENT_PAGE_SIZE = 50;

export function workCommentPageQuery(
  workId: number,
  after: number,
): { sql: string; args: number[] } {
  return {
    sql: `SELECT c.id, c.work_id, c.user_id, c.body, c.created_at,
            u.handle, u.avatar_url
     FROM work_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.work_id = ? AND c.deleted_at IS NULL AND c.id > ?
     ORDER BY c.id ASC LIMIT ${WORK_COMMENT_PAGE_SIZE + 1}`,
    args: [workId, after],
  };
}

/* 可见评论总数:与 workCommentPageQuery 同口径(滤软删),两者必须一起改。 */
export function workCommentCountQuery(workId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: "SELECT COUNT(*) AS n FROM work_comments WHERE work_id = ? AND deleted_at IS NULL",
    args: [workId],
  };
}

export interface WorkCommentPage {
  comments: WorkCommentRow[];
  total: number;
  nextCursor: number | null;
}

export async function getWorkCommentsPage(
  workId: number,
  after = 0,
): Promise<WorkCommentPage> {
  const count = workCommentCountQuery(workId);
  const page = workCommentPageQuery(workId, after);
  const pool = getPool();
  const [countRows, rows] = await Promise.all([
    pool.query<RowDataPacket[]>(count.sql, count.args).then(([r]) => r),
    pool.query<RowDataPacket[]>(page.sql, page.args).then(([r]) => r),
  ]);
  const kept =
    rows.length > WORK_COMMENT_PAGE_SIZE
      ? rows.slice(0, WORK_COMMENT_PAGE_SIZE)
      : rows;
  return {
    comments: kept.map((r) => ({
      id: Number(r.id),
      workId: Number(r.work_id),
      userId: Number(r.user_id),
      body: r.body,
      createdAt: r.created_at,
      handle: r.handle ?? null,
      avatarUrl: r.avatar_url ?? null,
    })),
    total: Number(countRows[0]?.n ?? 0),
    nextCursor:
      rows.length > WORK_COMMENT_PAGE_SIZE && kept.length > 0
        ? Number(kept[kept.length - 1].id)
        : null,
  };
}

/* 发评论:插入 + 冗余计数 +1(两条语句,同社区 createComment 的非事务取舍);
   不发通知、不排 AI 任务(作品评论从简)。 */
export function workCommentInsertQuery(
  workId: number,
  userId: number,
  body: string,
): { sql: string; args: (string | number)[] } {
  return {
    sql: "INSERT INTO work_comments (work_id, user_id, body) VALUES (?, ?, ?)",
    args: [workId, userId, body.slice(0, 10000)],
  };
}

export async function createWorkComment(
  workId: number,
  userId: number,
  body: string,
): Promise<number> {
  const pool = getPool();
  const ins = workCommentInsertQuery(workId, userId, body);
  const [res] = await pool.query<ResultSetHeader>(ins.sql, ins.args);
  await pool.query(
    "UPDATE works SET comment_count = comment_count + 1 WHERE id = ?",
    [workId],
  );
  return Number(res.insertId);
}

/* 删评论(软删):评论作者本人或作品作者可删,权限钉在 WHERE(c.user_id 或
   w.user_id);多表 UPDATE 一条语句同时把 works.comment_count 减 1。
   affectedRows = 0 → 不存在/已删/越权,调用方按失败处理。 */
export function workCommentDeleteQuery(
  commentId: number,
  userId: number,
): { sql: string; args: number[] } {
  return {
    sql: `UPDATE work_comments c JOIN works w ON w.id = c.work_id
     SET c.deleted_at = NOW(),
         w.comment_count = GREATEST(0, CAST(w.comment_count AS SIGNED) - 1)
     WHERE c.id = ? AND c.deleted_at IS NULL
           AND (c.user_id = ? OR w.user_id = ?)`,
    args: [commentId, userId, userId],
  };
}

export async function deleteWorkComment(
  userId: number,
  commentId: number,
): Promise<boolean> {
  const q = workCommentDeleteQuery(commentId, userId);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}
