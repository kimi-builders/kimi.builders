/* GET /api/ai-reply/status?commentId=<帖子评论> | workCommentId=<作品评论>
   召唤等待反馈(20260816):客户端召唤成功后轮询此接口,拿到 done 再
   router.refresh() 一次,免手动刷新看到 AI 回复。
   只暴露任务状态(不泄露内容),登录即可查;无任务记 state=none。 */
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
