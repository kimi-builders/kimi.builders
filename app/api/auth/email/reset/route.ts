/* POST /api/auth/email/reset — 凭邮件 token 重置密码。
   校验 token(存在/未过期/未使用,原子消费防重放)→ 密码策略 → 换新散列 →
   种会话 cookie 按既有登录成功行为跳 /community。
   失败一律回 /login?mode=reset&token=…&error=<code>;同源校验 + IP 限速(10 次/小时)。 */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { hashPassword, passwordPolicyError } from "@/src/lib/auth/password";
import { consumePasswordResetToken } from "@/src/lib/auth/password-reset";
import { setSessionCookie } from "@/src/lib/auth/session";
import { setUserPassword } from "@/src/lib/auth/users";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

function back(req: NextRequest, code: string, token: string): NextResponse {
  const url = new URL("/login", canonicalOrigin(req));
  url.searchParams.set("mode", "reset");
  url.searchParams.set("error", code);
  if (token) url.searchParams.set("token", token);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");

  if (!isSameOrigin(req)) return back(req, "invalid_origin", token);
  const allowed = await consumeUsageRateLimit({
    scope: "auth-email-reset",
    identity: requestIdentity(req),
    limit: 10,
    windowSeconds: 3600,
  });
  if (!allowed) return back(req, "rate_limited", token);

  /* 先验密码再消费 token:策略不合规不该烧掉用户手里的有效 token */
  const policy = passwordPolicyError(password);
  if (policy) return back(req, policy, token);
  if (password !== password2) return back(req, "password_mismatch", token);

  const userId = await consumePasswordResetToken(token);
  if (!userId) return back(req, "invalid_token", token);

  await setUserPassword(userId, await hashPassword(password));
  await setSessionCookie(userId);
  return NextResponse.redirect(new URL("/community", canonicalOrigin(req)), 303);
}
