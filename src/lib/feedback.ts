/* Content feedback (B2): the community's self-cleaning channel — a
   small community flags what feels off ("feedback", never "reporting";
   moderators clean or hide). Pure validation/shaping at the top
   (unit-testable), DB at the bottom. Deliberately no workflow: one row
   per flag; moderators see open ones in the admin console and mark
   them resolved after acting through the existing moderation tools. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
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
  /* One open flag per reporter+target: re-flagging the same thing must
     not stack rows in the console; acting on a resolved flag's target
     can always open a fresh one. */
  const [dup] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM feedback WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open' LIMIT 1",
    [input.reporterId, input.targetType, input.targetId],
  );
  if (dup[0]) return { ok: false, code: "duplicate" };
  await pool.query(
    "INSERT INTO feedback (reporter_id, target_type, target_id, reason, note) VALUES (?, ?, ?, ?, ?)",
    [
      input.reporterId,
      input.targetType,
      input.targetId,
      input.reason,
      input.note ? input.note.slice(0, FEEDBACK_NOTE_MAX) : null,
    ],
  );
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

export async function resolveFeedback(
  feedbackId: number,
  resolverId: number,
): Promise<boolean> {
  const pool = getPool();
  const res = (await pool.query(
    "UPDATE feedback SET status = 'resolved', resolved_at = NOW(), resolver_id = ? WHERE id = ? AND status = 'open'",
    [resolverId, feedbackId],
  )) as unknown as [ResultSetHeader];
  return res[0].affectedRows > 0;
}
