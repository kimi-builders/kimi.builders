/* 品牌事务邮件骨架(深色品牌风,对齐站点 dark token —— Linear/Vercel 式事务邮件:
   logo 头 + mono eyebrow + 大标题 + CTA 大按钮 + hairline 页脚)。
   邮件 HTML 工程纪律:
   - 只 table 布局 + 全内联样式;无 flex/grid/外部 CSS/类名(QQ/163/Gmail/Apple Mail)。
   - 整封深底 #0e0e13(bgcolor 属性 + style 双写,防客户端剥离),深面板卡 + hairline。
   - CTA 是「padding 撑开的 <a> 包在 bgcolor <td> 里」的防弹按钮,品牌蓝 #1783ff。
   - logo 是远程 PNG,可能被默认拦截:alt 完整、正文/按钮一律真文本,无图也可读。
   - 字体名一律单引号(双引号会截断外层双引号 style 属性;有回归测试守着)。
   调用方只传受信内容;bodyHtml 是自家代码写的 HTML(模板不做转义),
   title / eyebrow / cta.label / footnote 按纯文本转义。 */

/* 站点 dark 主题 token(见 app/globals.css;正文用暖白降档,避免深底上纯白刺眼) */
const INK = "#0e0e13"; // 底色
const PANEL = "#16161f"; // 深一层面板
const PAPER = "#efe8dc"; // 暖白主文字
const GREY = "#9a9aa5"; // 次要文字
const BODY = "#c9c4ba"; // 正文
const HAIRLINE = "rgba(255,255,255,0.12)";

/* 字体名用单引号:FONT_STACK 要插进双引号的 style 属性里,双引号会提前截断属性 */
const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
/* 邮件客户端不会加载网页字体,mono 用系统栈 */
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
  /* 卡内大标题(纯文本,转义) */
  title: string;
  /* 卡内正文,调用方自写的可信 HTML 片段(<p> 等,样式内联) */
  bodyHtml: string;
  /* 标题上方 mono 小字标签(纯文本,转义),如 KIMI.BUILDERS / SECURITY */
  eyebrow?: string;
  /* CTA 按钮;缺省则整块不渲染(骨架可复用于无按钮的通知信) */
  cta?: { label: string; href: string };
  /* 页脚免责声明(纯文本,转义;\n 自动转 <br>);双语拼接由调用方完成 */
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
                &nbsp;·&nbsp;Kimi 用户自建的非商业 builder 社区(非官方)/ A user-built community of Kimi builders (unofficial)
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

/* ---- 具体事务邮件 ---- */

export interface TransactionalMail {
  subject: string;
  text: string;
  html: string;
}

/* 忘记密码重置信:zh 段在前、en 段在后合一封(收件时不知道用户语言);
   zh 用正文色、en 降次要色分出层级;text 纯文本始终同发兜底。 */
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
