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

import { t, type Locale } from "./i18n";

/* Mail language: a known account locale sends a single-language mail;
   null means unknown (e.g. a fresh signup without a locale cookie) and
   falls back to the bilingual zh+en layout. */
export type MailLocale = Locale | null;

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
  /* Footer language (nav labels + disclaimer); null = bilingual footer.
     Card content language is the concrete renderers' business. */
  locale?: MailLocale;
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
                <td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:10px;">
                  <a href="${escapeEmailHtml(input.cta.href)}" target="_blank" style="display:inline-block;padding:13px 38px;font-family:${MONO_STACK};font-size:13px;font-weight:600;letter-spacing:0.1em;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeEmailHtml(input.cta.label)}</a>
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

  /* Community footer, mirroring the home facade's hero block: brand
     tagline as the heading, the hero sub line, the blue mono "browse"
     CTA, and the four bordered section tiles (name + sub line, exactly
     the hero's four — usage/GitHub stay out, same as there). Identity
     words stay untranslated per the brand rules; the rest follows the
     mail locale (zh by default when unknown). All table/inline markup:
     mail-client safe. */
  const footerDisclaimer =
    input.locale === "en"
      ? "A user-run community for Builders using Kimi (unofficial)"
      : input.locale === "zh"
        ? "Kimi 用户自建的非商业 Builder 社区(非官方)"
        : "Kimi 用户自建的非商业 Builder 社区(非官方)/ A user-run community for Builders using Kimi (unofficial)";
  const navLocale: Locale = input.locale ?? "zh";
  const tile = (nameKey: Parameters<typeof t>[1], subKey: Parameters<typeof t>[1], href: string) =>
    `<td width="50%" align="center" valign="top" bgcolor="${PANEL}" style="background-color:${PANEL};border:1px solid ${HAIRLINE};border-radius:10px;padding:14px 10px;">
                  <a href="${escapeEmailHtml(href)}" target="_blank" style="display:block;font-family:${MONO_STACK};font-size:13px;letter-spacing:0.08em;color:${PAPER};text-decoration:none;">${escapeEmailHtml(t(navLocale, nameKey))}</a>
                  <span style="display:block;margin-top:5px;font-family:${MONO_STACK};font-size:11px;color:${GREY};">${escapeEmailHtml(t(navLocale, subKey))}</span>
                </td>`;
  const footerNavBlock = `
              <p style="margin:22px 0 0;font-family:${FONT_STACK};font-size:17px;font-weight:600;line-height:1.5;color:${PAPER};">${escapeEmailHtml(t(navLocale, "home.tagline"))}</p>
              <p style="margin:6px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:1.7;color:${GREY};">${escapeEmailHtml(t(navLocale, "home.heroSub"))}</p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;">
                <tr>
                  <td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:10px;">
                    <a href="${siteUrl}/community" target="_blank" style="display:inline-block;padding:13px 40px;font-family:${MONO_STACK};font-size:13px;font-weight:600;letter-spacing:0.1em;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeEmailHtml(t(navLocale, "home.cta"))} →</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellpadding="0" cellspacing="10" width="100%" style="width:100%;border-collapse:separate;">
                <tr>${tile("nav.community", "home.subCommunity", `${siteUrl}/community`)}${tile("nav.explore", "home.subExplore", `${siteUrl}/explore`)}</tr>
                <tr>${tile("nav.works", "home.subWorks", `${siteUrl}/works`)}${tile("nav.awesome", "home.subAwesome", `${siteUrl}/awesome`)}</tr>
              </table>`;

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
                &nbsp;·&nbsp;${footerDisclaimer}
              </div>
              ${footerNavBlock}
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

/* Password-reset email: single-language when the account's locale is
   known; otherwise the bilingual layout (zh in body color, en dimmed
   below). The plain-text version always ships as a fallback. */
export function renderPasswordResetMail({
  resetUrl,
  siteUrl,
  locale = null,
}: {
  resetUrl: string;
  siteUrl: string;
  locale?: MailLocale;
}): TransactionalMail {
  const zh = locale !== "en";
  const en = locale !== "zh";
  const text = [
    "你好 / Hello,",
    "",
    zh
      ? "我们收到了重置 kimi.builders 账号密码的请求。打开下面的链接设置新密码(1 小时内有效,只能用一次):"
      : "",
    en
      ? "We received a request to reset your kimi.builders password. Open the link below to choose a new one (valid for 1 hour, single use):"
      : "",
    "",
    resetUrl,
    "",
    zh ? "如果这不是你的操作,直接忽略本邮件即可,密码不会改变。" : "",
    en ? "If you didn't request this, just ignore this email — your password stays unchanged." : "",
    "",
    "— kimi.builders",
  ]
    .filter(Boolean)
    .join("\n");
  const html = renderBrandEmail({
    siteUrl,
    locale,
    eyebrow: "KIMI.BUILDERS / SECURITY",
    title: locale === "en" ? "Reset your password" : locale === "zh" ? "重置密码" : "重置密码 / Reset your password",
    preheader:
      locale === "en"
        ? "Your reset link is valid for 1 hour"
        : locale === "zh"
          ? "重置链接 1 小时内有效"
          : "重置链接 1 小时内有效 / Your reset link is valid for 1 hour",
    bodyHtml: [
      zh
        ? `<p style="margin:0 0 12px;">我们收到了重置 <strong style="color:${PAPER};">kimi.builders</strong> 账号密码的请求。点击下方按钮设置新密码——链接 1 小时内有效、只能用一次。</p>`
        : "",
      en
        ? `<p style="margin:0;${zh ? `color:${GREY};` : ""}">We received a request to reset your <strong style="color:${zh ? BODY : PAPER};">kimi.builders</strong> password. Use the button below to choose a new one — the link is valid for 1 hour and works once.</p>`
        : "",
    ]
      .filter(Boolean)
      .join(""),
    cta: {
      label: locale === "en" ? "Reset password" : locale === "zh" ? "重置密码" : "重置密码 / Reset password",
      href: resetUrl,
    },
    footnote:
      locale === "en"
        ? "If you didn't request this, just ignore this email — your password stays unchanged."
        : locale === "zh"
          ? "如果这不是你的操作,忽略本邮件即可,密码不会改变。"
          : "如果这不是你的操作,忽略本邮件即可,密码不会改变。\nIf you didn't request this, just ignore this email — your password stays unchanged.",
  });
  return {
    subject:
      locale === "en"
        ? "Reset your kimi.builders password"
        : locale === "zh"
          ? "重置你的 kimi.builders 密码"
          : "重置你的 kimi.builders 密码 / Reset your kimi.builders password",
    text,
    html,
  };
}

/* Email-verification mail: sent at signup (and on resend / on a
   forgot-password request from an unverified account — verifying is the
   prerequisite for resetting, so the takeover of an unowned-but-
   registered mailbox can never mint a working reset link). */
export function renderEmailVerifyMail({
  verifyUrl,
  email,
  siteUrl,
  locale = null,
}: {
  verifyUrl: string;
  email: string;
  siteUrl: string;
  locale?: MailLocale;
}): TransactionalMail {
  const zh = locale !== "en";
  const en = locale !== "zh";
  const addr = escapeEmailHtml(email);
  const text = [
    "你好 / Hello,",
    "",
    zh
      ? `确认这封邮箱属于你,完成 kimi.builders 账号(${email})的验证。链接 24 小时内有效、只能用一次:`
      : "",
    en
      ? `Confirm this mailbox is yours to finish verifying your kimi.builders account (${email}). The link is valid for 24 hours and works once:`
      : "",
    "",
    verifyUrl,
    "",
    zh ? "验证后才能通过这封邮箱找回密码。" : "",
    en ? "Password recovery through this mailbox works only after verification." : "",
    "",
    zh ? "如果这不是你注册的账号,忽略本邮件即可,不会有任何变化。" : "",
    en ? "If you never signed up, just ignore this email — nothing changes." : "",
    "",
    "— kimi.builders",
  ]
    .filter(Boolean)
    .join("\n");
  const html = renderBrandEmail({
    siteUrl,
    locale,
    eyebrow: "KIMI.BUILDERS / EMAIL",
    title: locale === "en" ? "Verify your email" : locale === "zh" ? "验证你的邮箱" : "验证你的邮箱 / Verify your email",
    preheader:
      locale === "en"
        ? "Your verification link is valid for 24 hours"
        : locale === "zh"
          ? "验证链接 24 小时内有效"
          : "验证链接 24 小时内有效 / Your verification link is valid for 24 hours",
    bodyHtml: [
      zh
        ? `<p style="margin:0 0 12px;">确认 <strong style="color:${PAPER};">${addr}</strong> 属于你,完成 kimi.builders 账号验证——链接 24 小时内有效、只能用一次。验证后才能通过这封邮箱找回密码。</p>`
        : "",
      en
        ? `<p style="margin:0;${zh ? `color:${GREY};` : ""}">Confirm that <strong style="color:${zh ? BODY : PAPER};">${addr}</strong> is yours to finish verifying your kimi.builders account — the link is valid for 24 hours and works once. Password recovery through this mailbox unlocks after verification.</p>`
        : "",
    ]
      .filter(Boolean)
      .join(""),
    cta: {
      label: locale === "en" ? "Verify email" : locale === "zh" ? "验证邮箱" : "验证邮箱 / Verify email",
      href: verifyUrl,
    },
    footnote:
      locale === "en"
        ? "If you never signed up, just ignore this email — nothing changes."
        : locale === "zh"
          ? "如果这不是你注册的账号,忽略本邮件即可,不会有任何变化。"
          : "如果这不是你注册的账号,忽略本邮件即可,不会有任何变化。\nIf you never signed up, just ignore this email — nothing changes.",
  });
  return {
    subject:
      locale === "en"
        ? "Verify your kimi.builders email"
        : locale === "zh"
          ? "验证你的 kimi.builders 邮箱"
          : "验证你的 kimi.builders 邮箱 / Verify your kimi.builders email",
    text,
    html,
  };
}

/* Email-change confirmation: delivered to the NEW address; clicking is
   the only thing that swaps the account's email (and signs out every
   other device). */
export function renderEmailChangeMail({
  confirmUrl,
  newEmail,
  siteUrl,
  locale = null,
}: {
  confirmUrl: string;
  newEmail: string;
  siteUrl: string;
  locale?: MailLocale;
}): TransactionalMail {
  const zh = locale !== "en";
  const en = locale !== "zh";
  const addr = escapeEmailHtml(newEmail);
  const text = [
    "你好 / Hello,",
    "",
    zh
      ? "有人请求把 kimi.builders 账号的登录邮箱更换为这个地址。确认后账号将改用本邮箱,并登出其他设备。链接 24 小时内有效、只能用一次:"
      : "",
    en
      ? "Someone asked to move a kimi.builders account's login email to this address. Confirming swaps the account to this mailbox and signs out all other devices. The link is valid for 24 hours and works once:"
      : "",
    "",
    confirmUrl,
    "",
    zh ? "如果这不是你的操作,忽略本邮件即可,账号邮箱不会改变。" : "",
    en ? "If this wasn't you, just ignore this email — the account keeps its current email." : "",
    "",
    "— kimi.builders",
  ]
    .filter(Boolean)
    .join("\n");
  const html = renderBrandEmail({
    siteUrl,
    locale,
    eyebrow: "KIMI.BUILDERS / EMAIL",
    title: locale === "en" ? "Confirm your new email" : locale === "zh" ? "确认更换邮箱" : "确认更换邮箱 / Confirm your new email",
    preheader:
      locale === "en"
        ? "Confirming moves the account to this mailbox"
        : locale === "zh"
          ? "确认后账号改用本邮箱"
          : "确认后账号改用本邮箱 / Confirming moves the account to this mailbox",
    bodyHtml: [
      zh
        ? `<p style="margin:0 0 12px;">收到把 kimi.builders 账号登录邮箱更换为 <strong style="color:${PAPER};">${addr}</strong> 的请求。点击下方按钮确认——确认后账号改用本邮箱,并<strong style="color:${PAPER};">登出其他所有设备</strong>。链接 24 小时内有效、只能用一次。</p>`
        : "",
      en
        ? `<p style="margin:0;${zh ? `color:${GREY};` : ""}">A kimi.builders account asked to move its login email to <strong style="color:${zh ? BODY : PAPER};">${addr}</strong>. Confirm below — the account switches to this mailbox and <strong style="color:${zh ? BODY : PAPER};">every other device is signed out</strong>. The link is valid for 24 hours and works once.</p>`
        : "",
    ]
      .filter(Boolean)
      .join(""),
    cta: {
      label: locale === "en" ? "Confirm change" : locale === "zh" ? "确认更换" : "确认更换 / Confirm change",
      href: confirmUrl,
    },
    footnote:
      locale === "en"
        ? "If this wasn't you, just ignore this email — the account keeps its current email."
        : locale === "zh"
          ? "如果这不是你的操作,忽略本邮件即可,账号邮箱不会改变。"
          : "如果这不是你的操作,忽略本邮件即可,账号邮箱不会改变。\nIf this wasn't you, just ignore this email — the account keeps its current email.",
  });
  return {
    subject:
      locale === "en"
        ? "Confirm your new kimi.builders email"
        : locale === "zh"
          ? "确认更换 kimi.builders 登录邮箱"
          : "确认更换 kimi.builders 登录邮箱 / Confirm your new kimi.builders email",
    text,
    html,
  };
}
