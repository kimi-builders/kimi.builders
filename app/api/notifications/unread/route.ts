/* GET /api/notifications/unread — 当前会话未读通知数(20260816)。
   顶栏铃铛角标的客户端轮询源:免整页刷新知道有新回复;
   未登录返回 401 + count 0(轮询端静默处理)。 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/auth/session";
import { getUnreadNotificationCount } from "@/src/lib/posts";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });
  const count = await getUnreadNotificationCount(user.id);
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
