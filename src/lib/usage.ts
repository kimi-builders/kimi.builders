/* Token 用量的写入与读取(usage_daily,按天幂等 upsert,PK user_id+day)。
   数据来自用户本地脚本(scripts/usage-sync.mjs)扫描 ~/.kimi-code 会话
   wire.jsonl 的按天汇总;站点只存数字,不存任何对话内容。 */
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

export interface UsageDay extends UsageDayInput {}

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
