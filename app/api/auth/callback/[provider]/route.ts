/* OAuth callback: GET /api/auth/callback/github|google — validates state,
   exchanges the code for a profile, then one of two paths:
   - link mode (kb_oauth_link): attach the provider to the current
     account, return to /settings?linked=...; already bound to someone
     else / no session -> /settings?link_error=...
   - regular login: find-or-create (verified emails merge automatically)
     -> plant the session cookie -> return to returnTo.
   Failures go to /?auth_error=... (login) or /settings?link_error=...
   (linking). */
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
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { AUTH_RETURN_COOKIE, safeReturnTo } from "@/src/lib/auth/return-to";
import { findOrCreateUser, linkProviderAccount } from "@/src/lib/auth/users";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = canonicalOrigin(req);
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
