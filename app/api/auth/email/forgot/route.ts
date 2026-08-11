/* POST /api/auth/email/forgot — 忘记密码:投递重置链接邮件。
   不泄露注册状态:无论邮箱是否注册,一律 303 回 /login?mode=forgot&sent=1;
   发信失败只记服务端日志,对用户仍显示已发送。
   同源校验 + IP 限速(5 次/小时,scope auth-email-forgot)。 */
import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/src/lib/auth/password";
import { issuePasswordResetToken } from "@/src/lib/auth/password-reset";
import { findEmailAccount } from "@/src/lib/auth/users";
import { renderPasswordResetMail } from "@/src/lib/email-templates";
import { sendMail } from "@/src/lib/mailer";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

function back(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("mode", "forgot");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

/* 重置链接走站点 canonical URL(NEXT_PUBLIC_SITE_URL,部署期校验过是不带尾斜杠的
   https origin);未配置时退回请求 origin(本地/预览自适应,同 OAuth 路由惯例)。
   不用裸请求 Host 拼邮件链接,防 Host 头注入劫持重置链接。 */
function siteOrigin(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return back(req, { error: "invalid_origin" });
  const allowed = await consumeUsageRateLimit({
    scope: "auth-email-forgot",
    identity: requestIdentity(req),
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) return back(req, { error: "rate_limited" });

  const form = await req.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const account = isValidEmail(email) ? await findEmailAccount(email) : null;

  if (account) {
    const token = await issuePasswordResetToken(account.id);
    const siteUrl = siteOrigin(req);
    const resetUrl = `${siteUrl}/login/reset?token=${token}`;
    const mail = renderPasswordResetMail({ resetUrl, siteUrl });
    const sent = await sendMail({ to: email, ...mail });
    if (!sent.ok) console.error(`forgot password: mail to user ${account.id} failed: ${sent.error}`);
  }
  return back(req, { sent: "1" });
}
