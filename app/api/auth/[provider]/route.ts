/* Login start: GET /api/auth/github|google — plants the state cookie
   (CSRF protection, 10 minutes) and 302s to the provider's authorize
   page. redirect_uri uses the canonical origin (in production req.url
   is an internal address behind the proxy). */
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
  /* link=1: the link flow started from settings; the callback attaches
     the provider to the current account. */
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
