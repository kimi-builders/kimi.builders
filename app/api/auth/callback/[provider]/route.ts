/* OAuth 回调:GET /api/auth/callback/github|google
   校验 state → code 换资料 → 两条路径:
   - 绑定模式(kb_oauth_link):把 provider 挂到当前登录账号,回 /settings?linked=…;
     已绑给别人 / 无会话 → /settings?link_error=…
   - 常规登录:find-or-create(已验证邮箱自动并号)→ 种会话 cookie → 回 returnTo。
   失败统一回 /?auth_error=…(登录)或 /settings?link_error=…(绑定)。 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchProfile,
  LINK_COOKIE,
  PROVIDERS,
  STATE_COOKIE,
  type Provider,
} from "@/src/lib/auth/oauth";
import { getSessionUser, setSessionCookie } from "@/src/lib/auth/session";
import { AUTH_RETURN_COOKIE, safeReturnTo } from "@/src/lib/auth/return-to";
import { findOrCreateUser, linkProviderAccount } from "@/src/lib/auth/users";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = new URL(req.url).origin;
  const cookieStore = await cookies();
  const returnTo = safeReturnTo(cookieStore.get(AUTH_RETURN_COOKIE)?.value);
  const linking = cookieStore.get(LINK_COOKIE)?.value === "1";
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const clearFlowCookies = (response: NextResponse) => {
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(AUTH_RETURN_COOKIE);
    response.cookies.delete(LINK_COOKIE);
    return response;
  };
  const fail = (reason: string) => {
    const target = new URL(returnTo, origin);
    target.searchParams.set("auth_error", reason);
    return clearFlowCookies(NextResponse.redirect(target));
  };
  const linkFail = (reason: string) => {
    const target = new URL("/settings", origin);
    target.searchParams.set("link_error", reason);
    target.searchParams.set("p", provider);
    return clearFlowCookies(NextResponse.redirect(target));
  };

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = cookieStore.get(STATE_COOKIE)?.value;
  if (!code || !state || !stored || state !== stored) {
    return linking ? linkFail("state_mismatch") : fail("state_mismatch");
  }

  try {
    const profile = await fetchProfile(
      provider as Provider,
      code,
      `${origin}/api/auth/callback/${provider}`,
    );
    if (linking) {
      const user = await getSessionUser();
      if (!user) return linkFail("no_session");
      const result = await linkProviderAccount(user.id, provider as Provider, profile);
      if (result !== "ok") return linkFail(result);
      const target = new URL("/settings", origin);
      target.searchParams.set("linked", provider);
      return clearFlowCookies(NextResponse.redirect(target));
    }
    const uid = await findOrCreateUser(provider as Provider, profile);
    await setSessionCookie(uid);
    return clearFlowCookies(NextResponse.redirect(new URL(returnTo, origin)));
  } catch (e) {
    console.error("oauth callback failed", e);
    return linking ? linkFail("oauth_failed") : fail("oauth_failed");
  }
}
