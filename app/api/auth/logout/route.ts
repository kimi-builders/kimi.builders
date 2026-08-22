/* 登出:POST /api/auth/logout —— 删会话 cookie 回首页(canonical origin,反代后 req.url 是内网地址)。
   POST-only(20260822 P2-11):登出是写操作,GET 链接会被预取/爬虫/跨站 img 误触发;
   表单提交见 AuthChip,303 回跳兼容浏览器 POST 后跟进。 */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { isSameOrigin } from "@/src/lib/usage/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return Response.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }
  const res = NextResponse.redirect(canonicalOrigin(req) + "/", 303);
  res.cookies.delete("kb_session");
  return res;
}
