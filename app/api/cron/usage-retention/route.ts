/* Server crontab (daily 03:17 UTC): delete expired usage data per
   usage_settings.retention_days. Invoked by the server's cron-call.sh
   carrying Authorization: Bearer <CRON_SECRET> (migrated off Vercel
   Cron; vercel.json removed with it). */
import { applyUsageRetention } from "@/src/lib/usage/retention";
import { cronAuthorized } from "@/src/lib/cron-auth";

export async function GET(request: Request) {
  /* Constant-time compare + a uniform 401 for the unconfigured case,
     see src/lib/cron-auth.ts. */
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await applyUsageRetention();
  return Response.json({ ok: true, ...stats });
}
