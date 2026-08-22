import { noStoreJson } from "@/src/lib/usage/http";

/* GET /api/health — deploy probe (unauthenticated). It only proves
   which release the process belongs to: DEPLOYMENT_VERSION is injected
   by the PM2 ecosystem at startup (the git SHA); the deploy pipeline
   uses it to decide whether the switchover succeeded. No DB query —
   external dependency health is covered by other monitoring. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return noStoreJson({
    ok: true,
    version: process.env.DEPLOYMENT_VERSION ?? "development",
  });
}
