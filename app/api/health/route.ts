import { noStoreJson } from "@/src/lib/usage/http";

/* GET /api/health — 部署探针(无鉴权)。只证明当前进程属于哪个 release:
   DEPLOYMENT_VERSION 由 PM2 ecosystem 在启动时注入(值为 git SHA),
   部署流水线用它判定切换是否成功。不查 DB,外部依赖存活由别的监控覆盖。 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return noStoreJson({
    ok: true,
    version: process.env.DEPLOYMENT_VERSION ?? "development",
  });
}
