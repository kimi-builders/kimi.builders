import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { trustedClientIp } from "../client-ip";
import { getPool } from "../db";
import { usageHmac } from "./crypto";

type Queryable = Pool | PoolConnection;

interface UsageRateLimitInput {
  scope: string;
  identity: string;
  limit: number;
  windowSeconds: number;
}

export interface UsageRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/* A small DB-backed limiter works across serverless instances and stores only
   a peppered identity hash. It is intentionally fail-closed for public device
   endpoints when the database is unavailable. */
export async function consumeUsageRateLimitResult({
  scope,
  identity,
  limit,
  windowSeconds,
}: UsageRateLimitInput, db: Queryable = getPool()): Promise<UsageRateLimitResult> {
  const identityHash = usageHmac(`${scope}\0${identity}`);
  await db.query(
    `INSERT INTO usage_rate_limits (scope, identity_hash, window_start, attempts)
     VALUES (?, ?, UTC_TIMESTAMP(3), 1)
     ON DUPLICATE KEY UPDATE
       attempts = IF(
         window_start <= TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(3)),
         1,
         attempts + 1
       ),
       window_start = IF(
         window_start <= TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(3)),
         UTC_TIMESTAMP(3),
         window_start
       )`,
    [scope, identityHash, windowSeconds, windowSeconds],
  );
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT attempts,
            TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), TIMESTAMPADD(SECOND, ?, window_start)) AS retry_after
     FROM usage_rate_limits
     WHERE scope = ? AND identity_hash = ?
     LIMIT 1`,
    [windowSeconds, scope, identityHash],
  );
  return {
    allowed: Number(rows[0]?.attempts ?? limit + 1) <= limit,
    retryAfterSeconds: Math.min(
      windowSeconds,
      Math.max(1, Number(rows[0]?.retry_after ?? windowSeconds)),
    ),
  };
}

export async function consumeUsageRateLimit(
  input: UsageRateLimitInput,
): Promise<boolean> {
  return (await consumeUsageRateLimitResult(input)).allowed;
}

/* Rate-limit identity: trusted header order lives in client-ip.ts. Falls back
   to "unknown" on direct local access — everyone shares one bucket in dev,
   which is acceptable. */
export function requestIdentity(request: Request): string {
  return trustedClientIp(request.headers) ?? "unknown";
}
