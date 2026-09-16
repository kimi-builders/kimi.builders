/* Community moderation: permission checks, hide/delete, mutes, profile
   resets, role management, and the audit log. Query/mutation style follows
   ./posts and ./works; permission checks extend the existing
   featured.canModerate (the site's single role-check point — no parallel
   hierarchy here).

   Fixed semantics:
   - hide != soft delete: hidden_* is a moderator's ruling on public
     visibility, reversible; every public surface (lists/detail/search/
     rail/posters/featured) hides it, the author sees it labeled. Soft
     delete (deleted_at) is removal with unchanged author semantics. The
     two can stack.
   - Hard delete: admin only, physical DELETE (dependent rows converge via
     existing ON DELETE CASCADE; reactions are polymorphic with no FK and
     are cleaned by hand); the target must exist. Soft-deleted posts and
     comments remain eligible so the admin console can finish the removal.
   - Private content (visibility=private) is visible and actionable for
     admins in /admin (moderation outranks visibility) but never leaks to
     any public surface.
   - Every moderation action writes a moderation_actions audit row; write
     permissions live in the action layer (requireModerator/
     requireAdmin) — roles are not re-checked here. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { getSessionUser, type SessionUser } from "./auth/session";
import { getPool } from "./db";
import { canModerate } from "./featured";
import { t } from "./i18n";

export { canModerate } from "./featured";

/* Admin check: role management's only promote/demote channel is
   admin-only; every other moderation action allows admin/mod. */
export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

/* Server-action entry auth: not logged in / not a moderator -> null
   (callers treat as forbidden). */
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

type Queryable = Pool | PoolConnection;

/* Moderation invariant: target lock, business change, cascade counters,
   and audit row must live or die together. */
async function withModerationTransaction<T>(
  work: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/* ---- Audit ---- */

export type ModAction =
  | "hide"
  | "unhide"
  | "delete"
  | "hard_delete"
  | "mute"
  | "unmute"
  | "profile_reset"
  | "role_grant"
  | "role_revoke"
  /* Resolving a member feedback flag is an audit-worthy moderation
     action too (B2); the target is the feedback row itself. */
  | "resolve_feedback";

export async function logModeration(
  actorId: number,
  action: ModAction,
  targetType: ModTargetType | "user" | "feedback",
  targetId: number,
  reason = "",
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    "INSERT INTO moderation_actions (actor_id, action, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)",
    [actorId, action, targetType, targetId, reason.slice(0, 280)],
  );
}

/* Resolving feedback and writing its audit record is one moderation
   transaction. A logging failure must leave the flag open. */
export async function resolveFeedback(
  actorId: number,
  feedbackId: number,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const [res] = await conn.query<ResultSetHeader>(
      `UPDATE feedback
       SET status = 'resolved', resolved_at = UTC_TIMESTAMP(), resolver_id = ?
       WHERE id = ? AND status = 'open'`,
      [actorId, feedbackId],
    );
    if (res.affectedRows !== 1) return false;
    await logModeration(
      actorId,
      "resolve_feedback",
      "feedback",
      feedbackId,
      "member feedback resolved",
      conn,
    );
    return true;
  });
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

/* Audit log paging, newest first: id cursor (same as comment/work
   paging), one extra row to detect the next page. */
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

/* ---- Hide / unhide (reversible; undeleted targets only) ---- */

export async function hideContent(
  actorId: number,
  type: ModTargetType,
  id: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const deletedColumn = type === "work" ? "" : ", deleted_at";
    const postColumn = type === "comment" ? ", post_id" : "";
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, hidden_at${deletedColumn}${postColumn} FROM ${TABLE[type]}
       WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id],
    );
    const target = rows[0];
    if (!target || target.hidden_at || (type !== "work" && target.deleted_at)) return false;
    await conn.query(
      `UPDATE ${TABLE[type]} SET hidden_at = NOW(), hidden_by = ?, hidden_reason = ? WHERE id = ?`,
      [actorId, reason.slice(0, 280), id],
    );
    /* Clear the three featured columns in the same transaction: hidden
       content carries no featured state, so even a missed filter on the
       public side or badges cannot surface it; unhiding does not restore —
       re-feature deliberately. */
    if (type === "post" || type === "work") {
      await conn.query(
        `UPDATE ${TABLE[type]} SET featured_at = NULL, featured_by = NULL, featured_reason = NULL
         WHERE id = ? AND featured_at IS NOT NULL`,
        [id],
      );
    }
    if (type === "comment") {
      await conn.query(
        `UPDATE posts SET comment_count = GREATEST(0, CAST(comment_count AS SIGNED) - 1)
         WHERE id = ?`,
        [target.post_id],
      );
    }
    /* Author notification (B5): hiding silently made content "vanish"
       for its author. Notifies inside the same transaction — actor_id
       NULL keeps the semantics "system/moderation", and the reason
       rides the notification's own anchor page (the banner shows
       reason + appeal). Posts anchor via post_id; works via work_id
       (hidden works stay viewable to their author + mods, same as
       posts). */
    if (type === "post" || type === "comment") {
      const [authors] = await conn.query<RowDataPacket[]>(
        `SELECT user_id${type === "post" ? ", id AS post_id" : ", post_id"} FROM ${TABLE[type]} WHERE id = ? LIMIT 1`,
        [id],
      );
      const a = authors[0];
      /* AI comments (user_id NULL) have no one to notify. */
      if (a && a.user_id !== null && Number(a.user_id) !== actorId) {
        await conn.query(
          `INSERT INTO notifications (user_id, actor_id, type, post_id${type === "comment" ? ", comment_id" : ""})
           VALUES (?, NULL, 'mod_hidden', ?${type === "comment" ? ", ?" : ""})`,
          type === "comment"
            ? [Number(a.user_id), a.post_id, id]
            : [Number(a.user_id), id],
        );
      }
    }
    if (type === "work") {
      const [authors] = await conn.query<RowDataPacket[]>(
        `SELECT user_id FROM works WHERE id = ? LIMIT 1`,
        [id],
      );
      const a = authors[0];
      if (a && a.user_id !== null && Number(a.user_id) !== actorId) {
        await conn.query(
          `INSERT INTO notifications (user_id, actor_id, type, work_id)
           VALUES (?, NULL, 'mod_hidden', ?)`,
          [Number(a.user_id), id],
        );
      }
    }
    await logModeration(actorId, "hide", type, id, reason, conn);
    return true;
  });
}

export async function unhideContent(
  actorId: number,
  type: ModTargetType,
  id: number,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const deletedColumn = type === "work" ? "" : ", deleted_at";
    const postColumn = type === "comment" ? ", post_id" : "";
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, hidden_at${deletedColumn}${postColumn} FROM ${TABLE[type]}
       WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id],
    );
    const target = rows[0];
    if (!target || !target.hidden_at || (type !== "work" && target.deleted_at)) return false;
    await conn.query(
      `UPDATE ${TABLE[type]} SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE id = ?`,
      [id],
    );
    if (type === "comment") {
      await conn.query(
        "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ? AND deleted_at IS NULL",
        [target.post_id],
      );
    }
    await logModeration(actorId, "unhide", type, id, "", conn);
    return true;
  });
}

/* ---- Management soft delete (posts/comments; works have none — hard
   delete below) ---- */

export async function adminDeletePost(
  actorId: number,
  postId: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [postId],
    );
    if (!rows[0]) return false;
    await conn.query("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [postId]);
    await logModeration(actorId, "delete", "post", postId, reason, conn);
    return true;
  });
}

/* Comment soft delete: delete the row and decrement the post's redundant
   counter (same two-statement trade-off as deleteComment). */
export async function adminDeleteComment(
  actorId: number,
  commentId: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, post_id, hidden_at FROM comments
       WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [commentId],
    );
    const target = rows[0];
    if (!target) return false;
    await conn.query("UPDATE comments SET deleted_at = NOW() WHERE id = ?", [commentId]);
    /* A hidden comment was already removed from the public counter at
       hide time; the soft delete must not subtract again. */
    if (!target.hidden_at) {
      await conn.query(
        `UPDATE posts SET comment_count = GREATEST(0, CAST(comment_count AS SIGNED) - 1)
         WHERE id = ?`,
        [target.post_id],
      );
    }
    await logModeration(actorId, "delete", "comment", commentId, reason, conn);
    return true;
  });
}

/* ---- Hard delete (admin only; target must exist) ---- */

async function deleteReactions(
  targetType: "post" | "comment",
  ids: number[],
  db: Queryable,
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(
    "DELETE FROM reactions WHERE target_type = ? AND target_id IN (?)",
    [targetType, ids],
  );
}

/* Post hard delete: comments/poll/subscriptions/ai_jobs/notifications go
   via ON DELETE CASCADE; reactions are polymorphic with no FK and are
   cleaned for the post and its comments by hand. No deleted_at guard:
   the console's "hard delete" exists precisely for rows already
   soft-deleted (the author's own delete) — guarding on deleted_at IS
   NULL made every soft-deleted row permanently stuck. */
export async function hardDeletePost(
  actorId: number,
  postId: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const [posts] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM posts WHERE id = ? LIMIT 1 FOR UPDATE",
      [postId],
    );
    if (!posts[0]) return false;
    const [commentIds] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM comments WHERE post_id = ? FOR UPDATE",
      [postId],
    );
    await deleteReactions("comment", commentIds.map((r) => Number(r.id)), conn);
    await deleteReactions("post", [postId], conn);
    await conn.query("DELETE FROM posts WHERE id = ?", [postId]);
    await logModeration(actorId, "hard_delete", "post", postId, reason, conn);
    return true;
  });
}

/* Comment hard delete: removes the whole subtree (parent_id has no FK —
   collected recursively); the post's redundant counter drops by the
   still-live count among them. */
export async function hardDeleteComment(
  actorId: number,
  commentId: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const [rootRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, post_id, deleted_at FROM comments WHERE id = ? LIMIT 1 FOR UPDATE`,
      [commentId],
    );
    const root = rootRows[0];
    if (!root) return false;
    /* Lock the parent post so all moderation counter changes and new
       guarded comment writes serialize per post. */
    await conn.query("SELECT id FROM posts WHERE id = ? LIMIT 1 FOR UPDATE", [root.post_id]);
    const [tree] = await conn.query<RowDataPacket[]>(
      `WITH RECURSIVE ids AS (
         SELECT c.id FROM comments c WHERE c.id = ?
         UNION ALL
         SELECT c.id FROM comments c JOIN ids t ON c.parent_id = t.id
       ) SELECT c.id, c.post_id, c.deleted_at, c.hidden_at
         FROM comments c JOIN ids ON ids.id = c.id FOR UPDATE`,
      [commentId],
    );
    const ids = tree.map((r) => Number(r.id));
    const visibleLiveCount = tree.filter(
      (r) => r.deleted_at === null && r.hidden_at === null,
    ).length;
    await deleteReactions("comment", ids, conn);
    const [deleted] = await conn.query<ResultSetHeader>(
      "DELETE FROM comments WHERE id IN (?)",
      [ids],
    );
    if (deleted.affectedRows === 0) return false;
    if (visibleLiveCount > 0) {
      await conn.query(
        `UPDATE posts SET comment_count = GREATEST(0, CAST(comment_count AS SIGNED) - ?)
         WHERE id = ?`,
        [visibleLiveCount, root.post_id],
      );
    }
    await logModeration(actorId, "hard_delete", "comment", commentId, reason, conn);
    return true;
  });
}

/* Work hard delete: work_votes/work_comments go via ON DELETE CASCADE. */
export async function hardDeleteWork(
  actorId: number,
  workId: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM works WHERE id = ? LIMIT 1 FOR UPDATE",
      [workId],
    );
    if (!rows[0]) return false;
    await conn.query("DELETE FROM works WHERE id = ?", [workId]);
    await logModeration(actorId, "hard_delete", "work", workId, reason, conn);
    return true;
  });
}

/* ---- Mutes ---- */

export const MUTE_DAYS = [1, 3, 7, 30] as const;
/* Permanent-mute sentinel: DATETIME has no "infinity"; the max feasible
   date approximates it (the mute check only tests > NOW()). */
export const MUTE_FOREVER = "9999-12-31 23:59:59";

/* Mute duration math (pure): days -> Date; forever -> sentinel string.
   Invalid input -> null (callers reject). */
export function muteUntilFor(
  duration: number | "forever",
  now = new Date(),
): Date | string | null {
  if (duration === "forever") return MUTE_FOREVER;
  if (!Number.isInteger(duration) || duration <= 0 || duration > 365) return null;
  return new Date(now.getTime() + duration * 86_400_000);
}

/* Mute check (pure): NULL/past = not muted; a future instant = muted
   (returns the expiry). */
export function activeMute(mutedUntil: Date | string | null): Date | null {
  if (!mutedUntil) return null;
  const t = typeof mutedUntil === "string" ? new Date(mutedUntil) : mutedUntil;
  return t.getTime() > Date.now() ? t : null;
}

/* Write-path pre-check (shared by post/comment/work/work-comment writes):
   muted -> expiry; otherwise null. */
export async function getActiveMute(userId: number): Promise<Date | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT muted_until FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  return activeMute(rows[0]?.muted_until ?? null);
}

/* Mute message copy (shared by the action layer): permanent (9999
   sentinel) and dated separately. */
export function muteMessage(locale: "zh" | "en", until: Date): string {
  if (until.getUTCFullYear() >= 9999) return t(locale, "err.mutedForever");
  return t(locale, "err.muted", { d: until.toISOString().slice(0, 10) });
}

interface GovernableUser {
  id: number;
  role: string;
  mutedUntil: Date | null;
}

/* One shared server-side guard for all user-moderation actions: an admin
   target is never mutable. */
async function lockGovernableUser(
  conn: PoolConnection,
  userId: number,
): Promise<GovernableUser | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, role, muted_until FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
    [userId],
  );
  const row = rows[0];
  if (!row || row.role === "admin") return null;
  return {
    id: Number(row.id),
    role: String(row.role),
    mutedUntil: row.muted_until ?? null,
  };
}

export async function muteUser(
  actorId: number,
  userId: number,
  until: Date | string,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    if (!(await lockGovernableUser(conn, userId))) return false;
    await conn.query("UPDATE users SET muted_until = ? WHERE id = ?", [until, userId]);
    await logModeration(actorId, "mute", "user", userId, reason, conn);
    return true;
  });
}

export async function unmuteUser(
  actorId: number,
  userId: number,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    const target = await lockGovernableUser(conn, userId);
    if (!target || !target.mutedUntil) return false;
    /* Keep role in the WHERE defensively so future changes can't bypass
       the shared lock guard. */
    const [res] = await conn.query<ResultSetHeader>(
      "UPDATE users SET muted_until = NULL WHERE id = ? AND role <> 'admin' AND muted_until IS NOT NULL",
      [userId],
    );
    if (res.affectedRows === 0) return false;
    await logModeration(actorId, "unmute", "user", userId, "", conn);
    return true;
  });
}

/* ---- Profile reset (handling offending content: clear custom
   avatar/display name/bio back to defaults) ---- */

export async function resetUserProfile(
  actorId: number,
  userId: number,
  reason: string,
): Promise<boolean> {
  return withModerationTransaction(async (conn) => {
    if (!(await lockGovernableUser(conn, userId))) return false;
    await conn.query("UPDATE users SET avatar_url = '', name = '', bio = '' WHERE id = ?", [userId]);
    await logModeration(actorId, "profile_reset", "user", userId, reason, conn);
    return true;
  });
}

/* ---- Role management (admin only; member <-> mod; admins cannot be
   demoted) ---- */

/* Pure: role-change validity. The actor must be admin; the target must
   not currently be admin (no demotion/change); the new role can only be
   member/mod; self-changes are pointless and rejected. */
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
  return withModerationTransaction(async (conn) => {
    const target = await lockGovernableUser(conn, targetId);
    if (!target || target.role === nextRole) return false;
    const [res] = await conn.query<ResultSetHeader>(
      "UPDATE users SET role = ? WHERE id = ? AND role <> 'admin' AND role <> ?",
      [nextRole, targetId, nextRole],
    );
    if (res.affectedRows === 0) return false;
    await logModeration(
      actorId,
      nextRole === "mod" ? "role_grant" : "role_revoke",
      "user",
      targetId,
      "",
      conn,
    );
    return true;
  });
}

/* ---- /admin user list (searchable) ---- */

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

/* ---- /admin content list (recent posts/comments/works, filterable by
   state) ---- */

export type ModContentState = "all" | "hidden" | "deleted";

export interface ModContentRow {
  id: number;
  type: ModTargetType;
  /* Title (posts/works) or body excerpt (comments). */
  title: string;
  authorHandle: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  visibility: string | null;
  /* Comments only: containing post id + title (for jump/linking). */
  postId?: number;
  postTitle?: string;
  /* Works only: source (site/awesome). */
  source?: string;
}

export const MOD_CONTENT_PAGE_SIZE = 50;

/* state: all = everything incl. private (moderation outranks
   visibility) / hidden / soft-deleted (works have no soft delete — always
   empty there). The list is an admin surface; visibility is not
   filtered. */
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
