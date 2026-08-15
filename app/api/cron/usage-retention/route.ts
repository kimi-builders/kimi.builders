/* 服务器 crontab(每日 03:17 UTC):按 usage_settings.retention_days 清理过期用量数据。
   由服务器 cron-call.sh 携带 Authorization: Bearer <CRON_SECRET> 调用
   (原 Vercel Cron 已迁移,vercel.json 同步删除)。 */
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
