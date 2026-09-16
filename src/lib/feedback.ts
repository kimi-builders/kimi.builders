/* Content feedback (B2): the community's self-cleaning channel — a
   small community flags what feels off ("feedback", never "reporting";
   moderators clean or hide). Pure validation/shaping at the top
   (unit-testable), DB at the bottom. Deliberately no workflow: one row
   per flag; moderators see open ones in the admin console and mark
   them resolved after acting through the existing moderation tools. */
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

export const FEEDBACK_TARGET_TYPES = ["post", "comment", "work", "work_comment"] as const;
export type FeedbackTargetType = (typeof FEEDBACK_TARGET_TYPES)[number];

export const FEEDBACK_REASONS = ["spam", "abuse", "offtopic", "privacy", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_NOTE_MAX = 500;

export function isFeedbackTargetType(v: string): v is FeedbackTargetType {
  return (FEEDBACK_TARGET_TYPES as readonly string[]).includes(v);
}

export function isFeedbackReason(v: string): v is FeedbackReason {
  return (FEEDBACK_REASONS as readonly string[]).includes(v);
}

export interface FeedbackInput {
  reporterId: number;
  targetType: FeedbackTargetType;
  targetId: number;
  reason: FeedbackReason;
  note: string | null;
}

export type FeedbackCreateResult =
  | { ok: true }
  | { ok: false; code: "duplicate" };

export async function sendFeedback(input: FeedbackInput): Promise<FeedbackCreateResult> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    /* Locking the reporter serializes their submissions before the
       duplicate check. This closes the SELECT/INSERT race without
       restricting how many resolved history rows a target may keep. */
    const [reporters] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
      [input.reporterId],
    );
    if (!reporters[0]) {
      await conn.rollback();
      return { ok: false, code: "duplicate" };
    }
    const [dup] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM feedback WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open' LIMIT 1",
      [input.reporterId, input.targetType, input.targetId],
    );
    if (dup[0]) {
      await conn.rollback();
      return { ok: false, code: "duplicate" };
    }
    await conn.query(
      "INSERT INTO feedback (reporter_id, target_type, target_id, reason, note) VALUES (?, ?, ?, ?, ?)",
      [
        input.reporterId,
        input.targetType,
        input.targetId,
        input.reason,
        input.note ? input.note.slice(0, FEEDBACK_NOTE_MAX) : null,
      ],
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return { ok: true };
}

export interface FeedbackRow {
  id: number;
  reporterHandle: string;
  targetType: FeedbackTargetType;
  targetId: number;
  reason: FeedbackReason;
  note: string | null;
  createdAt: Date;
  /* Comment targets need their parent for a URL; posts/works link
     directly. Hard-deleted targets yield NULL and the console shows an
     unlinked row. */
  targetHref: string | null;
}

export async function listOpenFeedback(limit = 50): Promise<FeedbackRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.created_at,
            u.handle AS reporter_handle,
            CASE
              WHEN r.target_type = 'post' THEN CONCAT('/community/', r.target_id)
              WHEN r.target_type = 'work' THEN CONCAT('/works/', r.target_id)
              WHEN r.target_type = 'comment' THEN (
                SELECT CONCAT('/community/', c.post_id, '#comment-', c.id)
                FROM comments c WHERE c.id = r.target_id)
              WHEN r.target_type = 'work_comment' THEN (
                SELECT CONCAT('/works/', wc.work_id, '#work-comment-', wc.id)
                FROM work_comments wc WHERE wc.id = r.target_id)
            END AS target_href
     FROM feedback r JOIN users u ON u.id = r.reporter_id
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC LIMIT ${Math.floor(limit)}`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    reporterHandle: String(r.reporter_handle),
    targetType: r.target_type as FeedbackTargetType,
    targetId: Number(r.target_id),
    reason: r.reason as FeedbackReason,
    note: r.note === null ? null : String(r.note),
    createdAt: new Date(r.created_at),
    targetHref: r.target_href === null ? null : String(r.target_href),
  }));
}
