/* 社区用量榜(P1-1):只聚合主动 opt-in(usage_settings.show_on_leaderboard=1)成员的
   usage_buckets,输出周期 token 总量与活跃天数两个聚合数字,联 users 取展示身份
   (handle/显示名/头像)。隐私边界:项目名、设备、模型、时段等明细列根本不进 SQL。
   token 口径与看板总量一致(见 community.ts / query.ts);活跃天数按 UTC 自然日计
   (社区参考口径,连接池两端都是 UTC,见 db.ts)。
   buildUsageLeaderboardQuery 是纯函数,便于单测;getUsageLeaderboard 才碰 DB。 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

type Queryable = Pool | PoolConnection;

export const USAGE_LEADERBOARD_PERIODS = ["7d", "30d"] as const;
export type UsageLeaderboardPeriod = (typeof USAGE_LEADERBOARD_PERIODS)[number];

/* 榜单最长展示条数;limit 参数会被钳制到这个上界。 */
export const USAGE_LEADERBOARD_LIMIT = 50;

export interface UsageLeaderboardEntry {
  rank: number;
  handle: string;
  name: string;
  avatarUrl: string;
  totalTokens: number;
  activeDays: number;
}

const PERIOD_DAYS: Record<UsageLeaderboardPeriod, number> = { "7d": 7, "30d": 30 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeUsageLeaderboardPeriod(value: unknown): UsageLeaderboardPeriod {
  return value === "30d" ? "30d" : "7d";
}

/* 周期下界:now - N 天,输出 DATETIME(3) UTC 串(比较口径同 retention.ts)。 */
export function usageLeaderboardCutoff(period: UsageLeaderboardPeriod, now: Date): string {
  return new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS)
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

/* 纯 SQL 构建:WHERE 先卡 show_on_leaderboard = 1,再按周期下界聚合;
   SELECT 只有展示身份 + SUM/COUNT 聚合,没有任何明细维度。 */
export function buildUsageLeaderboardQuery(
  period: UsageLeaderboardPeriod,
  now: Date,
  limit: number = USAGE_LEADERBOARD_LIMIT,
): { sql: string; params: unknown[] } {
  const capped = Math.max(1, Math.min(USAGE_LEADERBOARD_LIMIT, Math.trunc(limit) || 1));
  return {
    sql: `SELECT u.handle, u.name, u.avatar_url,
                 SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                     + b.output_tokens + b.reasoning_output_tokens) AS total_tokens,
                 COUNT(DISTINCT DATE(b.bucket_start)) AS active_days
          FROM usage_settings s
          JOIN usage_buckets b ON b.user_id = s.user_id AND b.bucket_start >= ?
          JOIN users u ON u.id = s.user_id
          WHERE s.show_on_leaderboard = 1
          GROUP BY s.user_id, u.handle, u.name, u.avatar_url
          ORDER BY total_tokens DESC, active_days DESC, u.handle ASC
          LIMIT ${capped}`,
    params: [usageLeaderboardCutoff(period, now)],
  };
}

export async function getUsageLeaderboard(
  period: UsageLeaderboardPeriod,
  options: { now?: Date; limit?: number; db?: Queryable } = {},
): Promise<UsageLeaderboardEntry[]> {
  const db = options.db ?? getPool();
  const query = buildUsageLeaderboardQuery(period, options.now ?? new Date(), options.limit);
  const [rows] = await db.query<RowDataPacket[]>(query.sql, query.params);
  return rows.map((row, index) => ({
    rank: index + 1,
    handle: String(row.handle),
    name: String(row.name ?? ""),
    avatarUrl: String(row.avatar_url ?? ""),
    totalTokens: Number(row.total_tokens ?? 0),
    activeDays: Number(row.active_days ?? 0),
  }));
}
