/* GET /api/notifications/unread — the session's unread count. Polled
   by the top-bar bell badge so new replies arrive without a page
   refresh; signed out returns 401 + count 0 (pollers handle it
   silently). */
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
