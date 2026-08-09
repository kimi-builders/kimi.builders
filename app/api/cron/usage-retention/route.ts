/* Vercel Cron: 每日 03:17 UTC 按 usage_settings.retention_days 清理过期用量数据。
   注意:Vercel Hobby 计划只支持每日 cron —— 本任务是每日,无需调整;
   CRON_SECRET 需在 Vercel 环境变量配置,Vercel 调用时会自动带上
   Authorization: Bearer <CRON_SECRET>。 */
import { applyUsageRetention } from "@/src/lib/usage/retention";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await applyUsageRetention();
  return Response.json({ ok: true, ...stats });
}
