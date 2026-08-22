/* Usage retention: delete expired usage_buckets / usage_sessions rows per
   usage_settings.retention_days, honoring the retention promise made in
   privacy settings. Triggered daily by /api/cron/usage-retention; batched
   DELETEs, idempotent — a rerun deletes 0 more rows. Boundaries: buckets by
   bucket_start, sessions by last_message_at (still-updating sessions stay). */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

type Queryable = Pool | PoolConnection;

export interface UsageRetentionStats {
  /* Users whose rows were actually deleted this run */
  users: number;
  bucketsDeleted: number;
  sessionsDeleted: number;
  /* Global shared-table cleanup, independent of per-user retention */
  rateLimitsDeleted: number;
  deviceCodesDeleted: number;
}

/* Max rows per DELETE; a full batch repeats, avoiding long table-locking
   transactions */
const DELETE_BATCH_SIZE = 5000;

/* Global cleanup retention:
   - usage_rate_limits: rows are inert once the window expires; keep 7 days
     for forensics only. Clears every scope together (previously only the
     analytics scope was cleaned; the rest grew unbounded). 7 days far
     exceeds the longest window (1h), so active counters are never released.
   - usage_device_codes: terminal states (expired/denied/delivered) are audit
     residue, deleted after 7 days (their lifecycle only transitions status,
     never DELETEs — same unbounded growth). */
const RATE_LIMIT_RETENTION_DAYS = 7;
const DEVICE_CODE_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function usageRetentionCutoff(retentionDays: number, now: Date): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/* DATETIME(3) compares in UTC (both pool ends are UTC, see db.ts) */
function toUtcDateTime(value: Date): string {
  return value.toISOString().slice(0, 23).replace("T", " ");
}

async function deleteInBatches(
  db: Queryable,
  sql: string,
  params: unknown[],
): Promise<number> {
  let total = 0;
  for (;;) {
    const [res] = await db.query<ResultSetHeader>(sql, params);
    total += res.affectedRows;
    if (res.affectedRows < DELETE_BATCH_SIZE) return total;
  }
}

export async function applyUsageRetention(
  db: Queryable = getPool(),
  now: Date = new Date(),
): Promise<UsageRetentionStats> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT user_id, retention_days FROM usage_settings",
  );
  const stats: UsageRetentionStats = {
    users: 0,
    bucketsDeleted: 0,
    sessionsDeleted: 0,
    rateLimitsDeleted: 0,
    deviceCodesDeleted: 0,
  };
  for (const row of rows) {
    const userId = Number(row.user_id);
    const retentionDays = Number(row.retention_days);
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) continue;
    const cutoff = toUtcDateTime(usageRetentionCutoff(retentionDays, now));
    const buckets = await deleteInBatches(
      db,
      `DELETE FROM usage_buckets
       WHERE user_id = ? AND bucket_start < ? LIMIT ${DELETE_BATCH_SIZE}`,
      [userId, cutoff],
    );
    const sessions = await deleteInBatches(
      db,
      `DELETE FROM usage_sessions
       WHERE user_id = ? AND last_message_at < ? LIMIT ${DELETE_BATCH_SIZE}`,
      [userId, cutoff],
    );
    if (buckets + sessions > 0) stats.users += 1;
    stats.bucketsDeleted += buckets;
    stats.sessionsDeleted += sessions;
  }
  /* Global shared-table cleanup: truncate by last-hit/created time,
     independent of the per-user loop above */
  const rateLimitCutoff = toUtcDateTime(
    new Date(now.getTime() - RATE_LIMIT_RETENTION_DAYS * DAY_MS),
  );
  stats.rateLimitsDeleted = await deleteInBatches(
    db,
    `DELETE FROM usage_rate_limits
     WHERE window_start < ? LIMIT ${DELETE_BATCH_SIZE}`,
    [rateLimitCutoff],
  );
  const deviceCodeCutoff = toUtcDateTime(
    new Date(now.getTime() - DEVICE_CODE_RETENTION_DAYS * DAY_MS),
  );
  stats.deviceCodesDeleted = await deleteInBatches(
    db,
    `DELETE FROM usage_device_codes
     WHERE status IN ('expired', 'denied', 'delivered') AND created_at < ?
     LIMIT ${DELETE_BATCH_SIZE}`,
    [deviceCodeCutoff],
  );
  return stats;
}
