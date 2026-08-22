/* usage retention 清理(P0-2):按 usage_settings.retention_days 删除过期的
   usage_buckets / usage_sessions 行,兑现隐私设置里的保留期承诺。
   由 /api/cron/usage-retention 每日触发;分批 DELETE,幂等——重跑只会再删 0 行。
   边界:bucket 看 bucket_start,session 看 last_message_at(还在更新的会话保留)。 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

type Queryable = Pool | PoolConnection;

export interface UsageRetentionStats {
  /* 本次有行被实际删除的用户数 */
  users: number;
  bucketsDeleted: number;
  sessionsDeleted: number;
  /* 全局公共表清理(20260822 P1-7),与按用户保留期无关 */
  rateLimitsDeleted: number;
  deviceCodesDeleted: number;
}

/* 单条 DELETE 的最大行数;删满就再来一批,避免长事务锁表 */
const DELETE_BATCH_SIZE = 5000;

/* 全局清理保留期:
   - usage_rate_limits:窗口过期后行即失效,留 7 天仅作追溯;全 scope 一起清
     (此前只有 analytics scope 有人清,其余无限增长)。7 天远大于最长窗口(1h),
     不会释放仍在计数的活跃桶;
   - usage_device_codes:终态(expired/denied/delivered)行只剩审计价值,7 天后删
     (生命周期只有状态流转、从不 DELETE,同样无限增长)。 */
const RATE_LIMIT_RETENTION_DAYS = 7;
const DEVICE_CODE_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function usageRetentionCutoff(retentionDays: number, now: Date): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/* DATETIME(3) 按 UTC 比较(连接池两端都是 UTC,见 db.ts) */
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
  /* 全局公共表清理(P1-7):按最近命中/创建时间截断,与上面的按用户保留期无关 */
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
