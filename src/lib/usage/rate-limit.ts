import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import { usageHmac } from "./crypto";

/* A small DB-backed limiter works across serverless instances and stores only
   a peppered identity hash. It is intentionally fail-closed for public device
   endpoints when the database is unavailable. */
export async function consumeUsageRateLimit({
  scope,
  identity,
  limit,
  windowSeconds,
}: {
  scope: string;
  identity: string;
  limit: number;
  windowSeconds: number;
}): Promise<boolean> {
  const identityHash = usageHmac(`${scope}\0${identity}`);
  await getPool().query(
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
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT attempts
     FROM usage_rate_limits
     WHERE scope = ? AND identity_hash = ?
     LIMIT 1`,
    [scope, identityHash],
  );
  return Number(rows[0]?.attempts ?? limit + 1) <= limit;
}

export function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

