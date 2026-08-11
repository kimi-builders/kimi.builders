/* 品牌事务邮件骨架(X 欢迎信式:logo 头 + 大标题 + CTA 大按钮 + 页脚)。
   邮件 HTML 工程纪律:
   - 只 table 布局 + 全内联样式;无 flex/grid/外部 CSS/类名(QQ/163/Gmail/Apple Mail)。
   - 外层浅底 #f5f5f4,白卡圆角 max-width 560px 居中;不做整封深底(防强制反色)。
   - CTA 是「padding 撑开的 <a> 包在 bgcolor <td> 里」的防弹按钮,品牌蓝 #2563eb。
   - logo 是远程 PNG,可能被默认拦截:alt 完整、正文/按钮一律真文本,无图也可读。
   调用方只传受信内容;bodyHtml 是自家代码写的 HTML(模板不做转义),
   title / cta.label / footnote 按纯文本转义。 */

const CARD_RADIUS = "12px";
/* 字体名用单引号:FONT_STACK 要插进双引号的 style 属性里,双引号会提前截断属性 */
const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

export const BRAND_BLUE = "#2563eb";
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
  /* 卡内大标题(纯文本,转义) */
  title: string;
  /* 卡内正文,调用方自写的可信 HTML 片段(<p> 等,样式内联) */
  bodyHtml: string;
  /* CTA 按钮;缺省则整块不渲染(骨架可复用于无按钮的通知信) */
  cta?: { label: string; href: string };
  /* 页脚免责声明(纯文本,转义);双语拼接由调用方完成 */
  footnote?: string;
  /* 收件箱预览摘要(隐藏 preheader);缺省用 title */
  preheader?: string;
  /* 站点 absolute origin,拼 logo URL 与页脚链接;默认 https://kimi.builders */
  siteUrl?: string;
}

export function renderBrandEmail(input: BrandEmailInput): string {
  const siteUrl = (input.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const logoUrl = `${siteUrl}${EMAIL_LOGO_PATH}`;
  const title = escapeEmailHtml(input.title);
  const preheader = escapeEmailHtml(input.preheader ?? input.title);

  const ctaBlock = input.cta
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;">
              <tr>
                <td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:8px;">
                  <a href="${escapeEmailHtml(input.cta.href)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeEmailHtml(input.cta.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:#78716c;">
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
<body style="margin:0;padding:0;background-color:#f5f5f4;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560" style="width:560px;max-width:100%;">
          <tr>
            <td style="padding:0 8px 16px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="28" style="width:28px;">
                    <img src="${logoUrl}" width="28" height="28" alt="kimi.builders 标志:月之暗面与双星 / logo" style="display:block;border:0;border-radius:6px;">
                  </td>
                  <td style="padding-left:10px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:#1c1917;">
                    kimi.builders
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e7e5e4;border-radius:${CARD_RADIUS};padding:32px;">
              <h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:22px;font-weight:700;line-height:1.4;color:#1c1917;">${title}</h1>
              <div style="font-family:${FONT_STACK};font-size:14px;line-height:1.8;color:#44403c;">${input.bodyHtml}</div>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:#a8a29e;">
              ${footnoteBlock}<a href="${siteUrl}" target="_blank" style="color:#a8a29e;text-decoration:underline;">kimi.builders</a>
              &nbsp;·&nbsp;Kimi 用户自建的公益 builder 社区(非官方)/ A user-built community of Kimi builders (unofficial)
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ---- 具体事务邮件 ---- */

export interface TransactionalMail {
  subject: string;
  text: string;
  html: string;
}

/* 忘记密码重置信:zh 段在前、en 段在后合一封(收件时不知道用户语言);
   text 纯文本始终同发兜底。 */
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
    title: "重置密码 / Reset your password",
    preheader: "重置链接 1 小时内有效 / Your reset link is valid for 1 hour",
    bodyHtml: [
      '<p style="margin:0 0 12px;">我们收到了重置 <strong>kimi.builders</strong> 账号密码的请求。点击下方按钮设置新密码——链接 1 小时内有效、只能用一次。</p>',
      '<p style="margin:0;">We received a request to reset your <strong>kimi.builders</strong> password. Use the button below to choose a new one — the link is valid for 1 hour and works once.</p>',
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
