import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";

export interface UsageTrendDay {
  day: string;
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  requests: number;
  sessions: number;
  activeSeconds: number;
  costMicros: number;
}

export interface UsageDashboardData {
  days: number;
  from: string;
  to: string;
  totals: Omit<UsageTrendDay, "day">;
  trend: UsageTrendDay[];
  activeDevices: number;
  lastSyncAt: Date | null;
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function utcDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function getUsageDashboard(
  userId: number,
  requestedDays = 30,
): Promise<UsageDashboardData> {
  const days = Math.min(90, Math.max(1, Math.floor(requestedDays)));
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  from.setUTCDate(from.getUTCDate() - days + 1);
  const pool = getPool();
  const [bucketRows, sessionRows, deviceRows, syncRows] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT DATE(bucket_start) AS day,
              SUM(input_tokens) AS input_tokens,
              SUM(cache_write_input_tokens) AS cache_write_input_tokens,
              SUM(cache_read_input_tokens) AS cache_read_input_tokens,
              SUM(output_tokens) AS output_tokens,
              SUM(reasoning_output_tokens) AS reasoning_output_tokens,
              SUM(request_count) AS request_count,
              SUM(COALESCE(cost_micros, 0)) AS cost_micros,
              SUM(legacy_active_seconds) AS legacy_active_seconds,
              SUM(legacy_session_count) AS legacy_session_count
       FROM usage_buckets
       WHERE user_id = ? AND bucket_start >= ? AND bucket_start <= ?
       GROUP BY DATE(bucket_start)
       ORDER BY day`,
      [userId, from, to],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DATE(first_message_at) AS day,
              COUNT(*) AS session_count,
              SUM(active_seconds) AS active_seconds
       FROM usage_sessions
       WHERE user_id = ? AND first_message_at >= ? AND first_message_at <= ?
       GROUP BY DATE(first_message_at)
       ORDER BY day`,
      [userId, from, to],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM usage_devices
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT MAX(last_sync) AS last_sync
       FROM (
         SELECT MAX(updated_at) AS last_sync FROM usage_buckets WHERE user_id = ?
         UNION ALL
         SELECT MAX(updated_at) AS last_sync FROM usage_sessions WHERE user_id = ?
       ) syncs`,
      [userId, userId],
    ),
  ]);

  const byDay = new Map<string, UsageTrendDay>();
  const ensure = (day: string): UsageTrendDay => {
    let value = byDay.get(day);
    if (!value) {
      value = {
        day,
        inputTokens: 0,
        cacheWriteInputTokens: 0,
        cacheReadInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        requests: 0,
        sessions: 0,
        activeSeconds: 0,
        costMicros: 0,
      };
      byDay.set(day, value);
    }
    return value;
  };

  for (const row of bucketRows[0]) {
    const item = ensure(utcDay(row.day));
    item.inputTokens = number(row.input_tokens);
    item.cacheWriteInputTokens = number(row.cache_write_input_tokens);
    item.cacheReadInputTokens = number(row.cache_read_input_tokens);
    item.outputTokens = number(row.output_tokens);
    item.reasoningOutputTokens = number(row.reasoning_output_tokens);
    item.requests = number(row.request_count);
    item.costMicros = number(row.cost_micros);
    item.activeSeconds = number(row.legacy_active_seconds);
    item.sessions = number(row.legacy_session_count);
  }
  for (const row of sessionRows[0]) {
    const item = ensure(utcDay(row.day));
    item.sessions += number(row.session_count);
    item.activeSeconds += number(row.active_seconds);
  }
  for (const item of byDay.values()) {
    item.totalTokens =
      item.inputTokens +
      item.cacheWriteInputTokens +
      item.cacheReadInputTokens +
      item.outputTokens +
      item.reasoningOutputTokens;
  }
  const trend = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const totals = trend.reduce<Omit<UsageTrendDay, "day">>(
    (sum, item) => ({
      inputTokens: sum.inputTokens + item.inputTokens,
      cacheWriteInputTokens: sum.cacheWriteInputTokens + item.cacheWriteInputTokens,
      cacheReadInputTokens: sum.cacheReadInputTokens + item.cacheReadInputTokens,
      outputTokens: sum.outputTokens + item.outputTokens,
      reasoningOutputTokens: sum.reasoningOutputTokens + item.reasoningOutputTokens,
      totalTokens: sum.totalTokens + item.totalTokens,
      requests: sum.requests + item.requests,
      sessions: sum.sessions + item.sessions,
      activeSeconds: sum.activeSeconds + item.activeSeconds,
      costMicros: sum.costMicros + item.costMicros,
    }),
    {
      inputTokens: 0,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      requests: 0,
      sessions: 0,
      activeSeconds: 0,
      costMicros: 0,
    },
  );
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    totals,
    trend,
    activeDevices: number(deviceRows[0][0]?.count),
    lastSyncAt: (syncRows[0][0]?.last_sync as Date | null) ?? null,
  };
}
