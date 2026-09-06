/* GET /api/health/deep — dependency probe for the server crontab
   (Authorization: Bearer <CRON_SECRET>, same contract as /api/cron/*).
   The public /api/health deliberately skips the database so the deploy
   probe never depends on it; this authenticated companion answers the
   question that one cannot: is the primary dependency actually usable
   right now? SELECT 1 under the shared pool with a 2s end-to-end deadline —
   a pooled-capacity stall or a broken connection surfaces here as 503
   instead of a green process probe. */
import { cronAuthorized } from "@/src/lib/cron-auth";
import { getPool } from "@/src/lib/db";
import { noStoreJson } from "@/src/lib/usage/http";
import type { Pool, PoolConnection } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEEP_HEALTH_TIMEOUT_MS = 2_000;

/* Pool acquisition has no built-in deadline while waitForConnections is
   enabled. A timed-out waiter cannot be cancelled in mysql2, so release
   its eventual connection immediately instead of leaking pool capacity. */
export function acquireHealthConnection(
  pool: Pick<Pool, "getConnection">,
  timeoutMs: number,
): Promise<PoolConnection> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("database connection acquisition timed out"));
    }, timeoutMs);

    void pool.getConnection().then(
      (connection) => {
        if (timedOut) {
          connection.release();
          return;
        }
        clearTimeout(timer);
        resolve(connection);
      },
      (error) => {
        if (timedOut) return;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/* The deadline covers queueing and execution. mysql2 destroys a connection
   when a query inactivity timeout fires, so no poisoned session returns to
   the pool. */
export async function probeDatabase(
  pool: Pick<Pool, "getConnection">,
  timeoutMs = DEEP_HEALTH_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const connection = await acquireHealthConnection(pool, timeoutMs);
  try {
    await connection.query({
      sql: "SELECT 1",
      timeout: Math.max(1, deadline - Date.now()),
    });
  } finally {
    connection.release();
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    await probeDatabase(getPool());
    return noStoreJson({
      ok: true,
      db: true,
      dbMs: Date.now() - started,
      version: process.env.DEPLOYMENT_VERSION ?? "development",
    });
  } catch (error) {
    console.error("health/deep: database probe failed", error);
    return noStoreJson(
      {
        ok: false,
        db: false,
        dbMs: Date.now() - started,
        version: process.env.DEPLOYMENT_VERSION ?? "development",
      },
      { status: 503 },
    );
  }
}
