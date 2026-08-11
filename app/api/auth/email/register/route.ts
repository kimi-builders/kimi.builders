/* POST /api/auth/email/register — 邮箱注册。
   表单 POST(urlencoded);同源校验 + IP 限速;成功种会话并回跳。
   失败一律回 /login?mode=register&error=<code>,不写明文原因到日志外渠道。 */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordPolicyError,
} from "@/src/lib/auth/password";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { setSessionCookie } from "@/src/lib/auth/session";
import { createEmailUser, findEmailAccount, setUserPassword } from "@/src/lib/auth/users";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

function back(req: NextRequest, code: string): NextResponse {
  const url = new URL("/login", canonicalOrigin(req));
  url.searchParams.set("mode", "register");
  url.searchParams.set("error", code);
  const next = new URL(req.url).searchParams.get("next");
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return back(req, "invalid_origin");
  const allowed = await consumeUsageRateLimit({
    scope: "auth-email-register",
    identity: requestIdentity(req),
    limit: 10,
    windowSeconds: 3600,
  });
  if (!allowed) return back(req, "rate_limited");

  const form = await req.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 64);

  if (!isValidEmail(email)) return back(req, "invalid_email");
  const policy = passwordPolicyError(password);
  if (policy) return back(req, policy);
  if (password !== password2) return back(req, "password_mismatch");
  if (await findEmailAccount(email)) return back(req, "email_taken");

  const uid = await createEmailUser(email, name || undefined);
  await setUserPassword(uid, await hashPassword(password));
  await setSessionCookie(uid);

  const next = safeReturnTo(new URL(req.url).searchParams.get("next"));
  return NextResponse.redirect(new URL(next === "/" ? "/community" : next, canonicalOrigin(req)), 303);
}
