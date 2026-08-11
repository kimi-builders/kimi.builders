/* 登录起点:GET /api/auth/github|google
   种 state cookie(CSRF 防护,10 分钟)→ 302 到提供方授权页。
   redirect_uri 走 canonical origin(生产在反代后,req.url 是内网地址)。 */
import { NextRequest, NextResponse } from "next/server";
import {
  authorizeUrl,
  createState,
  LINK_COOKIE,
  PROVIDERS,
  STATE_COOKIE,
  type Provider,
} from "@/src/lib/auth/oauth";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { AUTH_RETURN_COOKIE, safeReturnTo } from "@/src/lib/auth/return-to";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const origin = canonicalOrigin(req);
  /* link=1:设置页发起的绑定流程,回调把 provider 挂到当前登录账号 */
  const linking = new URL(req.url).searchParams.get("link") === "1";
  const returnTo = linking
    ? "/settings"
    : safeReturnTo(new URL(req.url).searchParams.get("next"));
  const state = createState();
  const res = NextResponse.redirect(
    authorizeUrl(provider as Provider, {
      redirectUri: `${origin}/api/auth/callback/${provider}`,
      state,
    }),
  );
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  res.cookies.set(AUTH_RETURN_COOKIE, returnTo, cookieOpts);
  if (linking) res.cookies.set(LINK_COOKIE, "1", cookieOpts);
  return res;
}
