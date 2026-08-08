/* 登出:GET /api/auth/logout —— 删会话 cookie 回首页。 */
import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL(req.url).origin + "/");
  res.cookies.delete("kb_session");
  return res;
}
