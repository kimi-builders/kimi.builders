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
  parseUsageFilters,
  sessionFilterSql,
  type UsageFilters,
} from "./filters";
import { usageDeviceDetail, usageDeviceDisplayName } from "./device-label";
import {
  canonicalUsageModel,
  usageModelDisplayName,
} from "./model-meta";

function trendKeyFromInstant(value: unknown, filters: UsageFilters): string {
  const instant = value instanceof Date ? value : new Date(value as string);
  const local = new Date(instant.getTime() + filters.tzOffsetMinutes * 60_000);
  if (filters.granularity === "hour") {
    return `${local.toISOString().slice(0, 13).replace("T", " ")}:00`;
  }
  if (filters.granularity === "week") {
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  }
  return local.toISOString().slice(0, 10);
}

import {
  createPricingLedger,
  estimateCostMicros,
  loadModelPrices,
  matchModelPrice,
  priceIntoLedger,
  type UsageTokenBreakdown,
} from "./pricing";
import type {
  UsageDistribution,
  UsageOverview,
  UsagePricingMatch,
  UsageRecordRow,
  UsageTotals,
  UsageTrendDay,
} from "./query-types";
import {
  aggregateUsageSessionRows,
  createEmptyUsageHeatmap,
} from "./session-aggregate";

export type {
  UsageDistribution,
  UsageDistributionRow,
  UsageFilterOptions,
  UsageHeatmap,
  UsageOverview,
  UsagePricingMatch,
  UsageRecordRow,
  UsageTotals,
  UsageTrendDay,
} from "./query-types";

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
    cacheWrite5mInputTokens: num(row.cache_write_5m_input_tokens),
    cacheWrite1hInputTokens: num(row.cache_write_1h_input_tokens),
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

function canonicalModelOf(row: RowDataPacket): string {
  return canonicalUsageModel({
    source: row.source,
    model: row.model,
    modelCanonical: row.model_canonical,
    modelProvider: row.model_provider,
  });
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
  const localDay = localDayExpr("b.bucket_start", filters);
  return {
    sql: `WITH grouped AS (
            SELECT ${localDay} AS day,
                   ${fine ? "b.bucket_start AS bucket_time," : "NULL AS bucket_time,"}
                   b.source, b.model, b.model_canonical, b.model_provider,
                   b.reasoning_effort, b.agent_version, b.context_tier,
                   b.processing_tier, b.project_label, b.project_hash, b.device_id,
                   SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                       + b.output_tokens + b.reasoning_output_tokens) AS record_total_tokens,
                   COUNT(*) OVER() AS groups_count
            FROM usage_buckets b
            WHERE ${filtered.where}
            GROUP BY day, ${fine ? "b.bucket_start, " : ""}b.source, b.model,
                     b.model_canonical, b.model_provider, b.reasoning_effort,
                     b.agent_version, b.context_tier, b.processing_tier,
                     b.project_label, b.project_hash, b.device_id
          ), selected AS (
            SELECT * FROM grouped
            ORDER BY ${fine ? "bucket_time" : "day"} DESC, record_total_tokens DESC,
                     source, model
            LIMIT ? OFFSET ?
          )
     SELECT selected.day, selected.bucket_time, selected.record_total_tokens,
            selected.groups_count,
            b.source, b.model, b.model_canonical, b.model_provider,
            b.reasoning_effort, b.agent_version, b.context_tier, b.processing_tier,
            b.project_label,
            d.public_id AS device_public_id, d.name AS device_name,
            d.platform AS device_platform, d.surface AS device_surface,
            d.client_version AS device_client_version,
            d.parser_version AS device_parser_version,
            d.terminal_name AS device_terminal_name,
            d.terminal_version AS device_terminal_version,
            d.os_name AS device_os_name, d.os_version AS device_os_version,
            d.architecture AS device_architecture,
            b.bucket_start AS sample_at, b.measurement,
            b.input_tokens, b.cache_write_input_tokens,
            b.cache_write_5m_input_tokens, b.cache_write_1h_input_tokens,
            b.cache_read_input_tokens, b.output_tokens, b.reasoning_output_tokens,
            b.request_count, COALESCE(b.cost_micros, 0) AS stored_cost_micros
     FROM selected
     JOIN usage_buckets b
       ON b.user_id = ? AND b.device_id = selected.device_id
      AND b.source = selected.source AND b.model = selected.model
      AND b.model_canonical = selected.model_canonical
      AND b.model_provider = selected.model_provider
      AND b.reasoning_effort = selected.reasoning_effort
      AND b.agent_version = selected.agent_version
      AND b.context_tier = selected.context_tier
      AND b.processing_tier = selected.processing_tier
      AND b.project_hash = selected.project_hash
      AND b.project_label <=> selected.project_label
      AND ${fine ? "b.bucket_start = selected.bucket_time" : `${localDay} = selected.day`}
     JOIN usage_devices d ON d.id = b.device_id
     WHERE b.bucket_start >= ? AND b.bucket_start < ?
     ORDER BY ${fine ? "selected.bucket_time" : "selected.day"} DESC,
              selected.record_total_tokens DESC, b.bucket_start`,
    params: [...filtered.params, limit, offset, userId, filters.from, filters.to],
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
       GROUP BY ${localDayExpr("b.bucket_start", filters)}, ${filters.grain === "bucket" ? "b.bucket_start, " : ""}b.source, b.model,
                b.model_canonical, b.model_provider, b.reasoning_effort, b.agent_version,
                b.context_tier, b.processing_tier, b.project_label, b.project_hash,
                b.device_id
     ) grouped`,
    params: filtered.params,
  };
}

function mapRecordRows(
  rows: RowDataPacket[],
  prices: Awaited<ReturnType<typeof loadModelPrices>>,
): UsageRecordRow[] {
  const grouped = new Map<string, UsageRecordRow>();
  const statusRank = { priced: 0, partial: 1, unpriced: 2, legacy: 3 } as const;
  for (const row of rows) {
    const day = utcDay(row.day);
    const time = row.bucket_time instanceof Date
      ? row.bucket_time.toISOString()
      : row.bucket_time ? String(row.bucket_time) : null;
    const key = [
      day, time ?? "", row.source, row.model, row.model_canonical,
      row.model_provider, row.reasoning_effort, row.agent_version,
      row.context_tier, row.processing_tier, row.project_label ?? "",
      row.device_public_id,
    ].join("\u0000");
    const tokens = tokensOf(row);
    const isLegacy = String(row.measurement) === "legacy";
    const contextTier = String(row.context_tier ?? "");
    const canonical = canonicalModelOf(row);
    const estimate = isLegacy
      ? null
      : estimateCostMicros(
          tokens,
          matchModelPrice(
            prices,
            canonical,
            new Date(row.sample_at as string),
            String(row.source),
            contextTier || undefined,
          ),
          contextTier || undefined,
        );
    const rowStatus: UsageRecordRow["priceStatus"] = isLegacy
      ? "legacy"
      : (estimate?.status ?? "unpriced");
    let record = grouped.get(key);
    if (!record) {
      const device = {
        name: row.device_name,
        platform: row.device_platform,
        surface: row.device_surface,
        clientVersion: row.device_client_version,
        parserVersion: row.device_parser_version,
        terminalName: row.device_terminal_name,
        terminalVersion: row.device_terminal_version,
        osName: row.device_os_name,
        osVersion: row.device_os_version,
        architecture: row.device_architecture,
      };
      record = {
        day,
        time,
        source: String(row.source),
        model: String(row.model),
        modelCanonical: canonical,
        modelDisplayName: usageModelDisplayName({
          source: row.source,
          model: row.model,
          modelCanonical: row.model_canonical,
          modelProvider: row.model_provider,
        }),
        modelProvider: String(row.model_provider ?? ""),
        reasoningEffort: String(row.reasoning_effort ?? ""),
        agentVersion: String(row.agent_version ?? ""),
        contextTier,
        processingTier: String(row.processing_tier ?? ""),
        project: row.project_label === null ? null : String(row.project_label),
        deviceId: String(row.device_public_id),
        deviceName: usageDeviceDisplayName(device),
        deviceDetail: usageDeviceDetail(device),
        inputTokens: 0,
        cacheWriteInputTokens: 0,
        cacheWrite5mInputTokens: 0,
        cacheWrite1hInputTokens: 0,
        cacheReadInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        requests: 0,
        costMicros: 0,
        priceStatus: rowStatus,
      };
      grouped.set(key, record);
    }
    record.inputTokens += tokens.inputTokens;
    record.cacheWriteInputTokens += tokens.cacheWriteInputTokens;
    record.cacheWrite5mInputTokens = (record.cacheWrite5mInputTokens ?? 0)
      + (tokens.cacheWrite5mInputTokens ?? 0);
    record.cacheWrite1hInputTokens = (record.cacheWrite1hInputTokens ?? 0)
      + (tokens.cacheWrite1hInputTokens ?? 0);
    record.cacheReadInputTokens += tokens.cacheReadInputTokens;
    record.outputTokens += tokens.outputTokens;
    record.reasoningOutputTokens += tokens.reasoningOutputTokens;
    record.totalTokens += totalOf(tokens);
    record.requests += num(row.request_count);
    record.costMicros += num(row.stored_cost_micros) + (estimate?.micros ?? 0);
    if (statusRank[rowStatus] > statusRank[record.priceStatus]) record.priceStatus = rowStatus;
  }
  return [...grouped.values()];
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
  return mapRecordRows(rows, prices);
}

const TOKEN_SUMS = `SUM(input_tokens) AS input_tokens,
  SUM(cache_write_input_tokens) AS cache_write_input_tokens,
  SUM(cache_write_5m_input_tokens) AS cache_write_5m_input_tokens,
  SUM(cache_write_1h_input_tokens) AS cache_write_1h_input_tokens,
  SUM(cache_read_input_tokens) AS cache_read_input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(reasoning_output_tokens) AS reasoning_output_tokens,
  SUM(request_count) AS request_count,
  SUM(COALESCE(cost_micros, 0)) AS stored_cost_micros,
  SUM(legacy_active_seconds) AS legacy_active_seconds,
  SUM(legacy_session_count) AS legacy_session_count`;

const TOKEN_TOTAL_SQL = `(input_tokens + cache_write_input_tokens + cache_read_input_tokens
  + output_tokens + reasoning_output_tokens)`;

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
  const pricesPromise = loadModelPrices(pool);

  const rangeOnly: UsageFilters = {
    ...filters,
    sources: null,
    models: null,
    efforts: null,
    agentVersions: null,
    projects: null,
    devices: null,
  };
  const rangeBucket = bucketFilterSql(userId, rangeOnly);
  const rangeSession = sessionFilterSql(userId, rangeOnly);

  const prevSpan = filters.to.getTime() - filters.from.getTime();
  const prevFilters: UsageFilters = {
    ...filters,
    from: new Date(filters.from.getTime() - prevSpan),
    to: filters.from,
  };

  /* Lifetime 忽略日期范围但保留维度筛选；自然周固定取筛选结束点之前
     最近 12 个周一边界。Lifetime 以请求时刻为终点，避免自定义范围截断累计值。 */
  const generatedAt = new Date();
  const lifetimeFilters: UsageFilters = {
    ...filters,
    from: new Date(0),
    to: generatedAt,
  };
  const lifetimeBucket = bucketFilterSql(userId, lifetimeFilters, "b");
  const tzMs = filters.tzOffsetMinutes * 60_000;
  /* 自然周以主筛选结束点为锚；历史自定义范围因此仍能看到对应时期的 12 周，
     普通预设的 filters.to 就是当前请求时刻。减 1ms 处理恰好落在周一 00:00 的右开边界。 */
  const weeklyAnchor = new Date(filters.to.getTime() - 1);
  const localNowMs = weeklyAnchor.getTime() + tzMs;
  const localDayStartMs = Math.floor(localNowMs / 86_400_000) * 86_400_000;
  const localWeekday = (new Date(localDayStartMs).getUTCDay() + 6) % 7;
  const currentMondayUtcMs = localDayStartMs - localWeekday * 86_400_000 - tzMs;
  const weeklyFilters: UsageFilters = {
    ...filters,
    from: new Date(currentMondayUtcMs - 11 * 7 * 86_400_000),
    to: filters.to,
    granularity: "week",
  };
  const bucketEnvelopeFilters: UsageFilters = {
    ...filters,
    from: new Date(Math.min(prevFilters.from.getTime(), weeklyFilters.from.getTime())),
    to: filters.to,
  };
  const bucketEnvelope = bucketFilterSql(userId, bucketEnvelopeFilters);
  const sessionEnvelopeFilters: UsageFilters = {
    ...filters,
    from: prevFilters.from,
    to: filters.to,
  };
  const sessionEnvelope = sessionFilterSql(userId, sessionEnvelopeFilters);

  const recordsQ = recordsQuery(
    userId,
    filters,
    filters.pageSize,
    (filters.page - 1) * filters.pageSize,
  );
  const recordsCountQ = recordsCountQuery(userId, filters);
  /* 所有筛选候选合成一个结果集：仍按各自索引扫描，但只占一次数据库往返。 */
  const optionParts: { sql: string; params: unknown[] }[] = [
    {
      sql: `SELECT 'source' AS kind, source AS option_value,
                   SUM(${TOKEN_TOTAL_SQL}) AS weight
            FROM usage_buckets WHERE ${rangeBucket.where} GROUP BY source`,
      params: rangeBucket.params,
    },
    {
      sql: `SELECT 'model' AS kind, model AS option_value,
                   SUM(${TOKEN_TOTAL_SQL}) AS weight
            FROM usage_buckets WHERE ${rangeBucket.where} GROUP BY model`,
      params: rangeBucket.params,
    },
    {
      sql: `SELECT 'effort' AS kind, reasoning_effort AS option_value, 0 AS weight
            FROM usage_buckets
            WHERE ${rangeBucket.where} AND reasoning_effort <> ''
            GROUP BY reasoning_effort`,
      params: rangeBucket.params,
    },
    {
      sql: `SELECT 'agentVersion' AS kind, agent_version AS option_value, 0 AS weight
            FROM usage_buckets
            WHERE ${rangeBucket.where} AND agent_version <> ''
            GROUP BY agent_version`,
      params: rangeBucket.params,
    },
    {
      sql: `SELECT 'agentVersion' AS kind, agent_version AS option_value, 0 AS weight
            FROM usage_sessions
            WHERE ${rangeSession.where} AND agent_version <> ''
            GROUP BY agent_version`,
      params: rangeSession.params,
    },
  ];
  if (filters.projectsEnabled) {
    optionParts.push({
      sql: `SELECT 'project' AS kind, project_label AS option_value, 0 AS weight
            FROM usage_buckets
            WHERE ${rangeBucket.where} AND project_label IS NOT NULL
            GROUP BY project_label`,
      params: rangeBucket.params,
    });
  }
  const optionsQ = {
    sql: `WITH option_values AS (
            ${optionParts.map((part) => part.sql).join(" UNION ALL ")}
          ), combined AS (
            SELECT kind, option_value, SUM(weight) AS weight
            FROM option_values
            GROUP BY kind, option_value
          ), ranked AS (
            SELECT kind, option_value,
                   ROW_NUMBER() OVER (
                     PARTITION BY kind
                     ORDER BY CASE WHEN kind IN ('source', 'model') THEN weight ELSE 0 END DESC,
                              option_value
                   ) AS position
            FROM combined
          )
          SELECT kind, option_value FROM ranked
          WHERE position <= 50
          ORDER BY kind, position`,
    params: optionParts.flatMap((part) => part.params),
  };
  const projectColumn = filters.projectsEnabled ? "project_label" : "NULL";
  const projectGroup = filters.projectsEnabled ? "project_label, " : "";
  const queries: Promise<RowDataPacket[]>[] = [
    /* current/previous/weekly 共用一个事实包络。保留 bucket_start 精度，
       才能按历史价格的 effective window 逐行估费。 */
    pool
      .query<RowDataPacket[]>(
        `SELECT device_id, ${projectColumn} AS project_label,
                source, model, model_canonical, model_provider,
                context_tier, processing_tier,
                bucket_start AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucketEnvelope.where}
         GROUP BY bucket_start, device_id, ${projectGroup}source, model,
                  model_canonical, model_provider, context_tier, processing_tier`,
        bucketEnvelope.params,
      )
      .then(([rows]) => rows),
    // current/previous 共用 overlap envelope；v3 小时事实仍由 JS 精确裁剪。
    pool
      .query<RowDataPacket[]>(
        `SELECT device_id, first_message_at, last_message_at,
                active_seconds, duration_seconds, message_count,
                user_message_count, user_prompt_hours
         FROM usage_sessions
         WHERE ${sessionEnvelope.where}`,
        sessionEnvelope.params,
      )
      .then(([rows]) => rows),
    // 明细:本地日 × source × model × project × device(分页+窗口总数)
    pool
      .query<RowDataPacket[]>(recordsQ.sql, recordsQ.params)
      .then(([rows]) => rows),
    // 筛选项候选(只看用户+时间范围；单次往返返回 kind/value)
    pool
      .query<RowDataPacket[]>(optionsQ.sql, optionsQ.params)
      .then(([rows]) => rows),
    /* 分布需要撤销设备的历史标签；筛选项/顶层计数再在 JS 过滤 revoked_at。 */
    pool
      .query<RowDataPacket[]>(
        `SELECT id, public_id, name, platform, surface, client_version, parser_version,
                terminal_name, terminal_version, os_name, os_version, architecture,
                revoked_at
         FROM usage_devices
         WHERE user_id = ? ORDER BY created_at`,
        [userId],
      )
      .then(([rows]) => rows),
    /* Lifetime 保留维度筛选；同一次 bucket 扫描顺带取无筛选最近同步，
       session 最近同步用 scalar subquery 合入同一 statement。 */
    pool
      .query<RowDataPacket[]>(
        `WITH scoped AS (
           SELECT b.input_tokens, b.cache_write_input_tokens,
                  b.cache_read_input_tokens, b.output_tokens,
                  b.reasoning_output_tokens, b.updated_at,
                  (${lifetimeBucket.where}) AS in_lifetime
           FROM usage_buckets b
           WHERE b.user_id = ?
         )
         SELECT
           SUM(CASE WHEN in_lifetime THEN input_tokens ELSE 0 END)
             AS input_tokens,
           SUM(CASE WHEN in_lifetime THEN cache_write_input_tokens ELSE 0 END)
             AS cache_write_input_tokens,
           SUM(CASE WHEN in_lifetime THEN cache_read_input_tokens ELSE 0 END)
             AS cache_read_input_tokens,
           SUM(CASE WHEN in_lifetime THEN output_tokens ELSE 0 END)
             AS output_tokens,
           SUM(CASE WHEN in_lifetime THEN reasoning_output_tokens ELSE 0 END)
             AS reasoning_output_tokens,
           MAX(updated_at) AS bucket_last_sync,
           (SELECT MAX(s.updated_at) FROM usage_sessions s WHERE s.user_id = ?)
             AS session_last_sync
         FROM scoped`,
        [
          ...lifetimeBucket.params,
          userId,
          userId,
        ],
      )
      .then(([rows]) => rows),
  ];

  const [prices, queryResults] = await Promise.all([pricesPromise, Promise.all(queries)]);
  const [
    bucketEnvelopeRows,
    sessionRows,
    recordRows,
    optionRows,
    allDeviceRows,
    lifetimeRows,
  ] = queryResults;
  const bucketRows: RowDataPacket[] = [];
  const prevBucketRows: RowDataPacket[] = [];
  const weeklyRows: RowDataPacket[] = [];
  for (const row of bucketEnvelopeRows) {
    const timestamp = new Date(row.sample_at as string).getTime();
    if (timestamp >= filters.from.getTime() && timestamp < filters.to.getTime()) {
      bucketRows.push(row);
    }
    if (timestamp >= prevFilters.from.getTime() && timestamp < prevFilters.to.getTime()) {
      prevBucketRows.push(row);
    }
    if (timestamp >= weeklyFilters.from.getTime() && timestamp < weeklyFilters.to.getTime()) {
      weeklyRows.push(row);
    }
  }
  const prevSessionRows = sessionRows;

  const deviceById = new Map(allDeviceRows.map((row) => [String(row.id), row]));
  const optionDeviceRows = allDeviceRows.filter((row) => row.revoked_at === null);

  let queryStatements = 1 + queries.length;
  let rowsFetched = prices.length + queryResults.reduce((sum, rows) => sum + rows.length, 0);
  let recordsTotal = num(recordRows[0]?.groups_count);
  if (recordRows.length === 0 && filters.page > 1) {
    const [countRows] = await pool.query<RowDataPacket[]>(recordsCountQ.sql, recordsCountQ.params);
    recordsTotal = num(countRows[0]?.groups_count);
    queryStatements += 1;
    rowsFetched += countRows.length;
  }
  const optionValues = (kind: string) => optionRows
    .filter((row) => String(row.kind) === kind)
    .map((row) => String(row.option_value));

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
  const estimateByRow = new WeakMap<RowDataPacket, ReturnType<typeof estimateCostMicros>>();
  const estimateRow = (row: RowDataPacket, tokens: UsageTokenBreakdown) => {
    const cached = estimateByRow.get(row);
    if (cached) return cached;
    const estimate = estimateCostMicros(
      tokens,
      String(row.model) === LEGACY_MODEL
        ? null
        : matchModelPrice(
            prices,
            canonicalModelOf(row),
            new Date(row.sample_at as string),
            String(row.source),
            String(row.context_tier ?? "") || undefined,
        ),
      String(row.context_tier ?? "") || undefined,
    );
    estimateByRow.set(row, estimate);
    return estimate;
  };

  /* 逐事实时间估费并累计覆盖率。热图/分布只复用 estimateRow,不得重复污染台账。 */
  const priceRow = (
    row: RowDataPacket,
    tokens: UsageTokenBreakdown,
  ): number => {
    const model = canonicalModelOf(row);
    const estimate = priceIntoLedger(
      ledger,
      prices,
      model,
      tokens,
      new Date(row.sample_at as string),
      String(row.source),
      String(row.context_tier ?? "") || undefined,
    );
    estimateByRow.set(row, estimate);
    return estimate.micros;
  };

  for (const row of bucketRows) {
    const tokens = tokensOf(row);
    const item = ensureDay(trendKeyFromInstant(row.sample_at, filters));
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
  const heatmap = createEmptyUsageHeatmap();
  const sessionDeviceIds = aggregateUsageSessionRows(sessionRows, filters, totals, {
    ensureDay,
    heatmap,
  });
  for (const item of byDay.values()) item.totalTokens = totalOf(item);
  totals.totalTokens = totalOf(totals);
  const lifetimeTokens = lifetimeRows[0] ? totalOf(tokensOf(lifetimeRows[0])) : 0;
  // 范围内活跃设备 = bucket ∪ session 事实里的去重 device_id
  totals.activeDevices = new Set(
    [
      ...bucketRows.map((row) => String(row.device_id)),
      ...sessionDeviceIds,
    ],
  ).size;
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
          canonicalModelOf(row),
          new Date(row.sample_at as string),
          String(row.source),
          String(row.context_tier ?? "") || undefined,
        ),
        String(row.context_tier ?? "") || undefined,
      ).micros;
    }
    previous.costMicros += num(row.stored_cost_micros) + estimated;
  }
  aggregateUsageSessionRows(prevSessionRows, prevFilters, previous);
  previous.totalTokens =
    previous.inputTokens +
    previous.cacheWriteInputTokens +
    previous.cacheReadInputTokens +
    previous.outputTokens +
    previous.reasoningOutputTokens;
  // —— 热图 ——
  const inGrid = (weekday: unknown, hour: unknown): weekday is number =>
    Number.isInteger(weekday) &&
    Number.isInteger(hour) &&
    (weekday as number) >= 0 &&
    (weekday as number) <= 6 &&
    (hour as number) >= 0 &&
    (hour as number) <= 23;
  /* bucketRows 已保留事实时间；热图直接复用它，避免为相同 Token 再扫描一次范围。 */
  for (const row of bucketRows) {
    const sampleAt = new Date(row.sample_at as string);
    const local = new Date(sampleAt.getTime() + filters.tzOffsetMinutes * 60_000);
    const weekday = (local.getUTCDay() + 6) % 7;
    const hour = local.getUTCHours();
    if (!inGrid(weekday, hour)) continue;
    const tokens = tokensOf(row);
    heatmap.hasData[weekday][hour] = true;
    heatmap.tokens[weekday][hour] += totalOf(tokens);
    heatmap.inputTokens[weekday][hour] += tokens.inputTokens;
    heatmap.cacheWriteInputTokens[weekday][hour] += tokens.cacheWriteInputTokens;
    heatmap.cacheReadInputTokens[weekday][hour] += tokens.cacheReadInputTokens;
    heatmap.outputTokens[weekday][hour] += tokens.outputTokens;
    heatmap.reasoningOutputTokens[weekday][hour] += tokens.reasoningOutputTokens;
    heatmap.costMicros[weekday][hour] +=
      num(row.stored_cost_micros) + estimateRow(row, tokens).micros;
  }
  const trend = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  // —— 最近 12 个自然周 ——
  const weeklyByDay = new Map<string, UsageTrendDay>();
  for (const row of weeklyRows) {
    const key = trendKeyFromInstant(row.sample_at, weeklyFilters);
    let item = weeklyByDay.get(key);
    if (!item) {
      item = {
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
      weeklyByDay.set(key, item);
    }
    const tokens = tokensOf(row);
    addTokens(item, tokens);
    item.requests += num(row.request_count);
    item.costMicros += num(row.stored_cost_micros) + estimateRow(row, tokens).micros;
  }
  for (const item of weeklyByDay.values()) item.totalTokens = totalOf(item);
  const weeklyTrend = [...weeklyByDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  // 当前筛选范围内实际出现过的模型与其价格命中，供“计算与数据说明”直接解释。
  const pricingMatchMap = new Map<string, UsagePricingMatch>();
  const statusRank = { priced: 0, partial: 1, unpriced: 2 } as const;
  for (const row of bucketRows) {
    const source = String(row.source);
    const model = String(row.model);
    const modelCanonical = canonicalModelOf(row);
    const modelProvider = String(row.model_provider ?? "");
    const contextTier = String(row.context_tier ?? "");
    const processingTier = String(row.processing_tier ?? "standard");
    const at = new Date(row.sample_at as string);
    const tokens = tokensOf(row);
    const matched = model === LEGACY_MODEL
      ? null
      : matchModelPrice(prices, modelCanonical, at, source, contextTier || undefined);
    const estimate = estimateCostMicros(tokens, matched, contextTier || undefined);
    const key = `${source}\u0000${model}\u0000${modelCanonical}\u0000${modelProvider}\u0000${contextTier}\u0000${processingTier}\u0000${matched?.version ?? ""}\u0000${matched?.effectiveFrom.toISOString() ?? ""}`;
    const existing = pricingMatchMap.get(key);
    if (existing) {
      existing.tokens += totalOf(tokens);
      if (statusRank[estimate.status] > statusRank[existing.status]) existing.status = estimate.status;
      existing.assumptions = [...new Set([...existing.assumptions, ...estimate.assumptions])];
      continue;
    }
    pricingMatchMap.set(key, {
      source,
      model,
      modelCanonical,
      modelDisplayName: usageModelDisplayName({
        source,
        model,
        modelCanonical,
        modelProvider,
      }),
      modelProvider,
      matchedPattern: matched?.modelPattern ?? null,
      matchKind: matched?.matchKind ?? null,
      status: estimate.status,
      contextTier,
      processingTier,
      inputPerMtok: matched?.inputPerMtok ?? null,
      cacheWritePerMtok: matched
        ? (matched.cacheWritePerMtok ?? matched.inputPerMtok)
        : null,
      cacheReadPerMtok: matched?.cacheReadPerMtok ?? null,
      cacheWrite5mPerMtok: matched?.cacheWrite5mPerMtok ?? null,
      cacheWrite1hPerMtok: matched?.cacheWrite1hPerMtok ?? null,
      outputPerMtok: matched?.outputPerMtok ?? null,
      reasoningPerMtok: matched
        ? (matched.reasoningPerMtok ?? matched.outputPerMtok)
        : null,
      cacheWriteFallback: matched !== null && matched.cacheWritePerMtok === null,
      reasoningFallback: matched !== null && matched.reasoningPerMtok === null,
      assumptions: estimate.assumptions,
      pricingSourceUrl: matched?.pricingSourceUrl || null,
      verifiedAt: matched?.verifiedAt ?? null,
      pricingBasis: matched?.pricingBasis ?? null,
      effectiveFrom: matched?.effectiveFrom.toISOString() ?? null,
      effectiveTo: matched?.effectiveTo?.toISOString() ?? null,
      version: matched?.version ?? null,
      tokens: totalOf(tokens),
    });
  }
  const pricingMatches = [...pricingMatchMap.values()].sort(
    (a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model),
  );

  // —— 分布(token + 估费,Top 6 + 其他) ——
  interface DistInput {
    device_id?: unknown;
    project_label?: unknown;
    source: unknown;
    model: unknown;
    model_canonical?: unknown;
    model_provider?: unknown;
    context_tier?: unknown;
    processing_tier?: unknown;
    sample_at: unknown;
    input_tokens: unknown;
    cache_write_input_tokens: unknown;
    cache_write_5m_input_tokens?: unknown;
    cache_write_1h_input_tokens?: unknown;
    cache_read_input_tokens: unknown;
    output_tokens: unknown;
    reasoning_output_tokens: unknown;
    stored_cost_micros: unknown;
  }
  const distTokens = (row: DistInput): UsageTokenBreakdown => ({
    inputTokens: num(row.input_tokens),
    cacheWriteInputTokens: num(row.cache_write_input_tokens),
    cacheWrite5mInputTokens: num(row.cache_write_5m_input_tokens),
    cacheWrite1hInputTokens: num(row.cache_write_1h_input_tokens),
    cacheReadInputTokens: num(row.cache_read_input_tokens),
    outputTokens: num(row.output_tokens),
    reasoningOutputTokens: num(row.reasoning_output_tokens),
  });
  const buildDistribution = (
    rows: DistInput[],
    keyOf: (row: DistInput) => string,
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
      const key = keyOf(row);
      const tokens = distTokens(row);
      const model = String(row.model);
      const stored = num(row.stored_cost_micros);
      let estimated = 0;
      // legacy 迁入行的存储成本是旧口径假值,标记未定价,避免把 $0.00 伪装成准确值
      let unpriced = model === LEGACY_MODEL;
      if (model !== LEGACY_MODEL) {
        const estimate = estimateRow(row as unknown as RowDataPacket, tokens);
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
    /* source/model 都能从主事实行集派生，不再重复扫描同一时间范围。 */
    source: buildDistribution(
      bucketRows as unknown as DistInput[],
      (row) => String(row.source),
      (row) => String(row.source),
    ),
    model: { rows: [], totalTokens: 0, totalCostMicros: 0 },
    project: buildDistribution(
      (filters.projectsEnabled ? bucketRows : []) as unknown as DistInput[],
      (row) => String(row.project_label ?? ""),
      (row) => String(row.project_label ?? ""),
    ),
    device: buildDistribution(
      bucketRows.filter((row) => deviceById.has(String(row.device_id))) as unknown as DistInput[],
      (row) => String(deviceById.get(String(row.device_id))?.public_id),
      (row) => {
        const device = deviceById.get(String(row.device_id));
        return usageDeviceDisplayName({
          name: device?.name,
          platform: device?.platform,
          surface: device?.surface,
          clientVersion: device?.client_version,
          parserVersion: device?.parser_version,
          terminalName: device?.terminal_name,
          terminalVersion: device?.terminal_version,
          osName: device?.os_name,
          osVersion: device?.os_version,
          architecture: device?.architecture,
        });
      },
    ),
  };
  // model 分布直接由精确时间行集派生;不得先跨价格窗口合并再套用首个价格。
  distributions.model = buildDistribution(
    bucketRows as unknown as DistInput[],
    (row) => canonicalUsageModel({
      source: row.source,
      model: row.model,
      modelCanonical: row.model_canonical,
      modelProvider: row.model_provider,
    }),
    (row) => {
      const model = canonicalUsageModel({
        source: row.source,
        model: row.model,
        modelCanonical: row.model_canonical,
        modelProvider: row.model_provider,
      });
      return usageModelDisplayName({ model, modelCanonical: model });
    },
  );

  // —— 明细 ——
  const records = mapRecordRows(recordRows, prices);

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
      efforts: filters.efforts,
      agentVersions: filters.agentVersions,
      projects: filters.projects,
      devices: filters.devices,
      metric: filters.metric,
    },
    totals,
    lifetimeTokens,
    trend,
    weekly: {
      from: weeklyFilters.from.toISOString(),
      to: weeklyFilters.to.toISOString(),
      trend: weeklyTrend,
    },
    previous,
    heatmap,
    distributions,
    records: {
      rows: records,
      total: recordsTotal,
      page: filters.page,
      pageSize: filters.pageSize,
    },
    options: {
      sources: optionValues("source"),
      models: optionValues("model"),
      efforts: optionValues("effort"),
      agentVersions: optionValues("agentVersion"),
      projects: optionValues("project"),
      devices: optionDeviceRows.map((row) => ({
        id: String(row.public_id),
        name: usageDeviceDisplayName({
          name: row.name,
          platform: row.platform,
          surface: row.surface,
          clientVersion: row.client_version,
          parserVersion: row.parser_version,
          terminalName: row.terminal_name,
          terminalVersion: row.terminal_version,
          osName: row.os_name,
          osVersion: row.os_version,
          architecture: row.architecture,
        }),
      })),
    },
    activeDevices: optionDeviceRows.length,
    lastSyncAt: [lifetimeRows[0]?.bucket_last_sync, lifetimeRows[0]?.session_last_sync]
      .reduce<Date | null>((latest, value) => {
        if (!value) return latest;
        const date = value instanceof Date ? value : new Date(value as string);
        if (Number.isNaN(date.getTime())) return latest;
        return latest === null || date > latest ? date : latest;
      }, null),
    meta: {
      pricingVersions: [...ledger.versions].sort(),
      unpricedModels: [...ledger.unpricedModels].sort(),
      partialModels: [...ledger.partialModels].sort(),
      pricedTokens: ledger.pricedTokens,
      unpricedTokens: ledger.unpricedTokens,
      assumedTokens: ledger.assumedTokens,
      pricingCoverage:
        ledger.pricedTokens + ledger.unpricedTokens > 0
          ? ledger.pricedTokens / (ledger.pricedTokens + ledger.unpricedTokens)
          : 1,
      pricingMatches,
      tzOffsetMinutes: filters.tzOffsetMinutes,
      generatedAt: generatedAt.toISOString(),
      diagnostics: {
        statements: queryStatements,
        rowsFetched,
      },
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
