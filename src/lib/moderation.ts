/* 社区治理(20260830_moderation):权限判定、屏蔽/删除、禁言、资料重置、角色管理、
   审计日志。查询/变更风格对齐 ./posts、./works;权限判定收编既有
   featured.canModerate(全站唯一角色判定点,这里只做扩展,不另起一套)。

   语义钉死:
   - 屏蔽(hide)≠ 软删:hidden_* 是管理员对公开可见性的处置,可解除;
     公开侧(列表/详情/搜索/右栏/海报/精选)一律不可见,作者本人可见带标注。
     软删(deleted_at)是删除态,作者自助语义不变。两者可叠加。
   - 硬删除:仅 admin,物理 DELETE(关联行靠既有 ON DELETE CASCADE 收敛,
     reactions 是多态无 FK,手动清);目标必须存在且未删。
   - 私密内容(visibility=private)管理员在 /admin 可见可处置(治理权高于可见性),
     但任何公开面不泄露。
   - 所有治理动作写 moderation_actions 审计;写路径权限在 action 层
     (requireModerator/requireAdmin),这里不再重复判角色。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getSessionUser, type SessionUser } from "./auth/session";
import { getPool } from "./db";
import { canModerate } from "./featured";
import { t } from "./i18n";

export { canModerate } from "./featured";

/* admin 判定:角色管理的唯一晋级/降级通道仅 admin;其余治理动作 admin/mod 皆可。 */
export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

/* server action 入口鉴权:未登录/非管理角色 → null(调用方按 forbidden 处理)。 */
export async function requireModerator(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && canModerate(user.role) ? user : null;
}

export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && isAdmin(user.role) ? user : null;
}

export type ModTargetType = "post" | "comment" | "work";

const TABLE: Record<ModTargetType, string> = {
  post: "posts",
  comment: "comments",
  work: "works",
};

/* ---- 审计 ---- */

export type ModAction =
  | "hide"
  | "unhide"
  | "delete"
  | "hard_delete"
  | "mute"
  | "unmute"
  | "profile_reset"
  | "role_grant"
  | "role_revoke";

export async function logModeration(
  actorId: number,
  action: ModAction,
  targetType: ModTargetType | "user",
  targetId: number,
  reason = "",
): Promise<void> {
  await getPool().query(
    "INSERT INTO moderation_actions (actor_id, action, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)",
    [actorId, action, targetType, targetId, reason.slice(0, 280)],
  );
}

export interface ModLogRow {
  id: number;
  action: string;
  targetType: string;
  targetId: number;
  reason: string;
  createdAt: Date;
  actorHandle: string | null;
}

export const MOD_LOG_PAGE_SIZE = 50;

/* 审计日志倒序翻页:id 游标(同评论/作品分页口径),多取一条判断下一页。 */
export async function getModerationLog(
  after = 0,
): Promise<{ rows: ModLogRow[]; nextCursor: number | null }> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT m.id, m.action, m.target_type, m.target_id, m.reason, m.created_at,
            u.handle AS actor_handle
     FROM moderation_actions m LEFT JOIN users u ON u.id = m.actor_id
     WHERE m.id > 0 ${after > 0 ? "AND m.id < ?" : ""}
     ORDER BY m.id DESC LIMIT ${MOD_LOG_PAGE_SIZE + 1}`,
    after > 0 ? [after] : [],
  );
  const kept = rows.length > MOD_LOG_PAGE_SIZE ? rows.slice(0, MOD_LOG_PAGE_SIZE) : rows;
  return {
    rows: kept.map((r) => ({
      id: Number(r.id),
      action: r.action,
      targetType: r.target_type,
      targetId: Number(r.target_id),
      reason: r.reason ?? "",
      createdAt: r.created_at,
      actorHandle: r.actor_handle ?? null,
    })),
    nextCursor:
      rows.length > MOD_LOG_PAGE_SIZE && kept.length > 0
        ? Number(kept[kept.length - 1].id)
        : null,
  };
}

/* ---- 屏蔽 / 解除(可逆;仅未删目标)---- */

export async function hideContent(
  actorId: number,
  type: ModTargetType,
  id: number,
  reason: string,
): Promise<boolean> {
  /* works 无 deleted_at(物理删除);posts/comments 软删目标不可再屏蔽(先恢复不存在,
     叠加态按已删展示,不再接受屏蔽操作) */
  const notDeleted = type === "work" ? "" : "AND deleted_at IS NULL";
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE ${TABLE[type]} SET hidden_at = NOW(), hidden_by = ?, hidden_reason = ?
     WHERE id = ? AND hidden_at IS NULL ${notDeleted}`,
    [actorId, reason.slice(0, 280), id],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "hide", type, id, reason);
  return true;
}

export async function unhideContent(
  actorId: number,
  type: ModTargetType,
  id: number,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE ${TABLE[type]} SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
     WHERE id = ? AND hidden_at IS NOT NULL`,
    [id],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "unhide", type, id);
  return true;
}

/* ---- 管理软删(posts/comments;works 无软删,硬删见下)---- */

export async function adminDeletePost(
  actorId: number,
  postId: number,
  reason: string,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE posts SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
    [postId],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "delete", "post", postId, reason);
  return true;
}

/* 评论软删:删行 + 帖冗余计数 -1(同 deleteComment 的两条语句取舍)。 */
export async function adminDeleteComment(
  actorId: number,
  commentId: number,
  reason: string,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT post_id FROM comments WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [commentId],
  );
  if (!rows[0]) return false;
  await pool.query("UPDATE comments SET deleted_at = NOW() WHERE id = ?", [commentId]);
  await pool.query(
    "UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ?",
    [rows[0].post_id],
  );
  await logModeration(actorId, "delete", "comment", commentId, reason);
  return true;
}

/* ---- 硬删除(仅 admin;目标必须存在且未删)---- */

async function deleteReactions(
  targetType: "post" | "comment",
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await getPool().query(
    "DELETE FROM reactions WHERE target_type = ? AND target_id IN (?)",
    [targetType, ids],
  );
}

/* 帖子硬删:comments/poll/subscriptions/ai_jobs/notifications 走 ON DELETE CASCADE;
   reactions 多态无 FK,连帖带评论手动清。 */
export async function hardDeletePost(
  actorId: number,
  postId: number,
  reason: string,
): Promise<boolean> {
  const pool = getPool();
  const [posts] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [postId],
  );
  if (!posts[0]) return false;
  const [commentIds] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM comments WHERE post_id = ?",
    [postId],
  );
  await deleteReactions("comment", commentIds.map((r) => Number(r.id)));
  await deleteReactions("post", [postId]);
  await pool.query("DELETE FROM posts WHERE id = ?", [postId]);
  await logModeration(actorId, "hard_delete", "post", postId, reason);
  return true;
}

/* 评论硬删:整棵子树一起删(parent_id 无 FK,递归收集);帖冗余计数按其中
   未软删的条数减。 */
export async function hardDeleteComment(
  actorId: number,
  commentId: number,
  reason: string,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `WITH RECURSIVE tree AS (
       SELECT c.id, c.post_id, c.deleted_at FROM comments c WHERE c.id = ?
       UNION ALL
       SELECT c.id, c.post_id, c.deleted_at FROM comments c JOIN tree t ON c.parent_id = t.id
     ) SELECT id, post_id, deleted_at FROM tree`,
    [commentId],
  );
  const root = rows.find((r) => Number(r.id) === commentId);
  if (!root || root.deleted_at !== null) return false;
  const ids = rows.map((r) => Number(r.id));
  const liveCount = rows.filter((r) => r.deleted_at === null).length;
  await deleteReactions("comment", ids);
  await pool.query("DELETE FROM comments WHERE id IN (?)", [ids]);
  if (liveCount > 0) {
    await pool.query(
      "UPDATE posts SET comment_count = GREATEST(0, CAST(comment_count AS SIGNED) - ?) WHERE id = ?",
      [liveCount, root.post_id],
    );
  }
  await logModeration(actorId, "hard_delete", "comment", commentId, reason);
  return true;
}

/* 作品硬删:work_votes/work_comments 走 ON DELETE CASCADE。 */
export async function hardDeleteWork(
  actorId: number,
  workId: number,
  reason: string,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM works WHERE id = ?",
    [workId],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "hard_delete", "work", workId, reason);
  return true;
}

/* ---- 禁言 ---- */

export const MUTE_DAYS = [1, 3, 7, 30] as const;
/* 永久禁言哨兵:DATETIME 不存「无限」,用最大可行日期近似(同 MUTED 判定只看 > NOW()) */
export const MUTE_FOREVER = "9999-12-31 23:59:59";

/* 禁言时长计算(纯函数):天数 → Date;forever → 哨兵串。非法输入 → null(调用方拒)。 */
export function muteUntilFor(
  duration: number | "forever",
  now = new Date(),
): Date | string | null {
  if (duration === "forever") return MUTE_FOREVER;
  if (!Number.isInteger(duration) || duration <= 0 || duration > 365) return null;
  return new Date(now.getTime() + duration * 86_400_000);
}

/* 禁言判定(纯函数):NULL/过去 = 未禁言;未来时间 = 禁言中(返回截止时间)。 */
export function activeMute(mutedUntil: Date | string | null): Date | null {
  if (!mutedUntil) return null;
  const t = typeof mutedUntil === "string" ? new Date(mutedUntil) : mutedUntil;
  return t.getTime() > Date.now() ? t : null;
}

/* 写路径前置校验(发帖/评论/发作品/作品评论共用):禁言中 → 截止时间;否则 null。 */
export async function getActiveMute(userId: number): Promise<Date | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT muted_until FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  return activeMute(rows[0]?.muted_until ?? null);
}

/* 禁言提示文案(action 层共用):永久(9999 哨兵)与定期分开。 */
export function muteMessage(locale: "zh" | "en", until: Date): string {
  if (until.getUTCFullYear() >= 9999) return t(locale, "err.mutedForever");
  return t(locale, "err.muted", { d: until.toISOString().slice(0, 10) });
}

export async function muteUser(
  actorId: number,
  userId: number,
  until: Date | string,
  reason: string,
): Promise<boolean> {
  /* admin 账号不可被禁言(防御);mod 之间允许(小社区,全部留审计) */
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE users SET muted_until = ? WHERE id = ? AND role <> 'admin'",
    [until, userId],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "mute", "user", userId, reason);
  return true;
}

export async function unmuteUser(
  actorId: number,
  userId: number,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE users SET muted_until = NULL WHERE id = ? AND muted_until IS NOT NULL",
    [userId],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "unmute", "user", userId);
  return true;
}

/* ---- 资料重置(违规内容处置:清空自定义头像/显示名/简介,回到默认态)---- */

export async function resetUserProfile(
  actorId: number,
  userId: number,
  reason: string,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE users SET avatar_url = '', name = '', bio = '' WHERE id = ? AND role <> 'admin'",
    [userId],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(actorId, "profile_reset", "user", userId, reason);
  return true;
}

/* ---- 角色管理(仅 admin;member ⇄ mod;admin 不可被降)---- */

/* 纯函数:角色变更合法性。actor 必须 admin;目标当前不能是 admin(不可降/不可改);
   目标新角色只能是 member/mod;自己改自己无意义,拒。 */
export function canChangeRole(input: {
  actorRole: string;
  actorId: number;
  targetRole: string;
  targetId: number;
  nextRole: string;
}): boolean {
  if (!isAdmin(input.actorRole)) return false;
  if (input.actorId === input.targetId) return false;
  if (input.targetRole === "admin") return false;
  return input.nextRole === "member" || input.nextRole === "mod";
}

export async function setUserRole(
  actorId: number,
  targetId: number,
  nextRole: "member" | "mod",
): Promise<boolean> {
  /* WHERE 再钉一道:目标不是 admin 才允许改(防御纵深,action 层已 canChangeRole) */
  const [res] = await getPool().query<ResultSetHeader>(
    "UPDATE users SET role = ? WHERE id = ? AND role <> 'admin' AND role <> ?",
    [nextRole, targetId, nextRole],
  );
  if (res.affectedRows === 0) return false;
  await logModeration(
    actorId,
    nextRole === "mod" ? "role_grant" : "role_revoke",
    "user",
    targetId,
  );
  return true;
}

/* ---- /admin 用户列表(可搜索)---- */

export interface AdminUserRow {
  id: number;
  handle: string;
  name: string;
  role: string;
  mutedUntil: Date | null;
  createdAt: Date;
}

export const ADMIN_USER_PAGE_SIZE = 50;

export function adminUsersQuery(opts: {
  q?: string;
  after?: number;
}): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const q = opts.q?.trim();
  if (q) {
    where.push("(u.handle LIKE ? OR u.name LIKE ?)");
    const like = `%${q.slice(0, 60)}%`;
    args.push(like, like);
  }
  if (opts.after && opts.after > 0) {
    where.push("u.id > ?");
    args.push(opts.after);
  }
  return {
    sql: `SELECT u.id, u.handle, u.name, u.role, u.muted_until, u.created_at
     FROM users u ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY u.id ASC LIMIT ${ADMIN_USER_PAGE_SIZE + 1}`,
    args,
  };
}

export async function getAdminUsers(opts: {
  q?: string;
  after?: number;
}): Promise<{ rows: AdminUserRow[]; nextCursor: number | null }> {
  const q = adminUsersQuery(opts);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const kept =
    rows.length > ADMIN_USER_PAGE_SIZE ? rows.slice(0, ADMIN_USER_PAGE_SIZE) : rows;
  return {
    rows: kept.map((r) => ({
      id: Number(r.id),
      handle: r.handle,
      name: r.name,
      role: r.role,
      mutedUntil: r.muted_until ?? null,
      createdAt: r.created_at,
    })),
    nextCursor:
      rows.length > ADMIN_USER_PAGE_SIZE && kept.length > 0
        ? Number(kept[kept.length - 1].id)
        : null,
  };
}

/* ---- /admin 内容列表(最近帖子/评论/作品,按状态筛选)---- */

export type ModContentState = "all" | "hidden" | "deleted";

export interface ModContentRow {
  id: number;
  type: ModTargetType;
  /* 标题(帖/作品)或正文摘要(评论) */
  title: string;
  authorHandle: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  visibility: string | null;
  /* 评论专属:所在帖 id + 标题(跳转定位用) */
  postId?: number;
  postTitle?: string;
  /* 作品专属:来源(site/awesome) */
  source?: string;
}

export const MOD_CONTENT_PAGE_SIZE = 50;

/* state:all=全部(含私密,治理权高于可见性)/hidden=已屏蔽/deleted=已软删
   (works 无软删,deleted 档恒空)。列表是管理面,不过滤可见性。 */
export function moderationContentQuery(opts: {
  type: ModTargetType;
  state: ModContentState;
  after?: number;
}): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.state === "hidden") where.push("x.hidden_at IS NOT NULL");
  if (opts.state === "deleted" && opts.type !== "work")
    where.push("x.deleted_at IS NOT NULL");
  if (opts.after && opts.after > 0) {
    where.push("x.id < ?");
    args.push(opts.after);
  }
  const cond = where.length ? `WHERE ${where.join(" AND ")}` : "";
  if (opts.type === "post") {
    return {
      sql: `SELECT x.id, x.title, LEFT(x.body_md, 200) AS body_excerpt, x.created_at,
                   x.deleted_at, x.hidden_at, x.hidden_reason, x.visibility,
                   u.handle AS author_handle
            FROM posts x LEFT JOIN users u ON u.id = x.user_id
            ${cond} ORDER BY x.id DESC LIMIT ${MOD_CONTENT_PAGE_SIZE + 1}`,
      args,
    };
  }
  if (opts.type === "comment") {
    return {
      sql: `SELECT x.id, LEFT(x.body_md, 200) AS body_excerpt, x.created_at,
                   x.deleted_at, x.hidden_at, x.hidden_reason, x.post_id,
                   p.title AS post_title, LEFT(p.body_md, 200) AS post_excerpt,
                   u.handle AS author_handle
            FROM comments x
            LEFT JOIN users u ON u.id = x.user_id
            LEFT JOIN posts p ON p.id = x.post_id
            ${cond} ORDER BY x.id DESC LIMIT ${MOD_CONTENT_PAGE_SIZE + 1}`,
      args,
    };
  }
  return {
    sql: `SELECT x.id, x.name, x.created_at, x.hidden_at, x.hidden_reason,
                 x.visibility, x.source, u.handle AS author_handle
          FROM works x LEFT JOIN users u ON u.id = x.user_id
          ${cond} ORDER BY x.id DESC LIMIT ${MOD_CONTENT_PAGE_SIZE + 1}`,
    args,
  };
}

export async function getModerationContent(opts: {
  type: ModTargetType;
  state: ModContentState;
  after?: number;
}): Promise<{ rows: ModContentRow[]; nextCursor: number | null }> {
  const q = moderationContentQuery(opts);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  const kept =
    rows.length > MOD_CONTENT_PAGE_SIZE
      ? rows.slice(0, MOD_CONTENT_PAGE_SIZE)
      : rows;
  return {
    rows: kept.map((r) => ({
      id: Number(r.id),
      type: opts.type,
      title:
        opts.type === "work"
          ? r.name
          : r.title || String(r.body_excerpt ?? "").slice(0, 80),
      authorHandle: r.author_handle ?? null,
      createdAt: r.created_at,
      deletedAt: r.deleted_at ?? null,
      hiddenAt: r.hidden_at ?? null,
      hiddenReason: r.hidden_reason ?? null,
      visibility: r.visibility ?? null,
      ...(opts.type === "comment"
        ? {
            postId: Number(r.post_id),
            postTitle:
              r.post_title || String(r.post_excerpt ?? "").slice(0, 60),
          }
        : {}),
      ...(opts.type === "work" ? { source: r.source } : {}),
    })),
    nextCursor:
      rows.length > MOD_CONTENT_PAGE_SIZE && kept.length > 0
        ? Number(kept[kept.length - 1].id)
        : null,
  };
}
