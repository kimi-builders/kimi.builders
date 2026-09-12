/* POST /api/auth/email/login — email+password login. Failures always say
   "incorrect email or password" — never reveal whether the email is
   registered; rate limits: 10/10min per IP + 5/10min per email. */
import { NextRequest } from "next/server";
import { loginFailureResponse, loginSuccessResponse } from "@/src/lib/auth/login-response";
import { normalizeEmail, verifyPassword } from "@/src/lib/auth/password";
import { setSessionCookie } from "@/src/lib/auth/session";
import { findEmailAccount } from "@/src/lib/auth/users";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return loginFailureResponse(req, "invalid_origin");
  const ipAllowed = await consumeUsageRateLimit({
    scope: "auth-email-login",
    identity: requestIdentity(req),
    limit: 10,
    windowSeconds: 600,
  });
  if (!ipAllowed) return loginFailureResponse(req, "rate_limited");

  const form = await req.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");

  const accountAllowed = await consumeUsageRateLimit({
    scope: "auth-email-login-account",
    identity: email || "empty",
    limit: 5,
    windowSeconds: 600,
  });
  if (!accountAllowed) return loginFailureResponse(req, "rate_limited", email);

  const account = email ? await findEmailAccount(email) : null;
  const ok =
    account?.passwordHash != null &&
    (await verifyPassword(password, account.passwordHash));
  if (!ok) return loginFailureResponse(req, "bad_credentials", email);

  await setSessionCookie(account.id);
  return loginSuccessResponse(req);
}
