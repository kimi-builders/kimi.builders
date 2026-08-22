/* POST /api/auth/email/reset — reset the password with the emailed
   token. Validate the token (present/unexpired/unused, consumed
   atomically against replay) -> password policy -> new hash -> plant the
   session cookie and redirect to next (form-passed; /community without
   one). Failures always return /login?mode=reset&token=...&error=<code>;
   same-origin check + IP rate limit (10/hour). */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { hashPassword, passwordPolicyError } from "@/src/lib/auth/password";
import { consumePasswordResetToken } from "@/src/lib/auth/password-reset";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { setSessionCookie } from "@/src/lib/auth/session";
import { setUserPassword } from "@/src/lib/auth/users";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

function back(req: NextRequest, code: string, token: string, next: string): NextResponse {
  const url = new URL("/login", canonicalOrigin(req));
  url.searchParams.set("mode", "reset");
  url.searchParams.set("error", code);
  if (token) url.searchParams.set("token", token);
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  /* Ordering: origin and IP rate limiting precede formData() parsing —
     ungated requests never get to spend multipart parsing; form fields
     are read only after the gates. */
  if (!isSameOrigin(req)) return back(req, "invalid_origin", "", "/");
  const allowed = await consumeUsageRateLimit({
    scope: "auth-email-reset",
    identity: requestIdentity(req),
    limit: 10,
    windowSeconds: 3600,
  });
  if (!allowed) return back(req, "rate_limited", "", "/");

  const form = await req.formData();
  const token = String(form.get("token") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");
  /* The next param rides the action URL query so a successful reset
     returns to the user's original destination. */
  const next = safeReturnTo(new URL(req.url).searchParams.get("next"));

  /* Validate the password before consuming the token: a policy failure
     must not burn the user's valid token. */
  const policy = passwordPolicyError(password);
  if (policy) return back(req, policy, token, next);
  if (password !== password2) return back(req, "password_mismatch", token, next);

  const userId = await consumePasswordResetToken(token);
  if (!userId) return back(req, "invalid_token", token, next);

  await setUserPassword(userId, await hashPassword(password));
  await setSessionCookie(userId);
  return NextResponse.redirect(new URL(next === "/" ? "/community" : next, canonicalOrigin(req)), 303);
}
