/* GET /api/ai-reply/status?commentId=<post comment> | workCommentId=<work
   comment> — summon wait feedback: after a successful summon the client
   polls here and router.refresh()es once on done, showing the AI reply
   without a manual refresh. Exposes job state only (never content);
   login required; only the summoner (the trigger comment's author) may
   read a job's state — anyone else gets the same "none" as an absent
   job, so existence of another member's summon never leaks. */
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { getSessionUser } from "@/src/lib/auth/session";
import { getPool } from "@/src/lib/db";

export type AiReplyStatusTarget =
  | { kind: "post"; id: number }
  | { kind: "work"; id: number };

/* Keep authorization inside the lookup itself: callers cannot fetch a job
   first and filter it afterward. The table and column are selected from a
   closed tuple, never interpolated from request input. */
export async function findMentionJobState(
  db: Pick<Pool, "query">,
  userId: number,
  target: AiReplyStatusTarget,
): Promise<string> {
  const [col, joinTable] = target.kind === "post"
    ? (["comment_id", "comments"] as const)
    : (["work_comment_id", "work_comments"] as const);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT j.status
     FROM ai_reply_jobs j
     JOIN ${joinTable} c ON c.id = j.${col} AND c.user_id = ?
     WHERE j.${col} = ? AND j.kind = 'mention'
     ORDER BY j.id DESC LIMIT 1`,
    [userId, target.id],
  );
  return rows[0] ? String(rows[0].status) : "none";
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ state: "none" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const commentId = Number(sp.get("commentId")) || null;
  const workCommentId = Number(sp.get("workCommentId")) || null;
  if (!commentId && !workCommentId)
    return NextResponse.json({ state: "none" });

  const target: AiReplyStatusTarget = commentId
    ? { kind: "post", id: commentId }
    : { kind: "work", id: workCommentId! };
  const state = await findMentionJobState(getPool(), user.id, target);
  return NextResponse.json(
    { state },
    { headers: { "Cache-Control": "no-store" } },
  );
}
