/* Community usage leaderboard: aggregates only members who opted in
   (usage_settings.show_on_leaderboard=1), outputting period token totals
   and active-day counts, joined with users for display identity
   (handle/name/avatar). Privacy boundary: project, device, and time-of-day
   detail columns never enter the SQL. Tokens match the dashboard total
   (community.ts / query.ts); active days count UTC calendar days (the
   community reference — both pool ends are UTC, see db.ts).

   Enhancements (24H/7D/30D periods, per-agent and per-model boards,
   estimated cost, my rank):
   - Period cutoff = now - 24h/7d/30d as a DATETIME(3) UTC string (same
     comparison convention as retention.ts).
   - Dimension boards add a source / canonical-model expression filter on
     the same query — WHERE only, output columns unchanged.
   - Estimated cost is computed only inside the TOP 50 candidate pool:
     pricing must match the versioned price table per user x day x source x
     model (pricing.ts, same as the dashboard: stored cost_micros facts plus
     query-time estimation); per-bucket pricing for every opt-in member
     exceeds a leaderboard page's budget. Rows aggregate by UTC day only to
     match price effective windows (edge days spanning a window price at
     that day's 00:00 UTC — prices rarely change intra-day); the day column
     never reaches the page. Legacy rows (measurement='legacy' or
     model='legacy/unknown') count stored facts only, no estimation (same
     as the dashboard).
   - My rank: token/active-day positions come from the full opt-in
     aggregate (no LIMIT; row count = public members with data in the
     period) under a stable total order; cost ranks order only within the
     TOP 50 pool. Ties: primary desc -> secondary desc -> handle
     lexicographic — no shared ranks; the rank is the position in that
     total order. Beyond TOP 50 always displays "50+", never an exact rank.
   build-prefixed helpers / aggregateUsageLeaderboardCosts /
   usageLeaderboardRank are pure functions for unit tests; only get-prefixed
   functions touch the DB. */
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

/* Max leaderboard rows shown; the limit parameter is clamped to this
   ceiling. */
export const USAGE_LEADERBOARD_LIMIT = 50;

/* Max dimension-chip candidates shown (ordered by period token weight). */
export const USAGE_LEADERBOARD_DIMENSION_LIMIT = 10;

export interface UsageLeaderboardEntry {
  rank: number;
  /* Internal join key (cost backfill / my-rank lookup), never rendered. */
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

/* Sum expression over the five observed token segments; all three queries
   share it (same as the dashboard's TOKEN_TOTAL_SQL). */
const TOKEN_TOTAL_SQL = `SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                     + b.output_tokens + b.reasoning_output_tokens)`;

/* Per-model board grouping key: prefer the collected model_canonical,
   fall back to the raw model (JS-side alias merging lives in
   model-meta.ts; only old rows missing canonical differ slightly). */
const MODEL_KEY_SQL = "COALESCE(NULLIF(b.model_canonical, ''), b.model)";

export function normalizeUsageLeaderboardPeriod(value: unknown): UsageLeaderboardPeriod {
  return value === "24h" || value === "30d" ? value : "7d";
}

/* Period lower bound: now - N as a DATETIME(3) UTC string (same comparison
   convention as retention.ts). */
export function usageLeaderboardCutoff(period: UsageLeaderboardPeriod, now: Date): string {
  return new Date(now.getTime() - PERIOD_MS[period])
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

export interface UsageLeaderboardQueryOptions {
  /* Defaults to USAGE_LEADERBOARD_LIMIT; 0 = unlimited (my-rank needs the
     full opt-in ordering). */
  limit?: number;
  /* Per-agent board: only that source's buckets. */
  source?: string;
  /* Per-model board: match on the canonical model expression. */
  model?: string;
}

/* Pure SQL building: WHERE pins show_on_leaderboard = 1 first, then
   aggregates above the period cutoff; SELECT carries only the internal
   join key + display identity + SUM/COUNT aggregates — no detail
   dimension. */
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

/* Dimension-chip candidates: top N sources / canonical models by period
   token weight within the opt-in group. Values come only from grouping
   keys — no project/device/time detail. */
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

/* Cost detail query: serves only the TOP 50 candidate pool (userIds
   derive from the leaderboard result within the same request, not user
   input; the statement still re-pins show_on_leaderboard = 1 in its JOIN,
   so a privacy flip racing the shared snapshot cannot leak a leaver's
   costs). Ids are validated as integers and expanded literally, avoiding
   driver-dependent IN-array expansion. Output aggregates by user x UTC
   day x source x model x billing tier for JS-side per-row matching against
   the versioned price table; project/device/hour detail columns never
   enter the statement. */
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
                 b.context_tier, b.processing_tier, b.measurement, DATE(b.bucket_start) AS day,
                 SUM(b.input_tokens) AS input_tokens,
                 SUM(b.cache_write_input_tokens) AS cache_write_input_tokens,
                 SUM(b.cache_write_5m_input_tokens) AS cache_write_5m_input_tokens,
                 SUM(b.cache_write_1h_input_tokens) AS cache_write_1h_input_tokens,
                 SUM(b.cache_read_input_tokens) AS cache_read_input_tokens,
                 SUM(b.output_tokens) AS output_tokens,
                 SUM(b.reasoning_output_tokens) AS reasoning_output_tokens,
                 SUM(COALESCE(b.cost_micros, 0)) AS stored_cost_micros
          FROM usage_buckets b
          JOIN usage_settings s
            ON s.user_id = b.user_id AND s.show_on_leaderboard = 1
          WHERE b.user_id IN (${ids.join(",")})
            AND b.bucket_start >= ?
          GROUP BY b.user_id, b.source, b.model, b.model_canonical, b.model_provider,
                   b.context_tier, b.processing_tier, b.measurement, day`,
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
  processing_tier?: unknown;
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

/* Price the cost-detail rows and fold them into user -> micro-dollars.
   Same definition as the dashboard: stored cost_micros facts + versioned
   price estimation; legacy rows count stored facts only. */
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
            String(row.processing_tier ?? "standard"),
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

/* Stable total order: primary desc -> secondary desc -> handle
   lexicographic (same style as the board SQL's ORDER BY); no shared ranks,
   rank = 1-based position in that order, null when absent. */
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

/* Display convention: beyond TOP N always "N+", never an exact rank;
   absent is "—". */
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
  /* Empty dimension values (legacy dirty data) never appear in chips, so
     the selected state can't fall back to default forever. */
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
  /* Driver row <-> contract row: converted once at the DB boundary
     (column set fixed by buildUsageLeaderboardCostQuery). */
  return aggregateUsageLeaderboardCosts(rows as unknown as UsageLeaderboardCostRow[], prices);
}
