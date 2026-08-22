/* 服务器 crontab(每日 03:17 UTC):按 usage_settings.retention_days 清理过期用量数据。
   由服务器 cron-call.sh 携带 Authorization: Bearer <CRON_SECRET> 调用
   (原 Vercel Cron 已迁移,vercel.json 同步删除)。 */
import { applyUsageRetention } from "@/src/lib/usage/retention";
import { cronAuthorized } from "@/src/lib/cron-auth";

export async function GET(request: Request) {
  /* 恒时比较 + 未配置统一 401(20260822 P2-4),见 src/lib/cron-auth.ts */
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await applyUsageRetention();
  return Response.json({ ok: true, ...stats });
}
