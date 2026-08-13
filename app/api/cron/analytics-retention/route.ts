/* 每日清理 90 天前的位置价值计数。服务器 crontab 由维护者在合并后按
   usage-retention 的方式注册;本路由只提供同样的 Bearer 鉴权与幂等清理。 */
import { applyAnalyticsRetention } from "@/src/lib/analytics";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await applyAnalyticsRetention();
  return Response.json({ ok: true, ...stats });
}
