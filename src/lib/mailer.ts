/* 事务邮件:Resend HTTP API(零依赖,不引 nodemailer)。
   RESEND_API_KEY 未配置 → {ok:false,error:"not_configured"},调用方软失败
   (只留服务端日志,绝不当 500 抛给用户)。发信域 mail.kimi.builders(已 verified)。 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "kimi.builders <noreply@mail.kimi.builders>";
const TIMEOUT_MS = 10_000;

export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  /* 品牌 HTML(模板见 src/lib/email-templates.ts);text 必填兜底,html 可选 */
  html?: string;
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || DEFAULT_FROM,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, error: `http_${res.status}:${body}` };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return { ok: false, error: message.slice(0, 200) };
  }
}
