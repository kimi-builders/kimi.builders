/* POST /api/auth/email/login — 邮箱+密码登录。
   失败信息统一「邮箱或密码不正确」,不暴露邮箱是否注册;
   限速:IP 10 次/10 分钟 + 单邮箱 5 次/10 分钟。 */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { normalizeEmail, verifyPassword } from "@/src/lib/auth/password";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { setSessionCookie } from "@/src/lib/auth/session";
import { findEmailAccount } from "@/src/lib/auth/users";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

function back(req: NextRequest, code: string): NextResponse {
  const url = new URL("/login", canonicalOrigin(req));
  url.searchParams.set("error", code);
  const next = new URL(req.url).searchParams.get("next");
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return back(req, "invalid_origin");
  const ipAllowed = await consumeUsageRateLimit({
    scope: "auth-email-login",
    identity: requestIdentity(req),
    limit: 10,
    windowSeconds: 600,
  });
  if (!ipAllowed) return back(req, "rate_limited");

  const form = await req.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");

  const accountAllowed = await consumeUsageRateLimit({
    scope: "auth-email-login-account",
    identity: email || "empty",
    limit: 5,
    windowSeconds: 600,
  });
  if (!accountAllowed) return back(req, "rate_limited");

  const account = email ? await findEmailAccount(email) : null;
  const ok =
    account?.passwordHash != null &&
    (await verifyPassword(password, account.passwordHash));
  if (!ok) return back(req, "bad_credentials");

  await setSessionCookie(account.id);
  const next = safeReturnTo(new URL(req.url).searchParams.get("next"));
  return NextResponse.redirect(new URL(next === "/" ? "/community" : next, canonicalOrigin(req)), 303);
}
