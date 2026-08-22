/* 服务器 crontab(每 10 分钟):扫 ai_reply_jobs 的 pending 卡住 / failed 未到顶任务,
   指数退避逐个重跑(P0-3)。
   由服务器 cron-call.sh 携带 Authorization: Bearer <CRON_SECRET> 调用
   (原 Vercel Cron 已迁移,vercel.json 同步删除)。 */
import { recoverAiReplyJobs } from "@/src/lib/ai-reply";
import { cronAuthorized } from "@/src/lib/cron-auth";

export async function GET(request: Request) {
  /* 恒时比较 + 未配置统一 401(20260822 P2-4),见 src/lib/cron-auth.ts */
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await recoverAiReplyJobs();
  return Response.json({ ok: true, ...stats });
}
