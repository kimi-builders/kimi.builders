/* 社区用量榜(P1-1 + 增强):只聚合主动 opt-in(usage_settings.show_on_leaderboard=1)成员的
   usage_buckets,输出周期 token 总量与活跃天数两个聚合数字,联 users 取展示身份
   (handle/显示名/头像)。隐私边界:项目名、设备、时段等明细列根本不进 SQL。
   token 口径与看板总量一致(见 community.ts / query.ts);活跃天数按 UTC 自然日计
   (社区参考口径,连接池两端都是 UTC,见 db.ts)。

   增强(24H/7D/30D 周期、分 Agent/分模型榜、预估费用、我的排名):
   - 周期 cutoff = now - 24h/7d/30d 的 DATETIME(3) UTC 串(比较口径同 retention.ts)。
   - 分维度榜在同一查询上加 source / canonical 模型表达式过滤,只改 WHERE,不改输出列。
   - 预估费用只在总榜 TOP 50 候选池内计算:估费要逐「用户 × 日 × source × 模型」
     匹配版本化价格表(pricing.ts,与看板同口径:stored cost_micros 事实 + 查询期估算),
     对全量 opt-in 群体逐桶估价超出一个榜单页的预算。行按 UTC 日聚合仅为匹配价格
     生效窗口(窗口跨日的边缘天按当天 00:00 UTC 取价,价格极少日内变更,可忽略),
     day 列不输出到页面。legacy(measurement='legacy' 或 model='legacy/unknown')行
     只计 stored 事实,不估算(同看板)。
   - 我的排名:token/活跃天数名次在全量 opt-in 聚合(无 LIMIT,返回行数 = 周期内有
     数据的公开成员数)上取稳定排序位置;费用名次只在 TOP 50 候选池内排序。
     同分处理:主指标降序 → 副指标降序 → handle 字典序,同分不并列,名次即该
     全序下的位置;超出 TOP 50 一律显示 "50+",不暴露精确名次。
   build 前缀 / aggregateUsageLeaderboardCosts / usageLeaderboardRank 是纯函数,便于单测;
   get 前缀才碰 DB。 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";
import { canonicalUsageModel } from "./model-meta";
import {
  estimateCostMicros,
  loadModelPrices,
  matchModelPrice,
  type UsageModelPrice,
  type UsageTokenBreakdown,
} from "./pricing";

type Queryable = Pool | PoolConnection;

export const USAGE_LEADERBOARD_PERIODS = ["24h", "7d", "30d"] as const;
export type UsageLeaderboardPeriod = (typeof USAGE_LEADERBOARD_PERIODS)[number];

/* 榜单最长展示条数;limit 参数会被钳制到这个上界。 */
export const USAGE_LEADERBOARD_LIMIT = 50;

/* 分维度 chips 最多展示的候选数(按周期 token 权重排序)。 */
export const USAGE_LEADERBOARD_DIMENSION_LIMIT = 10;

export interface UsageLeaderboardEntry {
  rank: number;
  /* 内部 join key(费用回填 / 我的排名定位),不在页面渲染。 */
  userId: number;
  handle: string;
  name: string;
  avatarUrl: string;
  totalTokens: number;
  activeDays: number;
}

const PERIOD_MS: Record<UsageLeaderboardPeriod, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/* 五段观测 token 的求和表达式,三个查询共用同一口径(与看板 TOKEN_TOTAL_SQL 一致)。 */
const TOKEN_TOTAL_SQL = `SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                     + b.output_tokens + b.reasoning_output_tokens)`;

/* 分模型榜的分组键:优先采集端归一好的 model_canonical,空则回退原始 model
   (JS 侧别名归一见 model-meta.ts,只在缺失 canonical 的旧行上才有细微差异)。 */
const MODEL_KEY_SQL = "COALESCE(NULLIF(b.model_canonical, ''), b.model)";

export function normalizeUsageLeaderboardPeriod(value: unknown): UsageLeaderboardPeriod {
  return value === "24h" || value === "30d" ? value : "7d";
}

/* 周期下界:now - N,输出 DATETIME(3) UTC 串(比较口径同 retention.ts)。 */
export function usageLeaderboardCutoff(period: UsageLeaderboardPeriod, now: Date): string {
  return new Date(now.getTime() - PERIOD_MS[period])
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

export interface UsageLeaderboardQueryOptions {
  /* 默认 USAGE_LEADERBOARD_LIMIT;0 = 不限(我的排名需要全量 opt-in 排序)。 */
  limit?: number;
  /* 分 Agent 榜:只看该 source 的桶。 */
  source?: string;
  /* 分模型榜:按 canonical 模型表达式匹配。 */
  model?: string;
}

/* 纯 SQL 构建:WHERE 先卡 show_on_leaderboard = 1,再按周期下界聚合;
   SELECT 只有内部 join key + 展示身份 + SUM/COUNT 聚合,没有任何明细维度。 */
export function buildUsageLeaderboardQuery(
  period: UsageLeaderboardPeriod,
  now: Date,
  options: UsageLeaderboardQueryOptions = {},
): { sql: string; params: unknown[] } {
  const rawLimit = options.limit ?? USAGE_LEADERBOARD_LIMIT;
  const capped = Math.max(1, Math.min(USAGE_LEADERBOARD_LIMIT, Math.trunc(rawLimit) || 1));
  const params: unknown[] = [usageLeaderboardCutoff(period, now)];
  let dimension = "";
  if (options.source) {
    dimension = " AND b.source = ?";
    params.push(options.source);
  } else if (options.model) {
    dimension = ` AND ${MODEL_KEY_SQL} = ?`;
    params.push(options.model);
  }
  return {
    sql: `SELECT s.user_id, u.handle, u.name, u.avatar_url,
                 ${TOKEN_TOTAL_SQL} AS total_tokens,
                 COUNT(DISTINCT DATE(b.bucket_start)) AS active_days
          FROM usage_settings s
          JOIN usage_buckets b ON b.user_id = s.user_id AND b.bucket_start >= ?
          JOIN users u ON u.id = s.user_id
          WHERE s.show_on_leaderboard = 1${dimension}
          GROUP BY s.user_id, u.handle, u.name, u.avatar_url
          ORDER BY total_tokens DESC, active_days DESC, u.handle ASC${options.limit === 0 ? "" : `
          LIMIT ${capped}`}`,
    params,
  };
}

export type UsageLeaderboardDimension = "source" | "model";

/* 分维度 chips 候选:opt-in 群体内按周期 token 权重取前 N 个 source / canonical 模型。
   维度值只来自聚合分组键,不含任何项目/设备/时段明细。 */
export function buildUsageLeaderboardDimensionQuery(
  dimension: UsageLeaderboardDimension,
  period: UsageLeaderboardPeriod,
  now: Date,
  limit: number = USAGE_LEADERBOARD_DIMENSION_LIMIT,
): { sql: string; params: unknown[] } {
  const key = dimension === "source" ? "b.source" : MODEL_KEY_SQL;
  const capped = Math.max(1, Math.min(20, Math.trunc(limit) || 1));
  return {
    sql: `SELECT ${key} AS k, ${TOKEN_TOTAL_SQL} AS w
          FROM usage_settings s
          JOIN usage_buckets b ON b.user_id = s.user_id AND b.bucket_start >= ?
          WHERE s.show_on_leaderboard = 1
          GROUP BY k
          ORDER BY w DESC, k ASC
          LIMIT ${capped}`,
    params: [usageLeaderboardCutoff(period, now)],
  };
}

/* 费用明细查询:只服务于 TOP 50 候选池(userIds 来自榜单查询结果,同请求内派生,
   已卡 show_on_leaderboard = 1,非用户输入;校验为整数后字面展开,避免依赖驱动
   的 IN 数组展开行为)。输出按「用户 × UTC 日 × source × 模型 × 计费档」聚合,
   供 JS 侧逐行匹配版本化价格表;项目/设备/小时内时段等明细列不进语句。 */
export function buildUsageLeaderboardCostQuery(
  userIds: readonly number[],
  period: UsageLeaderboardPeriod,
  now: Date,
): { sql: string; params: unknown[] } {
  if (userIds.length === 0) throw new Error("leaderboard cost query needs at least one user id");
  const ids = userIds.map((id) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid leaderboard user id: ${id}`);
    return n;
  });
  return {
    sql: `SELECT b.user_id, b.source, b.model, b.model_canonical, b.model_provider,
                 b.context_tier, b.measurement, DATE(b.bucket_start) AS day,
                 SUM(b.input_tokens) AS input_tokens,
                 SUM(b.cache_write_input_tokens) AS cache_write_input_tokens,
                 SUM(b.cache_write_5m_input_tokens) AS cache_write_5m_input_tokens,
                 SUM(b.cache_write_1h_input_tokens) AS cache_write_1h_input_tokens,
                 SUM(b.cache_read_input_tokens) AS cache_read_input_tokens,
                 SUM(b.output_tokens) AS output_tokens,
                 SUM(b.reasoning_output_tokens) AS reasoning_output_tokens,
                 SUM(COALESCE(b.cost_micros, 0)) AS stored_cost_micros
          FROM usage_buckets b
          WHERE b.user_id IN (${ids.join(",")})
            AND b.bucket_start >= ?
          GROUP BY b.user_id, b.source, b.model, b.model_canonical, b.model_provider,
                   b.context_tier, b.measurement, day`,
    params: [usageLeaderboardCutoff(period, now)],
  };
}

export interface UsageLeaderboardCostRow {
  user_id: unknown;
  source: unknown;
  model: unknown;
  model_canonical: unknown;
  model_provider: unknown;
  context_tier: unknown;
  measurement: unknown;
  day: unknown;
  input_tokens: unknown;
  cache_write_input_tokens: unknown;
  cache_write_5m_input_tokens: unknown;
  cache_write_1h_input_tokens: unknown;
  cache_read_input_tokens: unknown;
  output_tokens: unknown;
  reasoning_output_tokens: unknown;
  stored_cost_micros: unknown;
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

const LEGACY_MODEL = "legacy/unknown";

/* 把费用明细行逐行估费并累加为 用户 → 微美元。口径同看板:stored cost_micros
   事实 + 版本化价格表估算;legacy 行只计 stored。 */
export function aggregateUsageLeaderboardCosts(
  rows: readonly UsageLeaderboardCostRow[],
  prices: readonly UsageModelPrice[],
): Map<number, number> {
  const micros = new Map<number, number>();
  for (const row of rows) {
    const tokens: UsageTokenBreakdown = {
      inputTokens: num(row.input_tokens),
      cacheWriteInputTokens: num(row.cache_write_input_tokens),
      cacheWrite5mInputTokens: num(row.cache_write_5m_input_tokens),
      cacheWrite1hInputTokens: num(row.cache_write_1h_input_tokens),
      cacheReadInputTokens: num(row.cache_read_input_tokens),
      outputTokens: num(row.output_tokens),
      reasoningOutputTokens: num(row.reasoning_output_tokens),
    };
    const isLegacy =
      String(row.measurement) === "legacy" || String(row.model) === LEGACY_MODEL;
    const estimate = isLegacy
      ? null
      : estimateCostMicros(
          tokens,
          matchModelPrice(
            prices,
            canonicalUsageModel({
              source: row.source,
              model: row.model,
              modelCanonical: row.model_canonical,
              modelProvider: row.model_provider,
            }),
            row.day instanceof Date ? row.day : new Date(String(row.day)),
            String(row.source),
            String(row.context_tier ?? "") || undefined,
          ),
          String(row.context_tier ?? "") || undefined,
        );
    const userId = num(row.user_id);
    micros.set(
      userId,
      (micros.get(userId) ?? 0) + num(row.stored_cost_micros) + (estimate?.micros ?? 0),
    );
  }
  return micros;
}

export type UsageLeaderboardMetric = "tokens" | "days" | "cost";

export interface UsageLeaderboardRankInput {
  userId: number;
  handle: string;
  totalTokens: number;
  activeDays: number;
  costMicros?: number;
}

function metricValue(entry: UsageLeaderboardRankInput, metric: UsageLeaderboardMetric): number {
  if (metric === "days") return entry.activeDays;
  if (metric === "cost") return entry.costMicros ?? 0;
  return entry.totalTokens;
}

/* 稳定全序:主指标降序 → 副指标降序 → handle 字典序(与榜单 SQL 的
   ORDER BY 同风格);同分不并列,名次 = 该全序下的 1 起位置,不在榜返回 null。 */
export function usageLeaderboardRank(
  entries: readonly UsageLeaderboardRankInput[],
  userId: number,
  metric: UsageLeaderboardMetric,
): number | null {
  const sorted = [...entries].sort((a, b) =>
    metricValue(b, metric) - metricValue(a, metric)
    || b.totalTokens - a.totalTokens
    || b.activeDays - a.activeDays
    || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0),
  );
  const index = sorted.findIndex((entry) => entry.userId === userId);
  return index < 0 ? null : index + 1;
}

/* 展示口径:超出 TOP N 一律 "N+",不暴露精确名次;不在榜为 "—"。 */
export function displayUsageLeaderboardRank(
  rank: number | null,
  limit: number = USAGE_LEADERBOARD_LIMIT,
): string {
  if (rank === null) return "—";
  return rank > limit ? `${limit}+` : String(rank);
}

export async function getUsageLeaderboard(
  period: UsageLeaderboardPeriod,
  options: {
    now?: Date;
    limit?: number;
    source?: string;
    model?: string;
    db?: Queryable;
  } = {},
): Promise<UsageLeaderboardEntry[]> {
  const db = options.db ?? getPool();
  const query = buildUsageLeaderboardQuery(period, options.now ?? new Date(), options);
  const [rows] = await db.query<RowDataPacket[]>(query.sql, query.params);
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: num(row.user_id),
    handle: String(row.handle),
    name: String(row.name ?? ""),
    avatarUrl: String(row.avatar_url ?? ""),
    totalTokens: Number(row.total_tokens ?? 0),
    activeDays: Number(row.active_days ?? 0),
  }));
}

export async function getUsageLeaderboardDimensions(
  dimension: UsageLeaderboardDimension,
  period: UsageLeaderboardPeriod,
  options: { now?: Date; limit?: number; db?: Queryable } = {},
): Promise<string[]> {
  const db = options.db ?? getPool();
  const query = buildUsageLeaderboardDimensionQuery(
    dimension,
    period,
    options.now ?? new Date(),
    options.limit,
  );
  const [rows] = await db.query<RowDataPacket[]>(query.sql, query.params);
  /* 空串维度值(历史脏数据)不出现在 chips 里,避免选中态永远落回默认值 */
  return rows.map((row) => String(row.k)).filter((k) => k.length > 0);
}

export async function getUsageLeaderboardCosts(
  userIds: readonly number[],
  period: UsageLeaderboardPeriod,
  options: { now?: Date; db?: Queryable } = {},
): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const db = options.db ?? getPool();
  const prices = await loadModelPrices(db);
  const query = buildUsageLeaderboardCostQuery(userIds, period, options.now ?? new Date());
  const [rows] = await db.query<RowDataPacket[]>(query.sql, query.params);
  /* 驱动行 ⇄ 契约行:DB 边界一次性转换(列集由 buildUsageLeaderboardCostQuery 固定) */
  return aggregateUsageLeaderboardCosts(rows as unknown as UsageLeaderboardCostRow[], prices);
}
