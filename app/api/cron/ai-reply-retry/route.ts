/* Server crontab (every 10 minutes): scan ai_reply_jobs for stuck
   pending / failed-under-cap jobs and rerun the due ones with
   exponential backoff. Invoked by the server's cron-call.sh carrying
   Authorization: Bearer <CRON_SECRET> (migrated off Vercel Cron;
   vercel.json removed with it). */
import { recoverAiReplyJobs } from "@/src/lib/ai-reply";
import { cronAuthorized } from "@/src/lib/cron-auth";

export async function GET(request: Request) {
  /* Constant-time compare + a uniform 401 for the unconfigured case,
     see src/lib/cron-auth.ts. */
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await recoverAiReplyJobs();
  return Response.json({ ok: true, ...stats });
}
