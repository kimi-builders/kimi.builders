/* GET /api/ai-reply/status?commentId=<post comment> | workCommentId=<work
   comment> — summon wait feedback: after a successful summon the client
   polls here and router.refresh()es once on done, showing the AI reply
   without a manual refresh. Exposes job state only (never content);
   login required; only the summoner (the trigger comment's author) may
   read a job's state — anyone else gets the same "none" as an absent
   job, so existence of another member's summon never leaks. */
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionUser } from "@/src/lib/auth/session";
import { getPool } from "@/src/lib/db";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ state: "none" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const commentId = Number(sp.get("commentId")) || null;
  const workCommentId = Number(sp.get("workCommentId")) || null;
  if (!commentId && !workCommentId)
    return NextResponse.json({ state: "none" });

  /* The job's trigger comment must belong to the requester; the join
     table is a fixed tuple, never user input. */
  const [col, joinTable, id] = commentId
    ? (["comment_id", "comments", commentId] as const)
    : (["work_comment_id", "work_comments", workCommentId] as const);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT j.status
     FROM ai_reply_jobs j
     JOIN ${joinTable} c ON c.id = j.${col} AND c.user_id = ?
     WHERE j.${col} = ? AND j.kind = 'mention'
     ORDER BY j.id DESC LIMIT 1`,
    [user.id, id],
  );
  const state = rows[0] ? String(rows[0].status) : "none";
  return NextResponse.json(
    { state },
    { headers: { "Cache-Control": "no-store" } },
  );
}
