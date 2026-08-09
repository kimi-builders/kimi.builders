/* Vercel Cron: 每 10 分钟扫 ai_reply_jobs 的 pending 卡住 / failed 未到顶任务,
   指数退避逐个重跑(P0-3)。
   注意:Vercel Hobby 计划只支持每日 cron —— 若部署在 Hobby,需把
   vercel.json 里本任务的 schedule 改为每日(如 "17 3 * * *")或升级计划;
   CRON_SECRET 需在 Vercel 环境变量配置,Vercel 调用时会自动带上
   Authorization: Bearer <CRON_SECRET>。 */
import { recoverAiReplyJobs } from "@/src/lib/ai-reply";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await recoverAiReplyJobs();
  return Response.json({ ok: true, ...stats });
}
