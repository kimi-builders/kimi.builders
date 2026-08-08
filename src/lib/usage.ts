/* Legacy Token 日汇总的写入与读取。
   Phase 0 已停用其共享密钥写入入口,但保留读取以继续展示已有数据。
   v2 Collector 将写入独立的 bucket/session 事实表;这里不扩展新协议。 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface UsageDayInput {
  day: string; // YYYY-MM-DD(用户本地时区)
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costMicros: number;
  activeSeconds: number;
  sessions: number;
  messages: number;
}

/* 幂等:同一天重复同步直接覆盖(脚本是全量重算,覆盖即正确)。 */
export async function upsertUsageDays(
  userId: number,
  days: UsageDayInput[],
): Promise<void> {
  if (days.length === 0) return;
  const rows = days.map((d) => [
    userId,
    d.day,
    d.tokensIn,
    d.tokensOut,
    d.tokensCached,
    d.costMicros,
    d.activeSeconds,
    d.sessions,
    d.messages,
  ]);
  await getPool().query(
    `INSERT INTO usage_daily
       (user_id, day, tokens_in, tokens_out, tokens_cached, cost_micros, active_seconds, sessions, messages)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       tokens_in = VALUES(tokens_in), tokens_out = VALUES(tokens_out),
       tokens_cached = VALUES(tokens_cached), cost_micros = VALUES(cost_micros),
       active_seconds = VALUES(active_seconds), sessions = VALUES(sessions),
       messages = VALUES(messages)`,
    [rows],
  );
}

export type UsageDay = UsageDayInput;

export async function getUsageDays(
  userId: number,
  limit = 90,
): Promise<UsageDay[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT day, tokens_in, tokens_out, tokens_cached, cost_micros,
            active_seconds, sessions, messages
     FROM usage_daily WHERE user_id = ?
     ORDER BY day DESC LIMIT ?`,
    [userId, limit],
  );
  return rows
    .map((r) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
      tokensIn: Number(r.tokens_in),
      tokensOut: Number(r.tokens_out),
      tokensCached: Number(r.tokens_cached),
      costMicros: Number(r.cost_micros),
      activeSeconds: Number(r.active_seconds),
      sessions: Number(r.sessions),
      messages: Number(r.messages),
    }))
    .reverse();
}

export async function getUsageLastSync(userId: number): Promise<Date | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT MAX(updated_at) AS last FROM usage_daily WHERE user_id = ?",
    [userId],
  );
  return rows[0]?.last ?? null;
}
