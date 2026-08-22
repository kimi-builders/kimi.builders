/* 海报路由防护(20260822 P1-9):ImageResponse 是 CPU 重渲染,四条海报路由
   (/api/share/post|work|u|letter)共用按来源 IP 的 120/小时限流;超限直接
   429,不进入快照查询与字体/渲染管线。身份与 usage 侧同一可信序。 */
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

export async function posterRateLimited(request: Request): Promise<boolean> {
  const allowed = await consumeUsageRateLimit({
    scope: "share-poster",
    identity: requestIdentity(request),
    limit: 120,
    windowSeconds: 3600,
  });
  return !allowed;
}
