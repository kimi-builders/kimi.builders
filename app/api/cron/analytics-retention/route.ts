/* 每日清理 90 天前的位置价值计数。服务器 crontab 由维护者在合并后按
   usage-retention 的方式注册;本路由只提供同样的 Bearer 鉴权与幂等清理。 */
import { applyAnalyticsRetention } from "@/src/lib/analytics";
import { cronAuthorized } from "@/src/lib/cron-auth";

export async function GET(request: Request) {
  /* 恒时比较 + 未配置统一 401(20260822 P2-4),见 src/lib/cron-auth.ts */
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await applyAnalyticsRetention();
  return Response.json({ ok: true, ...stats });
}
