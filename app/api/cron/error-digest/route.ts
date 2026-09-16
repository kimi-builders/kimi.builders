/* Daily error digest: 24h error_events count + top message. When the
   count crosses ERROR_DIGEST_THRESHOLD, email every admin via the
   brand template. Failures are logged and reported in the response —
   the cron itself must not alert twice for the same trouble. Same
   Bearer auth contract as the other cron routes. */
import {
  ERROR_DIGEST_THRESHOLD,
  errorDigestStats,
  shouldAlertErrorDigest,
} from "@/src/lib/error-report";
import { renderErrorDigestMail } from "@/src/lib/email-templates";
import { cronAuthorized } from "@/src/lib/cron-auth";
import { sendMail } from "@/src/lib/mailer";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/src/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const stats = await errorDigestStats();
    const decision = shouldAlertErrorDigest(stats);
    let mailed = 0;
    let mailError: string | null = null;
    if (decision.alert) {
      const [admins] = await getPool().query<RowDataPacket[]>(
        "SELECT email FROM users WHERE role = 'admin' AND deleted_at IS NULL AND email IS NOT NULL",
      );
      const mail = renderErrorDigestMail({
        total: stats.total,
        topMessage: stats.topMessage,
        topCount: stats.topCount,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kimi.builders",
      });
      for (const row of admins) {
        const result = await sendMail({ to: String(row.email), ...mail });
        if (result.ok) mailed += 1;
        else mailError = result.error;
      }
    }
    return Response.json({
      ok: true,
      total: stats.total,
      topMessage: stats.topMessage,
      topCount: stats.topCount,
      threshold: ERROR_DIGEST_THRESHOLD,
      alert: decision.alert,
      mailed,
      ...(mailError ? { mailError } : {}),
    });
  } catch (error) {
    console.error("error digest failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
