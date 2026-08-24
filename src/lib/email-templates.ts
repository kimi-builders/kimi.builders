/* Brand transactional email skeleton (dark brand style matching the
   site's dark tokens — a Linear/Vercel-style layout: logo header + mono
   eyebrow + big title + large CTA button + hairline footer). Email HTML
   engineering rules:
   - Table layout + fully inline styles only; no flex/grid/external
     CSS/class names (QQ/163/Gmail/Apple Mail compatibility).
   - Whole message on a dark #0e0e13 base (bgcolor attribute + style
     written twice — clients strip one), dark panel cards + hairlines.
   - The CTA is a bulletproof button: a padding-stretched <a> inside a
     bgcolor <td>, brand blue #1783ff.
   - The logo is a remote PNG that clients may block by default: complete
     alt text, body/buttons always real text — readable without images.
   - Font names always single-quoted (double quotes would terminate the
     outer double-quoted style attribute; a regression test guards it).
   Callers pass trusted content only; bodyHtml is HTML written by our own
   code (not escaped here); title / eyebrow / cta.label / footnote are
   escaped as plain text. */

/* Site dark theme tokens (see app/globals.css; body text uses a dimmed
   warm white — pure white glares on dark). */
const INK = "#0e0e13"; // base
const PANEL = "#16161f"; // raised panel
const PAPER = "#efe8dc"; // warm-white primary text
const GREY = "#9a9aa5"; // secondary text
const BODY = "#c9c4ba"; // body text
const HAIRLINE = "rgba(255,255,255,0.12)";

/* Font names in single quotes: FONT_STACK is interpolated into a
   double-quoted style attribute — double quotes would terminate it
   early. */
const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
/* Email clients never load webfonts; mono uses a system stack. */
const MONO_STACK = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

export const BRAND_BLUE = "#1783ff";
export const EMAIL_LOGO_PATH = "/brand/logo-email.png";
const DEFAULT_SITE_URL = "https://kimi.builders";

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BrandEmailInput {
  /* Big in-card title (plain text, escaped). */
  title: string;
  /* In-card body: a trusted HTML fragment written by the caller (<p>
     etc., styles inlined). */
  bodyHtml: string;
  /* Small mono eyebrow above the title (plain text, escaped), e.g.
     KIMI.BUILDERS / SECURITY. */
  eyebrow?: string;
  /* CTA button; absent = the whole block never renders (the skeleton
     doubles for button-less notifications). */
  cta?: { label: string; href: string };
  /* Footer note (plain text, escaped; \n becomes <br>); bilingual
     concatenation is the caller's job. */
  footnote?: string;
  /* Inbox preview summary (hidden preheader); defaults to the title. */
  preheader?: string;
  /* Site absolute origin for the logo URL and footer links; defaults to
     https://kimi.builders. */
  siteUrl?: string;
}

export function renderBrandEmail(input: BrandEmailInput): string {
  const siteUrl = (input.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const logoUrl = `${siteUrl}${EMAIL_LOGO_PATH}`;
  const title = escapeEmailHtml(input.title);
  const preheader = escapeEmailHtml(input.preheader ?? input.title);

  const eyebrowBlock = input.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${MONO_STACK};font-size:11px;letter-spacing:0.12em;color:${GREY};">${escapeEmailHtml(input.eyebrow)}</p>`
    : "";

  const ctaBlock = input.cta
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;">
              <tr>
                <td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:8px;">
                  <a href="${escapeEmailHtml(input.cta.href)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeEmailHtml(input.cta.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${GREY};">
              按钮没反应?复制链接到浏览器打开 / Button not working? Paste this link into your browser:<br>
              <a href="${escapeEmailHtml(input.cta.href)}" target="_blank" style="color:${BRAND_BLUE};text-decoration:underline;word-break:break-all;">${escapeEmailHtml(input.cta.href)}</a>
            </p>`
    : "";

  const footnoteBlock = input.footnote
    ? `${escapeEmailHtml(input.footnote).replace(/\n/g, "<br>")}<br><br>`
    : "";

  return `<!doctype html>
<html lang="zh" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
</head>
<body bgcolor="${INK}" style="margin:0;padding:0;background-color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${INK}" style="background-color:${INK};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560" style="width:560px;max-width:100%;">
          <tr>
            <td style="padding:0 8px 18px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="28" style="width:28px;">
                    <img src="${logoUrl}" width="28" height="28" alt="kimi.builders 标志:月之暗面与双星 / logo" style="display:block;border:0;border-radius:6px;">
                  </td>
                  <td style="padding-left:10px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:${PAPER};">
                    kimi.builders
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${PANEL}" style="background-color:${PANEL};border:1px solid ${HAIRLINE};border-radius:16px;padding:36px;">
              ${eyebrowBlock}
              <h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:21px;font-weight:700;line-height:1.4;color:${PAPER};">${title}</h1>
              <div style="font-family:${FONT_STACK};font-size:14px;line-height:1.8;color:${BODY};">${input.bodyHtml}</div>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;">
              <div style="border-top:1px solid ${HAIRLINE};padding-top:20px;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${GREY};">
                ${footnoteBlock}<a href="${siteUrl}" target="_blank" style="color:${GREY};text-decoration:underline;">kimi.builders</a>
                &nbsp;·&nbsp;Kimi 用户自建的非商业 Builder 社区(非官方)/ A user-run community for Builders using Kimi (unofficial)
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ---- Concrete transactional emails ---- */

export interface TransactionalMail {
  subject: string;
  text: string;
  html: string;
}

/* Password-reset email: one message with the zh section first and the
   en section after (the user's language is unknown at send time); zh in
   body color, en dimmed to secondary for hierarchy; the plain-text
   version always ships as a fallback. */
export function renderPasswordResetMail({
  resetUrl,
  siteUrl,
}: {
  resetUrl: string;
  siteUrl: string;
}): TransactionalMail {
  const text = [
    "你好 / Hello,",
    "",
    "我们收到了重置 kimi.builders 账号密码的请求。打开下面的链接设置新密码(1 小时内有效,只能用一次):",
    "We received a request to reset your kimi.builders password. Open the link below to choose a new one (valid for 1 hour, single use):",
    "",
    resetUrl,
    "",
    "如果这不是你的操作,直接忽略本邮件即可,密码不会改变。",
    "If you didn't request this, just ignore this email — your password stays unchanged.",
    "",
    "— kimi.builders",
  ].join("\n");
  const html = renderBrandEmail({
    siteUrl,
    eyebrow: "KIMI.BUILDERS / SECURITY",
    title: "重置密码 / Reset your password",
    preheader: "重置链接 1 小时内有效 / Your reset link is valid for 1 hour",
    bodyHtml: [
      `<p style="margin:0 0 12px;">我们收到了重置 <strong style="color:${PAPER};">kimi.builders</strong> 账号密码的请求。点击下方按钮设置新密码——链接 1 小时内有效、只能用一次。</p>`,
      `<p style="margin:0;color:${GREY};">We received a request to reset your <strong style="color:${BODY};">kimi.builders</strong> password. Use the button below to choose a new one — the link is valid for 1 hour and works once.</p>`,
    ].join(""),
    cta: { label: "重置密码 / Reset password", href: resetUrl },
    footnote:
      "如果这不是你的操作,忽略本邮件即可,密码不会改变。\nIf you didn't request this, just ignore this email — your password stays unchanged.",
  });
  return {
    subject: "重置你的 kimi.builders 密码 / Reset your kimi.builders password",
    text,
    html,
  };
}
