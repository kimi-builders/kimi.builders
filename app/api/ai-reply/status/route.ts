/* GET /api/ai-reply/status?commentId=<post comment> | workCommentId=<work
   comment> — summon wait feedback: after a successful summon the client
   polls here and router.refresh()es once on done, showing the AI reply
   without a manual refresh. Exposes job state only (never content);
   login required; no job means state=none. */
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

  const [col, id] = commentId
    ? (["comment_id", commentId] as const)
    : (["work_comment_id", workCommentId] as const);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT status FROM ai_reply_jobs WHERE ${col} = ? AND kind = 'mention'
     ORDER BY id DESC LIMIT 1`,
    [id],
  );
  const state = rows[0] ? String(rows[0].status) : "none";
  return NextResponse.json(
    { state },
    { headers: { "Cache-Control": "no-store" } },
  );
}
