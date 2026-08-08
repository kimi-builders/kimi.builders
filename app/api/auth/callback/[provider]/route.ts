/* OAuth 回调:GET /api/auth/callback/github|google
   校验 state → code 换资料 → find-or-create 用户 → 种会话 cookie → 回首页。
   失败统一回 /?auth_error=…,首页负责提示。 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchProfile,
  PROVIDERS,
  STATE_COOKIE,
  type Provider,
} from "@/src/lib/auth/oauth";
import { setSessionCookie } from "@/src/lib/auth/session";
import { AUTH_RETURN_COOKIE, safeReturnTo } from "@/src/lib/auth/return-to";
import { findOrCreateUser } from "@/src/lib/auth/users";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = new URL(req.url).origin;
  const cookieStore = await cookies();
  const returnTo = safeReturnTo(cookieStore.get(AUTH_RETURN_COOKIE)?.value);
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const fail = (reason: string) => {
    const target = new URL(returnTo, origin);
    target.searchParams.set("auth_error", reason);
    const response = NextResponse.redirect(target);
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(AUTH_RETURN_COOKIE);
    return response;
  };

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = cookieStore.get(STATE_COOKIE)?.value;
  if (!code || !state || !stored || state !== stored) {
    return fail("state_mismatch");
  }

  try {
    const profile = await fetchProfile(
      provider as Provider,
      code,
      `${origin}/api/auth/callback/${provider}`,
    );
    const uid = await findOrCreateUser(provider as Provider, profile);
    await setSessionCookie(uid);
    const res = NextResponse.redirect(new URL(returnTo, origin));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(AUTH_RETURN_COOKIE);
    return res;
  } catch (e) {
    console.error("oauth callback failed", e);
    return fail("oauth_failed");
  }
}
