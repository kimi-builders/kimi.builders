/* 用量看板查询层(Phase 2)。
   所有 section 共用 filters.ts 的 WHERE;估费统一走 pricing.ts。
   粒度策略:bucket 侧 SQL 按 (本地日, source, model) 细粒度返回,JS 里用同一份行集
   汇总 totals/trend,并逐行估费 —— 趋势、总览、估费不可能互相漂移。
   会话表没有 model 列:模型筛选只作用于 bucket 派生指标(见 filters.ts 注释)。 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import {
  bucketFilterSql,
  localDayExpr,
  localHourExpr,
  localWeekdayExpr,
  parseUsageFilters,
  sessionFilterSql,
  type UsageFilters,
  type UsageMetric,
} from "./filters";

/* 趋势时间格表达式:hour → 'YYYY-MM-DD HH:00'(本地);week → 本地周一日;day → 本地日。 */
function trendTimeExpr(column: string, filters: UsageFilters): string {
  const shifted = `DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE)`;
  if (filters.granularity === "hour") {
    return `DATE_FORMAT(${shifted}, '%Y-%m-%d %H:00')`;
  }
  if (filters.granularity === "week") {
    return `DATE(DATE_SUB(${shifted}, INTERVAL WEEKDAY(${shifted}) DAY))`;
  }
  return `DATE(${shifted})`;
}

/* DATE_FORMAT 返回字符串;DATE() 经 timezone:'Z' 返回 UTC Date。 */
function trendKeyOf(value: unknown, granularity: UsageFilters["granularity"]): string {
  if (granularity === "hour") return String(value);
  return utcDay(value);
}
import {
  createPricingLedger,
  estimateCostMicros,
  loadModelPrices,
  matchModelPrice,
  type UsageTokenBreakdown,
} from "./pricing";

export interface UsageTotals extends UsageTokenBreakdown {
  totalTokens: number;
  requests: number;
  sessions: number;
  userMessages: number;
  /* 会话总消息数(含 assistant);legacy 行无此口径 */
  messages: number;
  activeSeconds: number;
  /* 会话墙钟时长(first→last)之和;legacy 行无此口径 */
  durationSeconds: number;
  /* legacy 存储值 + 查询期估费之和;未定价模型永远不在其中。 */
  costMicros: number;
  /* 筛选范围内出现过事实数据的设备数 */
  activeDevices: number;
}

export interface UsageTrendDay extends UsageTokenBreakdown {
  day: string;
  totalTokens: number;
  requests: number;
  sessions: number;
  activeSeconds: number;
  costMicros: number;
}

export interface UsageHeatmap {
  /* 7(周一..周日)× 24(本地小时) */
  tokens: number[][];
  costMicros: number[][];
  activeSeconds: number[][];
  prompts: number[][];
}

export interface UsageDistributionRow {
  key: string;
  label: string;
  tokens: number;
  costMicros: number;
  share: number;
  hasUnpriced: boolean;
}

export interface UsageDistribution {
  rows: UsageDistributionRow[];
  totalTokens: number;
  totalCostMicros: number;
}

export interface UsageRecordRow extends UsageTokenBreakdown {
  day: string;
  /* grain=bucket 时为本桶起点(UTC ISO);day 粒度为 null */
  time: string | null;
  source: string;
  model: string;
  /* null = 未上传(项目名上传关闭期间的数据) */
  project: string | null;
  deviceId: string;
  deviceName: string;
  totalTokens: number;
  requests: number;
  costMicros: number;
  priceStatus: "priced" | "partial" | "unpriced" | "legacy";
}

export interface UsageFilterOptions {
  sources: string[];
  models: string[];
  projects: string[];
  devices: { id: string; name: string }[];
}

export interface UsageOverview {
  days: number;
  range: { label: string; from: string; to: string };
  filters: {
    sources: string[] | null;
    models: string[] | null;
    projects: string[] | null;
    devices: string[] | null;
    metric: UsageMetric;
  };
  totals: UsageTotals;
  trend: UsageTrendDay[];
  heatmap: UsageHeatmap;
  distributions: {
    source: UsageDistribution;
    model: UsageDistribution;
    project: UsageDistribution;
    device: UsageDistribution;
  };
  records: {
    rows: UsageRecordRow[];
    total: number;
    page: number;
    pageSize: number;
  };
  options: UsageFilterOptions;
  /* 上一等长周期同口径总量(环比;costMicros 含其窗口内的查询期估费) */
  previous: {
    inputTokens: number;
    cacheWriteInputTokens: number;
    cacheReadInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
    requests: number;
    sessions: number;
    messages: number;
    userMessages: number;
    activeSeconds: number;
    durationSeconds: number;
    costMicros: number;
  };
  /* 已链接且未撤销的设备总数(不随筛选变化) */
  activeDevices: number;
  lastSyncAt: Date | null;
  meta: {
    pricingVersions: string[];
    unpricedModels: string[];
    partialModels: string[];
    tzOffsetMinutes: number;
    generatedAt: string;
  };
}

const LEGACY_MODEL = "legacy/unknown";

function num(value: unknown): number {
  return Number(value ?? 0);
}

function utcDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function tokensOf(row: RowDataPacket): UsageTokenBreakdown {
  return {
    inputTokens: num(row.input_tokens),
    cacheWriteInputTokens: num(row.cache_write_input_tokens),
    cacheReadInputTokens: num(row.cache_read_input_tokens),
    outputTokens: num(row.output_tokens),
    reasoningOutputTokens: num(row.reasoning_output_tokens),
  };
}

function totalOf(tokens: UsageTokenBreakdown): number {
  return (
    tokens.inputTokens +
    tokens.cacheWriteInputTokens +
    tokens.cacheReadInputTokens +
    tokens.outputTokens +
    tokens.reasoningOutputTokens
  );
}

function emptyHeatmap(): UsageHeatmap {
  const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  return { tokens: grid(), costMicros: grid(), activeSeconds: grid(), prompts: grid() };
}

/* 明细查询(分页/导出共用同一段 SQL,防止口径漂移)。 */
function recordsQuery(
  userId: number,
  filters: UsageFilters,
  limit: number,
  offset: number,
): { sql: string; params: unknown[] } {
  const filtered = bucketFilterSql(userId, filters, "b");
  const fine = filters.grain === "bucket";
  return {
    sql: `SELECT ${localDayExpr("b.bucket_start", filters)} AS day,
            ${fine ? "b.bucket_start AS bucket_time," : "NULL AS bucket_time,"}
            b.source, b.model, b.project_label,
            d.public_id AS device_public_id, d.name AS device_name,
            MIN(b.bucket_start) AS sample_at,
            MAX(b.measurement) AS measurement,
            SUM(b.input_tokens) AS input_tokens,
            SUM(b.cache_write_input_tokens) AS cache_write_input_tokens,
            SUM(b.cache_read_input_tokens) AS cache_read_input_tokens,
            SUM(b.output_tokens) AS output_tokens,
            SUM(b.reasoning_output_tokens) AS reasoning_output_tokens,
            SUM(b.request_count) AS request_count,
            SUM(COALESCE(b.cost_micros, 0)) AS stored_cost_micros,
            (SUM(b.input_tokens) + SUM(b.cache_write_input_tokens) + SUM(b.cache_read_input_tokens)
             + SUM(b.output_tokens) + SUM(b.reasoning_output_tokens)) AS total_tokens
     FROM usage_buckets b
     JOIN usage_devices d ON d.id = b.device_id
     WHERE ${filtered.where}
     GROUP BY day, ${fine ? "b.bucket_start, " : ""}b.source, b.model, b.project_label, d.public_id, d.name
     ORDER BY ${fine ? "b.bucket_start" : "day"} DESC, total_tokens DESC
     LIMIT ? OFFSET ?`,
    params: [...filtered.params, limit, offset],
  };
}

function recordsCountQuery(
  userId: number,
  filters: UsageFilters,
): { sql: string; params: unknown[] } {
  const filtered = bucketFilterSql(userId, filters, "b");
  return {
    sql: `SELECT COUNT(*) AS groups_count FROM (
       SELECT 1
       FROM usage_buckets b
       WHERE ${filtered.where}
       GROUP BY ${localDayExpr("b.bucket_start", filters)}, ${filters.grain === "bucket" ? "b.bucket_start, " : ""}b.source, b.model, b.project_label, b.device_id
     ) grouped`,
    params: filtered.params,
  };
}

function mapRecordRow(
  row: RowDataPacket,
  prices: Awaited<ReturnType<typeof loadModelPrices>>,
): UsageRecordRow {
  const tokens = tokensOf(row);
  const isLegacy = String(row.measurement) === "legacy";
  const estimate = isLegacy
    ? null
    : estimateCostMicros(
        tokens,
        matchModelPrice(
          prices,
          String(row.model),
          new Date(row.sample_at as string),
          String(row.source),
        ),
      );
  return {
    day: utcDay(row.day),
    time:
      row.bucket_time instanceof Date
        ? row.bucket_time.toISOString()
        : row.bucket_time
          ? String(row.bucket_time)
          : null,
    source: String(row.source),
    model: String(row.model),
    project: row.project_label === null ? null : String(row.project_label),
    deviceId: String(row.device_public_id),
    deviceName: String(row.device_name),
    ...tokens,
    totalTokens: totalOf(tokens),
    requests: num(row.request_count),
    costMicros: num(row.stored_cost_micros) + (estimate?.micros ?? 0),
    priceStatus: isLegacy ? "legacy" : (estimate?.status ?? "unpriced"),
  };
}

/* 导出/明细列表专用:按当前筛选取聚合记录(最多 limit 行)。 */
export async function listUsageRecords(
  userId: number,
  filters: UsageFilters,
  limit: number,
): Promise<UsageRecordRow[]> {
  const pool = getPool();
  const prices = await loadModelPrices(pool);
  const { sql, params } = recordsQuery(userId, filters, limit, 0);
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => mapRecordRow(row, prices));
}

const TOKEN_SUMS = `SUM(input_tokens) AS input_tokens,
  SUM(cache_write_input_tokens) AS cache_write_input_tokens,
  SUM(cache_read_input_tokens) AS cache_read_input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(reasoning_output_tokens) AS reasoning_output_tokens,
  SUM(request_count) AS request_count,
  SUM(COALESCE(cost_micros, 0)) AS stored_cost_micros,
  SUM(legacy_active_seconds) AS legacy_active_seconds,
  SUM(legacy_session_count) AS legacy_session_count`;

function emptyTotals(): UsageTotals {
  return {
    inputTokens: 0,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    requests: 0,
    sessions: 0,
    userMessages: 0,
    activeSeconds: 0,
    durationSeconds: 0,
    messages: 0,
    costMicros: 0,
    activeDevices: 0,
  };
}

export async function getUsageOverview(
  userId: number,
  filters: UsageFilters,
): Promise<UsageOverview> {
  const pool = getPool();
  const prices = await loadModelPrices(pool);
  const bucket = bucketFilterSql(userId, filters);
  const session = sessionFilterSql(userId, filters);
  const trendBucket = trendTimeExpr("bucket_start", filters);
  const trendSession = trendTimeExpr("first_message_at", filters);

  const rangeOnly: UsageFilters = {
    ...filters,
    sources: null,
    models: null,
    projects: null,
    devices: null,
  };
  const rangeBucket = bucketFilterSql(userId, rangeOnly);

  const prevSpan = filters.to.getTime() - filters.from.getTime();
  const prevFilters: UsageFilters = {
    ...filters,
    from: new Date(filters.from.getTime() - prevSpan),
    to: filters.from,
  };
  const prevBucket = bucketFilterSql(userId, prevFilters);
  const prevSession = sessionFilterSql(userId, prevFilters);

  const recordsQ = recordsQuery(
    userId,
    filters,
    filters.pageSize,
    (filters.page - 1) * filters.pageSize,
  );
  const recordsCountQ = recordsCountQuery(userId, filters);
  const queries: Promise<RowDataPacket[]>[] = [
    // 0 趋势+总览:本地日 × source × model
    pool
      .query<RowDataPacket[]>(
        `SELECT ${trendBucket} AS day, source, model, MIN(bucket_start) AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucket.where}
         GROUP BY ${trendBucket}, source, model
         ORDER BY day`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 1 会话日聚合
    pool
      .query<RowDataPacket[]>(
        `SELECT ${trendSession} AS day,
                COUNT(*) AS session_count,
                SUM(active_seconds) AS active_seconds,
                SUM(duration_seconds) AS duration_seconds,
                SUM(message_count) AS message_count,
                SUM(user_message_count) AS user_messages,
                COUNT(DISTINCT device_id) AS device_count
         FROM usage_sessions
         WHERE ${session.where}
         GROUP BY ${trendSession}`,
        session.params,
      )
      .then(([rows]) => rows),
    // 2 热图 token/cost:星期×小时×(source,model)
    pool
      .query<RowDataPacket[]>(
        `SELECT ${localWeekdayExpr("bucket_start", filters)} AS weekday,
                ${localHourExpr("bucket_start", filters)} AS hour,
                source, model, MIN(bucket_start) AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucket.where}
         GROUP BY weekday, hour, source, model`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 3 热图时长:会话开始时刻落格
    pool
      .query<RowDataPacket[]>(
        `SELECT ${localWeekdayExpr("first_message_at", filters)} AS weekday,
                ${localHourExpr("first_message_at", filters)} AS hour,
                SUM(active_seconds) AS active_seconds
         FROM usage_sessions
         WHERE ${session.where}
         GROUP BY weekday, hour`,
        session.params,
      )
      .then(([rows]) => rows),
    // 4 提示热图直方图
    pool
      .query<RowDataPacket[]>(
        `SELECT first_message_at, user_prompt_hours
         FROM usage_sessions
         WHERE ${session.where}`,
        session.params,
      )
      .then(([rows]) => rows),
    // 5 设备数(范围内去重:bucket 侧 ∪ 会话侧在 JS 合并)
    pool
      .query<RowDataPacket[]>(
        `SELECT DISTINCT device_id FROM usage_buckets WHERE ${bucket.where}`,
        bucket.params,
      )
      .then(([rows]) => rows),
    pool
      .query<RowDataPacket[]>(
        `SELECT DISTINCT device_id FROM usage_sessions WHERE ${session.where}`,
        session.params,
      )
      .then(([rows]) => rows),
    // 7 已链接设备总数(不随筛选)
    pool
      .query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM usage_devices WHERE user_id = ? AND revoked_at IS NULL`,
        [userId],
      )
      .then(([rows]) => rows),
    // 8 最近同步
    pool
      .query<RowDataPacket[]>(
        `SELECT MAX(last_sync) AS last_sync FROM (
           SELECT MAX(updated_at) AS last_sync FROM usage_buckets WHERE user_id = ?
           UNION ALL
           SELECT MAX(updated_at) AS last_sync FROM usage_sessions WHERE user_id = ?
         ) syncs`,
        [userId, userId],
      )
      .then(([rows]) => rows),
    // 9 分布:source
    pool
      .query<RowDataPacket[]>(
        `SELECT source AS k, source, model, MIN(bucket_start) AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucket.where}
         GROUP BY source, model`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 10 分布:project('' = 未上传)
    filters.projectsEnabled
      ? pool
          .query<RowDataPacket[]>(
            `SELECT COALESCE(project_label, '') AS k, source, model, MIN(bucket_start) AS sample_at, ${TOKEN_SUMS}
             FROM usage_buckets
             WHERE ${bucket.where}
             GROUP BY k, source, model`,
            bucket.params,
          )
          .then(([rows]) => rows)
      : Promise.resolve([]),
    // 11 分布:device
    pool
      .query<RowDataPacket[]>(
        `SELECT d.public_id AS k, d.name AS device_name, b.source, b.model,
                MIN(b.bucket_start) AS sample_at,
                SUM(b.input_tokens) AS input_tokens,
                SUM(b.cache_write_input_tokens) AS cache_write_input_tokens,
                SUM(b.cache_read_input_tokens) AS cache_read_input_tokens,
                SUM(b.output_tokens) AS output_tokens,
                SUM(b.reasoning_output_tokens) AS reasoning_output_tokens,
                SUM(b.request_count) AS request_count,
                SUM(COALESCE(b.cost_micros, 0)) AS stored_cost_micros,
                0 AS legacy_active_seconds,
                0 AS legacy_session_count
         FROM usage_buckets b
         JOIN usage_devices d ON d.id = b.device_id
         WHERE ${bucketFilterSql(userId, filters, "b").where}
         GROUP BY d.public_id, d.name, b.source, b.model`,
        bucketFilterSql(userId, filters, "b").params,
      )
      .then(([rows]) => rows),
    // 12 明细:本地日 × source × model × project × device(分页)
    pool
      .query<RowDataPacket[]>(recordsQ.sql, recordsQ.params)
      .then(([rows]) => rows),
    // 13 明细总行数
    pool
      .query<RowDataPacket[]>(recordsCountQ.sql, recordsCountQ.params)
      .then(([rows]) => rows),
    // 14 筛选项候选(只看用户+时间范围)
    pool
      .query<RowDataPacket[]>(
        `SELECT DISTINCT source FROM usage_buckets WHERE ${rangeBucket.where} ORDER BY source`,
        rangeBucket.params,
      )
      .then(([rows]) => rows),
    pool
      .query<RowDataPacket[]>(
        `SELECT model,
                SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens + output_tokens + reasoning_output_tokens) AS total
         FROM usage_buckets WHERE ${rangeBucket.where}
         GROUP BY model ORDER BY total DESC LIMIT 50`,
        rangeBucket.params,
      )
      .then(([rows]) => rows),
    filters.projectsEnabled
      ? pool
          .query<RowDataPacket[]>(
            `SELECT DISTINCT project_label FROM usage_buckets
             WHERE ${rangeBucket.where} AND project_label IS NOT NULL
             ORDER BY project_label LIMIT 50`,
            rangeBucket.params,
          )
          .then(([rows]) => rows)
      : Promise.resolve([]),
    pool
      .query<RowDataPacket[]>(
        `SELECT public_id, name FROM usage_devices
         WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at`,
        [userId],
      )
      .then(([rows]) => rows),
    // 18/19 上一等长周期(环比):同筛选,窗口整体前移一个 span
    pool
      .query<RowDataPacket[]>(
        `SELECT source, model, MIN(bucket_start) AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${prevBucket.where}
         GROUP BY source, model`,
        prevBucket.params,
      )
      .then(([rows]) => rows),
    pool
      .query<RowDataPacket[]>(
        `SELECT COUNT(*) AS session_count,
                SUM(active_seconds) AS active_seconds,
                SUM(duration_seconds) AS duration_seconds,
                SUM(message_count) AS message_count,
                SUM(user_message_count) AS user_messages
         FROM usage_sessions
         WHERE ${prevSession.where}`,
        prevSession.params,
      )
      .then(([rows]) => rows),
  ];

  const [
    bucketRows,
    sessionDayRows,
    heatBucketRows,
    heatSessionRows,
    promptRows,
    bucketDeviceRows,
    sessionDeviceRows,
    linkedDeviceRows,
    syncRows,
    sourceDistRows,
    projectDistRows,
    deviceDistRows,
    recordRows,
    recordCountRows,
    optionSourceRows,
    optionModelRows,
    optionProjectRows,
    optionDeviceRows,
    prevBucketRows,
    prevSessionRows,
  ] = await Promise.all(queries);

  // 全量估费台账:unpriced/partial 名册 + 总估费(trend 部分)。
  const ledger = createPricingLedger();

  // —— 趋势 + 总览(同一份 本地日×source×model 行集) ——
  const byDay = new Map<string, UsageTrendDay>();
  const ensureDay = (key: string): UsageTrendDay => {
    let value = byDay.get(key);
    if (!value) {
      value = {
        day: key,
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
      byDay.set(key, value);
    }
    return value;
  };
  const totals = emptyTotals();
  const addTokens = (target: UsageTokenBreakdown, tokens: UsageTokenBreakdown) => {
    target.inputTokens += tokens.inputTokens;
    target.cacheWriteInputTokens += tokens.cacheWriteInputTokens;
    target.cacheReadInputTokens += tokens.cacheReadInputTokens;
    target.outputTokens += tokens.outputTokens;
    target.reasoningOutputTokens += tokens.reasoningOutputTokens;
  };
  /* 逐行估费:同时累计当日与全局台账(用 before/after 差值,保证两处一致)。 */
  const priceRow = (
    row: RowDataPacket,
    tokens: UsageTokenBreakdown,
  ): number => {
    const model = String(row.model);
    if (model === LEGACY_MODEL) return 0;
    const before = ledger.micros;
    const estimate = estimateCostMicros(
      tokens,
      matchModelPrice(prices, model, new Date(row.sample_at as string), String(row.source)),
    );
    ledger.micros += estimate.micros;
    if (estimate.version) ledger.versions.add(estimate.version);
    if (estimate.status === "unpriced") ledger.unpricedModels.add(model);
    if (estimate.status === "partial") ledger.partialModels.add(model);
    return ledger.micros - before;
  };

  for (const row of bucketRows) {
    const tokens = tokensOf(row);
    const item = ensureDay(trendKeyOf(row.day, filters.granularity));
    const estimated = priceRow(row, tokens);
    const stored = num(row.stored_cost_micros);
    addTokens(item, tokens);
    item.requests += num(row.request_count);
    item.activeSeconds += num(row.legacy_active_seconds);
    item.sessions += num(row.legacy_session_count);
    item.costMicros += stored + estimated;
    addTokens(totals, tokens);
    totals.requests += num(row.request_count);
    totals.activeSeconds += num(row.legacy_active_seconds);
    totals.sessions += num(row.legacy_session_count);
    totals.costMicros += stored + estimated;
  }
  for (const row of sessionDayRows) {
    const item = ensureDay(trendKeyOf(row.day, filters.granularity));
    item.sessions += num(row.session_count);
    item.activeSeconds += num(row.active_seconds);
    totals.sessions += num(row.session_count);
    totals.activeSeconds += num(row.active_seconds);
    totals.durationSeconds += num(row.duration_seconds);
    totals.messages += num(row.message_count);
    totals.userMessages += num(row.user_messages);
  }
  for (const item of byDay.values()) item.totalTokens = totalOf(item);
  totals.totalTokens = totalOf(totals);
  // 范围内活跃设备 = bucket ∪ session 事实里的去重 device_id
  totals.activeDevices = new Set(
    [...bucketDeviceRows, ...sessionDeviceRows].map((row) => String(row.device_id)),
  ).size;
  const trend = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  // —— 上一等长周期(环比);独立台账,不污染当前范围的 unpriced/partial 名册 ——
  const previous = {
    inputTokens: 0,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    requests: 0,
    sessions: 0,
    messages: 0,
    userMessages: 0,
    activeSeconds: 0,
    durationSeconds: 0,
    costMicros: 0,
  };
  const prevLedger = createPricingLedger();
  for (const row of prevBucketRows) {
    const tokens = tokensOf(row);
    previous.inputTokens += tokens.inputTokens;
    previous.cacheWriteInputTokens += tokens.cacheWriteInputTokens;
    previous.cacheReadInputTokens += tokens.cacheReadInputTokens;
    previous.outputTokens += tokens.outputTokens;
    previous.reasoningOutputTokens += tokens.reasoningOutputTokens;
    previous.requests += num(row.request_count);
    previous.activeSeconds += num(row.legacy_active_seconds);
    previous.sessions += num(row.legacy_session_count);
    let estimated = 0;
    if (String(row.model) !== LEGACY_MODEL) {
      estimated = estimateCostMicros(
        tokens,
        matchModelPrice(
          prices,
          String(row.model),
          new Date(row.sample_at as string),
          String(row.source),
        ),
      ).micros;
    }
    previous.costMicros += num(row.stored_cost_micros) + estimated;
  }
  const prevSessionAgg = prevSessionRows[0];
  if (prevSessionAgg) {
    previous.sessions += num(prevSessionAgg.session_count);
    previous.activeSeconds += num(prevSessionAgg.active_seconds);
    previous.durationSeconds += num(prevSessionAgg.duration_seconds);
    previous.messages += num(prevSessionAgg.message_count);
    previous.userMessages += num(prevSessionAgg.user_messages);
  }
  previous.totalTokens =
    previous.inputTokens +
    previous.cacheWriteInputTokens +
    previous.cacheReadInputTokens +
    previous.outputTokens +
    previous.reasoningOutputTokens;
  void prevLedger;

  // —— 热图 ——
  const heatmap = emptyHeatmap();
  const inGrid = (weekday: unknown, hour: unknown): weekday is number =>
    Number.isInteger(weekday) &&
    Number.isInteger(hour) &&
    (weekday as number) >= 0 &&
    (weekday as number) <= 6 &&
    (hour as number) >= 0 &&
    (hour as number) <= 23;
  for (const row of heatBucketRows) {
    const weekday = num(row.weekday);
    const hour = num(row.hour);
    if (!inGrid(weekday, hour)) continue;
    const tokens = tokensOf(row);
    heatmap.tokens[weekday][hour] += totalOf(tokens);
    heatmap.costMicros[weekday][hour] +=
      num(row.stored_cost_micros) + priceRow(row, tokens);
  }
  for (const row of heatSessionRows) {
    const weekday = num(row.weekday);
    const hour = num(row.hour);
    if (!inGrid(weekday, hour)) continue;
    heatmap.activeSeconds[weekday][hour] += num(row.active_seconds);
  }
  // 提示热图:user_prompt_hours 是会话级 UTC 小时直方图,
  // 约定按「会话首日 + 直方图 UTC 小时」换算到本地星期×小时。
  for (const row of promptRows) {
    const firstAt = new Date(row.first_message_at as string);
    if (Number.isNaN(firstAt.getTime())) continue;
    let hours: number[];
    try {
      const raw = row.user_prompt_hours as unknown;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed) || parsed.length !== 24) continue;
      hours = parsed.map((value) => num(value));
    } catch {
      continue;
    }
    const firstUtcDay = Date.UTC(
      firstAt.getUTCFullYear(),
      firstAt.getUTCMonth(),
      firstAt.getUTCDate(),
    );
    hours.forEach((count, utcHour) => {
      if (count <= 0) return;
      const local = new Date(
        firstUtcDay + utcHour * 3_600_000 + filters.tzOffsetMinutes * 60_000,
      );
      heatmap.prompts[(local.getUTCDay() + 6) % 7][local.getUTCHours()] += count;
    });
  }

  // —— 分布(token + 估费,Top 6 + 其他) ——
  interface DistInput {
    k: unknown;
    source: unknown;
    model: unknown;
    sample_at: unknown;
    input_tokens: unknown;
    cache_write_input_tokens: unknown;
    cache_read_input_tokens: unknown;
    output_tokens: unknown;
    reasoning_output_tokens: unknown;
    stored_cost_micros: unknown;
    device_name?: unknown;
  }
  const distTokens = (row: DistInput): UsageTokenBreakdown => ({
    inputTokens: num(row.input_tokens),
    cacheWriteInputTokens: num(row.cache_write_input_tokens),
    cacheReadInputTokens: num(row.cache_read_input_tokens),
    outputTokens: num(row.output_tokens),
    reasoningOutputTokens: num(row.reasoning_output_tokens),
  });
  const buildDistribution = (
    rows: DistInput[],
    labelOf: (row: DistInput) => string,
  ): UsageDistribution => {
    interface Acc {
      label: string;
      tokens: number;
      costMicros: number;
      hasUnpriced: boolean;
    }
    const map = new Map<string, Acc>();
    let totalTokens = 0;
    let totalCostMicros = 0;
    for (const row of rows) {
      const key = String(row.k);
      const tokens = distTokens(row);
      const model = String(row.model);
      const stored = num(row.stored_cost_micros);
      let estimated = 0;
      // legacy 迁入行的存储成本是旧口径假值,标记未定价,避免把 $0.00 伪装成准确值
      let unpriced = model === LEGACY_MODEL;
      if (model !== LEGACY_MODEL) {
        const estimate = estimateCostMicros(
          tokens,
          matchModelPrice(
            prices,
            model,
            new Date(row.sample_at as string),
            String(row.source),
          ),
        );
        estimated = estimate.micros;
        unpriced = estimate.status !== "priced";
      }
      let acc = map.get(key);
      if (!acc) {
        acc = { label: labelOf(row), tokens: 0, costMicros: 0, hasUnpriced: false };
        map.set(key, acc);
      }
      const rowTokens = totalOf(tokens);
      acc.tokens += rowTokens;
      acc.costMicros += stored + estimated;
      acc.hasUnpriced ||= unpriced;
      totalTokens += rowTokens;
      totalCostMicros += stored + estimated;
    }
    const sorted = [...map.entries()]
      .map(([key, acc]) => ({ key, ...acc }))
      .sort((a, b) => b.tokens - a.tokens);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    if (rest.length > 0) {
      top.push({
        key: "__other__",
        label: "__other__",
        tokens: rest.reduce((sum, row) => sum + row.tokens, 0),
        costMicros: rest.reduce((sum, row) => sum + row.costMicros, 0),
        hasUnpriced: rest.some((row) => row.hasUnpriced),
      });
    }
    return {
      rows: top.map((row) => ({
        key: row.key,
        label: row.label,
        tokens: row.tokens,
        costMicros: row.costMicros,
        share: totalTokens > 0 ? row.tokens / totalTokens : 0,
        hasUnpriced: row.hasUnpriced,
      })),
      totalTokens,
      totalCostMicros,
    };
  };
  const distributions: UsageOverview["distributions"] = {
    source: buildDistribution(sourceDistRows as unknown as DistInput[], (row) => String(row.k)),
    model: { rows: [], totalTokens: 0, totalCostMicros: 0 },
    project: buildDistribution(projectDistRows as unknown as DistInput[], (row) =>
      row.k === "" ? "" : String(row.k),
    ),
    device: buildDistribution(deviceDistRows as unknown as DistInput[], (row) => String(row.device_name)),
  };
  // model 分布直接由趋势行集派生(少一次查询)
  {
    const modelRows = new Map<string, RowDataPacket[]>();
    for (const row of bucketRows) {
      const model = String(row.model);
      if (!modelRows.has(model)) modelRows.set(model, []);
      modelRows.get(model)!.push(row);
    }
    const synthetic: DistInput[] = [];
    for (const [model, rows] of modelRows) {
      const merged: DistInput = {
        k: model,
        model,
        source: String(rows[0].source),
        sample_at: rows[0].sample_at,
        input_tokens: 0,
        cache_write_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        stored_cost_micros: 0,
      };
      for (const row of rows) {
        merged.input_tokens = num(merged.input_tokens) + num(row.input_tokens);
        merged.cache_write_input_tokens =
          num(merged.cache_write_input_tokens) + num(row.cache_write_input_tokens);
        merged.cache_read_input_tokens =
          num(merged.cache_read_input_tokens) + num(row.cache_read_input_tokens);
        merged.output_tokens = num(merged.output_tokens) + num(row.output_tokens);
        merged.reasoning_output_tokens =
          num(merged.reasoning_output_tokens) + num(row.reasoning_output_tokens);
        merged.stored_cost_micros =
          num(merged.stored_cost_micros) + num(row.stored_cost_micros);
      }
      synthetic.push(merged);
    }
    distributions.model = buildDistribution(synthetic, (row) => String(row.k));
  }

  // —— 明细 ——
  const records: UsageRecordRow[] = recordRows.map((row) => mapRecordRow(row, prices));

  return {
    days: filters.days,
    range: {
      label: filters.rangeLabel,
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
    },
    filters: {
      sources: filters.sources,
      models: filters.models,
      projects: filters.projects,
      devices: filters.devices,
      metric: filters.metric,
    },
    totals,
    trend,
    previous,
    heatmap,
    distributions,
    records: {
      rows: records,
      total: num(recordCountRows[0]?.groups_count),
      page: filters.page,
      pageSize: filters.pageSize,
    },
    options: {
      sources: optionSourceRows.map((row) => String(row.source)),
      models: optionModelRows.map((row) => String(row.model)),
      projects: optionProjectRows.map((row) => String(row.project_label)),
      devices: optionDeviceRows.map((row) => ({
        id: String(row.public_id),
        name: String(row.name),
      })),
    },
    activeDevices: num(linkedDeviceRows[0]?.count),
    lastSyncAt: (syncRows[0]?.last_sync as Date | null) ?? null,
    meta: {
      pricingVersions: [...ledger.versions].sort(),
      unpricedModels: [...ledger.unpricedModels].sort(),
      partialModels: [...ledger.partialModels].sort(),
      tzOffsetMinutes: filters.tzOffsetMinutes,
      generatedAt: new Date().toISOString(),
    },
  };
}

/* 兼容包装:Phase 1 的调用方(CLI summary 经 HTTP;旧集成测试)仍可按 days 获取
   与旧 getUsageDashboard 同形的数据。 */
export interface UsageDashboardData {
  days: number;
  from: string;
  to: string;
  totals: Omit<UsageTrendDay, "day">;
  trend: UsageTrendDay[];
  activeDevices: number;
  lastSyncAt: Date | null;
}

export async function getUsageDashboard(
  userId: number,
  requestedDays = 30,
): Promise<UsageDashboardData> {
  const days = Math.min(90, Math.max(1, Math.floor(requestedDays)));
  const filters = parseUsageFilters(
    { range: `${days}d` },
    { uploadProject: false, tzOffsetMinutes: 0 },
  );
  const overview = await getUsageOverview(userId, filters);
  return {
    days: overview.days,
    from: overview.range.from,
    to: overview.range.to,
    totals: {
      inputTokens: overview.totals.inputTokens,
      cacheWriteInputTokens: overview.totals.cacheWriteInputTokens,
      cacheReadInputTokens: overview.totals.cacheReadInputTokens,
      outputTokens: overview.totals.outputTokens,
      reasoningOutputTokens: overview.totals.reasoningOutputTokens,
      totalTokens: overview.totals.totalTokens,
      requests: overview.totals.requests,
      sessions: overview.totals.sessions,
      activeSeconds: overview.totals.activeSeconds,
      costMicros: overview.totals.costMicros,
    },
    trend: overview.trend,
    activeDevices: overview.activeDevices,
    lastSyncAt: overview.lastSyncAt,
  };
}
