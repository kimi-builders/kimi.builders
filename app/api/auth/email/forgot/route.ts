/* POST /api/auth/email/forgot — password reset email. Never leaks
   registration state: registered or not, the answer is a 303 to
   /login?mode=forgot&sent=1; delivery failures only hit the server log
   while the user still sees "sent". Same-origin check + IP rate limit
   (5/hour, scope auth-email-forgot). */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { isValidEmail, normalizeEmail } from "@/src/lib/auth/password";
import { issuePasswordResetToken } from "@/src/lib/auth/password-reset";
import { issueEmailToken } from "@/src/lib/auth/email-verify";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { findEmailAccount } from "@/src/lib/auth/users";
import { renderEmailVerifyMail, renderPasswordResetMail } from "@/src/lib/email-templates";
import { sendMail } from "@/src/lib/mailer";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

function back(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL("/login", canonicalOrigin(req));
  url.searchParams.set("mode", "forgot");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

/* Reset links use the site's canonical origin (src/lib/auth/origin.ts):
   never build an email link from the raw request Host — that invites
   Host-header injection hijacking the reset link. */

export async function POST(req: NextRequest) {
  /* The next param rides the action URL query (same-origin and rate
     limiting precede form parsing — never read from the body) and, once
     validated, follows the redirect URL and the emailed reset link. */
  const next = safeReturnTo(new URL(req.url).searchParams.get("next"));
  const extras: Record<string, string> = next === "/" ? {} : { next };

  if (!isSameOrigin(req)) return back(req, { ...extras, error: "invalid_origin" });
  const allowed = await consumeUsageRateLimit({
    scope: "auth-email-forgot",
    identity: requestIdentity(req),
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) return back(req, { ...extras, error: "rate_limited" });

  const form = await req.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const account = isValidEmail(email) ? await findEmailAccount(email) : null;

  if (account) {
    const siteUrl = canonicalOrigin(req);
    /* Verification gates reset: an unverified mailbox may belong to
       someone else, and a reset link would hand them the account — so
       the first email they get is the verification one. The response
       stays the same opaque "sent" (no account-state leak). */
    /* Mail language: the account's stored preference, bilingual when
       unknown. */
    const mailLocale =
      account.locale === "zh" || account.locale === "en" ? account.locale : null;
    const mail = account.verified
      ? renderPasswordResetMail({
          resetUrl: `${siteUrl}/login/reset?token=${await issuePasswordResetToken(account.id)}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`,
          siteUrl,
          locale: mailLocale,
        })
      : renderEmailVerifyMail({
          verifyUrl: `${siteUrl}/api/auth/email/verify?token=${await issueEmailToken(account.id, "verify")}`,
          email,
          siteUrl,
          locale: mailLocale,
        });
    const sent = await sendMail({ to: email, ...mail });
    if (!sent.ok) console.error(`forgot password: mail to user ${account.id} failed: ${sent.error}`);
  }
  return back(req, { ...extras, sent: "1" });
}
