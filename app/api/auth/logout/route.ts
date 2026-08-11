/* 登出:GET /api/auth/logout —— 删会话 cookie 回首页(canonical origin,反代后 req.url 是内网地址)。 */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";

export function GET(req: NextRequest) {
  const res = NextResponse.redirect(canonicalOrigin(req) + "/");
  res.cookies.delete("kb_session");
  return res;
}
