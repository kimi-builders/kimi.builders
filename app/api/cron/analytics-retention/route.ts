/* Daily cleanup of position-value counts older than 90 days. The server
   crontab is registered by the maintainer post-merge, same as
   usage-retention; this route only provides the same Bearer auth and
   idempotent cleanup. */
import { applyAnalyticsRetention } from "@/src/lib/analytics";
import { cronAuthorized } from "@/src/lib/cron-auth";

export async function GET(request: Request) {
  /* Constant-time compare + a uniform 401 for the unconfigured case,
     see src/lib/cron-auth.ts. */
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await applyAnalyticsRetention();
  return Response.json({ ok: true, ...stats });
}
