/* Daily error digest for the previous completed UTC day. Provider
   idempotency makes the three scheduled retry attempts safe for each
   admin recipient. Delivery failures stay non-2xx so the monitor log
   records an actionable failure. */
import {
  ERROR_DIGEST_THRESHOLD,
  errorDigestStats,
  previousUtcDayWindow,
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
    const window = previousUtcDayWindow();
    const stats = await errorDigestStats(window);
    const decision = shouldAlertErrorDigest(stats);
    let mailed = 0;
    const deliveryErrors: string[] = [];
    if (decision.alert) {
      const [admins] = await getPool().query<RowDataPacket[]>(
        "SELECT id, email FROM users WHERE role = 'admin' AND deleted_at IS NULL AND email IS NOT NULL ORDER BY id",
      );
      const mail = renderErrorDigestMail({
        windowKey: window.key,
        total: stats.total,
        topSource: stats.topSource,
        topMessage: stats.topMessage,
        topCount: stats.topCount,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kimi.builders",
      });
      if (admins.length === 0) deliveryErrors.push("no_admin_recipient");
      for (const row of admins) {
        const result = await sendMail({
          to: String(row.email),
          ...mail,
          idempotencyKey: `error-digest/${window.key}/admin-${Number(row.id)}`,
        });
        if (result.ok) mailed += 1;
        else {
          deliveryErrors.push(`admin-${Number(row.id)}:${result.error}`);
          console.error("error digest delivery failed", {
            adminId: Number(row.id),
            error: result.error,
            window: window.key,
          });
        }
      }
    }
    const ok = deliveryErrors.length === 0;
    return Response.json(
      {
        ok,
        window: window.key,
        total: stats.total,
        topSource: stats.topSource,
        topMessage: stats.topMessage,
        topCount: stats.topCount,
        threshold: ERROR_DIGEST_THRESHOLD,
        alert: decision.alert,
        mailed,
        deliveryFailures: deliveryErrors.length,
      },
      { status: ok ? 200 : 502 },
    );
  } catch (error) {
    console.error("error digest failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
