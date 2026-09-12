import { NextResponse } from "next/server";
import { canonicalOrigin } from "./origin";
import { safeReturnTo } from "./return-to";

export type LoginError = "invalid_origin" | "rate_limited" | "bad_credentials";
export type LoginResult =
  | { ok: false; error: LoginError }
  | { ok: true; next: string };

// Enhanced forms request JSON explicitly; native forms retain the POST/redirect/GET contract.
function wantsJson(request: Request): boolean {
  return request.headers.get("accept") === "application/json";
}

export function loginFailureResponse(request: Request, error: LoginError, email?: string) {
  if (wantsJson(request)) {
    const status = error === "invalid_origin" ? 403 : error === "rate_limited" ? 429 : 401;
    return NextResponse.json({ ok: false, error } satisfies LoginResult, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const url = new URL("/login", canonicalOrigin(request));
  url.searchParams.set("error", error);
  const next = safeReturnTo(new URL(request.url).searchParams.get("next"));
  if (next !== "/") url.searchParams.set("next", next);
  if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}

export function loginSuccessResponse(request: Request) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("next"));
  const next = returnTo === "/" ? "/community" : returnTo;
  if (wantsJson(request)) {
    return NextResponse.json({ ok: true, next } satisfies LoginResult, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.redirect(new URL(next, canonicalOrigin(request)), 303);
}
