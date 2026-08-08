/* 登录起点:GET /api/auth/github|google
   种 state cookie(CSRF 防护,10 分钟)→ 302 到提供方授权页。
   redirect_uri 取请求来源 origin,本地 / 预览 / 生产域名都自适应。 */
import { NextRequest, NextResponse } from "next/server";
import {
  authorizeUrl,
  createState,
  PROVIDERS,
  STATE_COOKIE,
  type Provider,
} from "@/src/lib/auth/oauth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const origin = new URL(req.url).origin;
  const state = createState();
  const res = NextResponse.redirect(
    authorizeUrl(provider as Provider, {
      redirectUri: `${origin}/api/auth/callback/${provider}`,
      state,
    }),
  );
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
