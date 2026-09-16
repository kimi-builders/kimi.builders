/* Transactional email via the Resend HTTP API (zero dependencies, no
   nodemailer). Without RESEND_API_KEY -> {ok:false,error:"not_configured"}
   and callers fail soft (server log only, never a 500 to the user).
   Sending domain mail.kimi.builders (verified). */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "kimi.builders <noreply@mail.kimi.builders>";
const TIMEOUT_MS = 10_000;

export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail({
  to,
  subject,
  text,
  html,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  text: string;
  /* Brand HTML (templates in src/lib/email-templates.ts); text is the
     required fallback, html optional. */
  html?: string;
  /* Resend retains keys for 24 hours. Use only for a deterministic
     request whose payload remains stable across retries. */
  idempotencyKey?: string;
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "not_configured" };
  const key = idempotencyKey?.trim();
  if (key && (key.length > 256 || !/^[\x21-\x7e]+$/.test(key))) {
    return { ok: false, error: "invalid_idempotency_key" };
  }
  try {
    const headers = new Headers({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });
    if (key) headers.set("Idempotency-Key", key);
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
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
