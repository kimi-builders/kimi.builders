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
import { usageDeviceDetail, usageDeviceDisplayName } from "./device-label";
import {
  canonicalUsageModel,
  usageModelDisplayName,
} from "./model-meta";

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

/* 精确 UTC 小时事实转成本地趋势格;与 trendTimeExpr 的 hour/day/week 口径一致。 */
function trendKeyFromInstant(value: Date, filters: UsageFilters): string {
  const local = new Date(value.getTime() + filters.tzOffsetMinutes * 60_000);
  if (filters.granularity === "hour") {
    return `${local.toISOString().slice(0, 13)}:00`;
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
  inputTokens: number[][];
  cacheWriteInputTokens: number[][];
  cacheReadInputTokens: number[][];
  outputTokens: number[][];
  reasoningOutputTokens: number[][];
  costMicros: number[][];
  activeSeconds: number[][];
  prompts: number[][];
}

export interface UsagePricingMatch {
  source: string;
  model: string;
  modelCanonical: string;
  modelDisplayName: string;
  modelProvider: string;
  matchedPattern: string | null;
  matchKind: "exact" | "prefix" | null;
  status: "priced" | "partial" | "unpriced";
  inputPerMtok: number | null;
  cacheWritePerMtok: number | null;
  cacheReadPerMtok: number | null;
  outputPerMtok: number | null;
  reasoningPerMtok: number | null;
  contextTier: string;
  processingTier: string;
  cacheWrite5mPerMtok: number | null;
  cacheWrite1hPerMtok: number | null;
  assumptions: string[];
  pricingSourceUrl: string | null;
  verifiedAt: string | null;
  pricingBasis: string | null;
  cacheWriteFallback: boolean;
  reasoningFallback: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: string | null;
  tokens: number;
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
  modelCanonical: string;
  modelDisplayName: string;
  modelProvider: string;
  reasoningEffort: string;
  agentVersion: string;
  contextTier: string;
  processingTier: string;
  /* null = 未上传(项目名上传关闭期间的数据) */
  project: string | null;
  deviceId: string;
  deviceName: string;
  deviceDetail: string;
  totalTokens: number;
  requests: number;
  costMicros: number;
  priceStatus: "priced" | "partial" | "unpriced" | "legacy";
}

export interface UsageFilterOptions {
  sources: string[];
  models: string[];
  efforts: string[];
  agentVersions: string[];
  projects: string[];
  devices: { id: string; name: string }[];
}

export interface UsageOverview {
  days: number;
  range: { label: string; from: string; to: string };
  filters: {
    sources: string[] | null;
    models: string[] | null;
    efforts: string[] | null;
    agentVersions: string[] | null;
    projects: string[] | null;
    devices: string[] | null;
    metric: UsageMetric;
  };
  totals: UsageTotals;
  /* 日期范围不参与 Lifetime；工具/模型/项目/设备筛选仍然参与。 */
  lifetimeTokens: number;
  trend: UsageTrendDay[];
  /* 最近 12 个自然周，周一 00:00 到下周一 00:00；维度筛选与主看板一致。 */
  weekly: {
    from: string;
    to: string;
    trend: UsageTrendDay[];
  };
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
    pricedTokens: number;
    unpricedTokens: number;
    assumedTokens: number;
    pricingCoverage: number;
    pricingMatches: UsagePricingMatch[];
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

function emptyHeatmap(): UsageHeatmap {
  const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  return {
    tokens: grid(),
    inputTokens: grid(),
    cacheWriteInputTokens: grid(),
    cacheReadInputTokens: grid(),
    outputTokens: grid(),
    reasoningOutputTokens: grid(),
    costMicros: grid(),
    activeSeconds: grid(),
    prompts: grid(),
  };
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
                       + b.output_tokens + b.reasoning_output_tokens) AS record_total_tokens
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

interface SessionAggregateTarget {
  sessions: number;
  messages: number;
  userMessages: number;
  activeSeconds: number;
  durationSeconds: number;
}

interface ParsedSessionHour {
  hourStart: Date;
  activeSeconds: number;
  engagedSeconds: number | null;
  messageCount: number | null;
  userMessageCount: number;
}

function sessionHoursOf(row: RowDataPacket): {
  version: 2 | 3;
  hours: ParsedSessionHour[];
} | null {
  let value: unknown = row.user_prompt_hours;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const version = num((value as { version?: unknown }).version);
  const rawHours = (value as { hours?: unknown }).hours;
  if ((version !== 2 && version !== 3) || !Array.isArray(rawHours)) return null;
  const hours: ParsedSessionHour[] = [];
  for (const rawHour of rawHours) {
    if (!rawHour || typeof rawHour !== "object" || Array.isArray(rawHour)) continue;
    const item = rawHour as Record<string, unknown>;
    const hourStart = new Date(item.hourStart as string);
    if (Number.isNaN(hourStart.getTime())) continue;
    hours.push({
      hourStart,
      activeSeconds: num(item.activeSeconds),
      engagedSeconds: version === 3 ? num(item.engagedSeconds) : null,
      messageCount: version === 3 ? num(item.messageCount) : null,
      userMessageCount: num(item.userMessageCount),
    });
  }
  return { version, hours };
}

/* Sessions may outlive the selected range. v3 contains complete hourly facts,
   so every metric is clipped to [from,to) at UTC-hour granularity. v2 can clip active/user counts but
   only has session-level duration/message totals; those two fields fall back to
   the start-date rule. Legacy 24-slot arrays retain the full old fallback. */
function aggregateSessionRows(
  rows: RowDataPacket[],
  filters: UsageFilters,
  target: SessionAggregateTarget,
  options?: {
    ensureDay?: (key: string) => UsageTrendDay;
    heatmap?: UsageHeatmap;
  },
): Set<string> {
  const devices = new Set<string>();
  const inRange = (date: Date) => date >= filters.from && date < filters.to;
  const placeHour = (hour: ParsedSessionHour) => {
    const local = new Date(hour.hourStart.getTime() + filters.tzOffsetMinutes * 60_000);
    const weekday = (local.getUTCDay() + 6) % 7;
    const localHour = local.getUTCHours();
    if (options?.heatmap) {
      options.heatmap.activeSeconds[weekday][localHour] += hour.activeSeconds;
      options.heatmap.prompts[weekday][localHour] += hour.userMessageCount;
    }
    const day = options?.ensureDay?.(trendKeyFromInstant(hour.hourStart, filters));
    if (day) day.activeSeconds += hour.activeSeconds;
  };

  for (const row of rows) {
    const firstAt = new Date(row.first_message_at as string);
    if (Number.isNaN(firstAt.getTime())) continue;
    const parsed = sessionHoursOf(row);
    if (parsed) {
      const selected = parsed.hours.filter((hour) => inRange(hour.hourStart));
      if (selected.length === 0) continue;
      devices.add(String(row.device_id));
      target.sessions += 1;
      const firstDay = options?.ensureDay?.(
        trendKeyFromInstant(selected[0].hourStart, filters),
      );
      if (firstDay) firstDay.sessions += 1;
      for (const hour of selected) {
        target.activeSeconds += hour.activeSeconds;
        target.userMessages += hour.userMessageCount;
        placeHour(hour);
        if (parsed.version === 3) {
          target.durationSeconds += hour.engagedSeconds ?? 0;
          target.messages += hour.messageCount ?? 0;
        }
      }
      if (parsed.version === 2 && inRange(firstAt)) {
        target.durationSeconds += num(row.duration_seconds);
        target.messages += num(row.message_count);
      }
      continue;
    }

    // Legacy payload: no dated activity slices. Only attribute it when the
    // session itself starts in-range so overlapping long-lived IDs do not leak.
    if (!inRange(firstAt)) continue;
    devices.add(String(row.device_id));
    target.sessions += 1;
    target.activeSeconds += num(row.active_seconds);
    target.durationSeconds += num(row.duration_seconds);
    target.messages += num(row.message_count);
    target.userMessages += num(row.user_message_count);
    const day = options?.ensureDay?.(trendKeyFromInstant(firstAt, filters));
    if (day) {
      day.sessions += 1;
      day.activeSeconds += num(row.active_seconds);
    }
    if (options?.heatmap) {
      const local = new Date(firstAt.getTime() + filters.tzOffsetMinutes * 60_000);
      options.heatmap.activeSeconds[(local.getUTCDay() + 6) % 7][local.getUTCHours()] +=
        num(row.active_seconds);
      let promptHours: unknown = row.user_prompt_hours;
      try {
        if (typeof promptHours === "string") promptHours = JSON.parse(promptHours);
      } catch {
        promptHours = null;
      }
      if (Array.isArray(promptHours) && promptHours.length === 24) {
        const firstUtcDay = Date.UTC(
          firstAt.getUTCFullYear(), firstAt.getUTCMonth(), firstAt.getUTCDate(),
        );
        promptHours.forEach((count, utcHour) => {
          const amount = num(count);
          if (amount <= 0) return;
          const promptLocal = new Date(
            firstUtcDay + utcHour * 3_600_000 + filters.tzOffsetMinutes * 60_000,
          );
          options.heatmap!.prompts[(promptLocal.getUTCDay() + 6) % 7]
            [promptLocal.getUTCHours()] += amount;
        });
      }
    }
  }
  return devices;
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
  const prevBucket = bucketFilterSql(userId, prevFilters);
  const prevSession = sessionFilterSql(userId, prevFilters);

  /* Lifetime 忽略日期范围但保留维度筛选；自然周固定取筛选结束点之前
     最近 12 个周一边界。Lifetime 以请求时刻为终点，避免自定义范围截断累计值。 */
  const generatedAt = new Date();
  const lifetimeFilters: UsageFilters = {
    ...filters,
    from: new Date(0),
    to: generatedAt,
  };
  const lifetimeBucket = bucketFilterSql(userId, lifetimeFilters);
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
  const weeklyBucket = bucketFilterSql(userId, weeklyFilters);
  const weeklyBucketExpr = trendTimeExpr("bucket_start", weeklyFilters);

  const recordsQ = recordsQuery(
    userId,
    filters,
    filters.pageSize,
    (filters.page - 1) * filters.pageSize,
  );
  const recordsCountQ = recordsCountQuery(userId, filters);
  const queries: Promise<RowDataPacket[]>[] = [
    // 0 趋势+总览:30 分钟 × source × model。先按事实时间取价,
    // 再在 JS 聚合到小时/日/周,避免价格窗口跨日/跨周时整段套用最早价格。
    pool
      .query<RowDataPacket[]>(
        `SELECT ${trendBucket} AS day, source, model, model_canonical, model_provider,
                context_tier, processing_tier,
                bucket_start AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucket.where}
         GROUP BY bucket_start, source, model, model_canonical, model_provider,
                  context_tier, processing_tier
         ORDER BY day`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 1 会话原始行:v3 小时事实必须在 JS 精确裁剪到筛选窗口。
    pool
      .query<RowDataPacket[]>(
        `SELECT device_id, first_message_at, last_message_at,
                active_seconds, duration_seconds, message_count,
                user_message_count, user_prompt_hours
         FROM usage_sessions
         WHERE ${session.where}`,
        session.params,
      )
      .then(([rows]) => rows),
    // 2 热图 token/cost:保留 30 分钟事实时间以精确命中价格窗口。
    pool
      .query<RowDataPacket[]>(
        `SELECT ${localWeekdayExpr("bucket_start", filters)} AS weekday,
                ${localHourExpr("bucket_start", filters)} AS hour,
                source, model, model_canonical, model_provider,
                context_tier, processing_tier,
                bucket_start AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucket.where}
         GROUP BY bucket_start, source, model, model_canonical, model_provider,
                  context_tier, processing_tier`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 3 设备数(范围内去重:bucket 侧 ∪ 查询 1 会话侧在 JS 合并)
    pool
      .query<RowDataPacket[]>(
        `SELECT DISTINCT device_id FROM usage_buckets WHERE ${bucket.where}`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 4 已链接设备总数(不随筛选)
    pool
      .query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM usage_devices WHERE user_id = ? AND revoked_at IS NULL`,
        [userId],
      )
      .then(([rows]) => rows),
    // 5 最近同步
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
    // 6 分布:source
    pool
      .query<RowDataPacket[]>(
        `SELECT source AS k, source, model, model_canonical, model_provider,
                context_tier, processing_tier,
                bucket_start AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${bucket.where}
         GROUP BY bucket_start, source, model, model_canonical, model_provider,
                  context_tier, processing_tier`,
        bucket.params,
      )
      .then(([rows]) => rows),
    // 7 分布:project('' = 未上传)
    filters.projectsEnabled
      ? pool
          .query<RowDataPacket[]>(
            `SELECT COALESCE(project_label, '') AS k, source, model,
                    model_canonical, model_provider, context_tier, processing_tier,
                    bucket_start AS sample_at, ${TOKEN_SUMS}
             FROM usage_buckets
             WHERE ${bucket.where}
             GROUP BY bucket_start, k, source, model, model_canonical, model_provider,
                      context_tier, processing_tier`,
            bucket.params,
          )
          .then(([rows]) => rows)
      : Promise.resolve([]),
    // 8 分布:device
    pool
      .query<RowDataPacket[]>(
        `SELECT d.public_id AS k, d.name AS device_name,
                d.platform AS device_platform, d.surface AS device_surface,
                d.client_version AS device_client_version,
                d.parser_version AS device_parser_version,
                d.terminal_name AS device_terminal_name,
                d.terminal_version AS device_terminal_version,
                d.os_name AS device_os_name, d.os_version AS device_os_version,
                d.architecture AS device_architecture,
                b.source, b.model, b.model_canonical, b.model_provider,
                b.context_tier, b.processing_tier,
                b.bucket_start AS sample_at,
                SUM(b.input_tokens) AS input_tokens,
                SUM(b.cache_write_input_tokens) AS cache_write_input_tokens,
                SUM(b.cache_write_5m_input_tokens) AS cache_write_5m_input_tokens,
                SUM(b.cache_write_1h_input_tokens) AS cache_write_1h_input_tokens,
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
         GROUP BY b.bucket_start, d.public_id, d.name, d.platform, d.surface,
                  d.client_version, d.parser_version, d.terminal_name,
                  d.terminal_version, d.os_name, d.os_version, d.architecture,
                  b.source, b.model, b.model_canonical, b.model_provider,
                  b.context_tier, b.processing_tier`,
        bucketFilterSql(userId, filters, "b").params,
      )
      .then(([rows]) => rows),
    // 9 明细:本地日 × source × model × project × device(分页)
    pool
      .query<RowDataPacket[]>(recordsQ.sql, recordsQ.params)
      .then(([rows]) => rows),
    // 10 明细总行数
    pool
      .query<RowDataPacket[]>(recordsCountQ.sql, recordsCountQ.params)
      .then(([rows]) => rows),
    // 11–16 筛选项候选(只看用户+时间范围)
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
    pool
      .query<RowDataPacket[]>(
        `SELECT reasoning_effort
         FROM usage_buckets
         WHERE ${rangeBucket.where} AND reasoning_effort <> ''
         GROUP BY reasoning_effort ORDER BY reasoning_effort`,
        rangeBucket.params,
      )
      .then(([rows]) => rows),
    pool
      .query<RowDataPacket[]>(
        `SELECT agent_version
         FROM (
           SELECT agent_version FROM usage_buckets
           WHERE ${rangeBucket.where} AND agent_version <> ''
           UNION
           SELECT agent_version FROM usage_sessions
           WHERE ${rangeSession.where} AND agent_version <> ''
         ) versions
         ORDER BY agent_version LIMIT 50`,
        [...rangeBucket.params, ...rangeSession.params],
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
        `SELECT public_id, name, platform, surface, client_version, parser_version,
                terminal_name, terminal_version, os_name, os_version, architecture
         FROM usage_devices
         WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at`,
        [userId],
      )
      .then(([rows]) => rows),
    // 17/18 上一等长周期(环比):同筛选,窗口整体前移一个 span
    pool
      .query<RowDataPacket[]>(
        `SELECT source, model, model_canonical, model_provider,
                context_tier, processing_tier,
                bucket_start AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${prevBucket.where}
         GROUP BY bucket_start, source, model, model_canonical, model_provider,
                  context_tier, processing_tier`,
        prevBucket.params,
      )
      .then(([rows]) => rows),
    pool
      .query<RowDataPacket[]>(
        `SELECT device_id, first_message_at, last_message_at,
                active_seconds, duration_seconds, message_count,
                user_message_count, user_prompt_hours
         FROM usage_sessions
         WHERE ${prevSession.where}`,
        prevSession.params,
      )
      .then(([rows]) => rows),
    // 19 Lifetime token:忽略日期范围,保留全部维度筛选。
    pool
      .query<RowDataPacket[]>(
        `SELECT SUM(input_tokens) AS input_tokens,
                SUM(cache_write_input_tokens) AS cache_write_input_tokens,
                SUM(cache_read_input_tokens) AS cache_read_input_tokens,
                SUM(output_tokens) AS output_tokens,
                SUM(reasoning_output_tokens) AS reasoning_output_tokens
         FROM usage_buckets
         WHERE ${lifetimeBucket.where}`,
        lifetimeBucket.params,
      )
      .then(([rows]) => rows),
    // 20 最近 12 个自然周:仍保留 30 分钟事实时间,便于历史价格精确匹配。
    pool
      .query<RowDataPacket[]>(
        `SELECT ${weeklyBucketExpr} AS day, source, model, model_canonical, model_provider,
                context_tier, processing_tier,
                bucket_start AS sample_at, ${TOKEN_SUMS}
         FROM usage_buckets
         WHERE ${weeklyBucket.where}
         GROUP BY bucket_start, source, model, model_canonical, model_provider,
                  context_tier, processing_tier
         ORDER BY day`,
        weeklyBucket.params,
      )
      .then(([rows]) => rows),
  ];

  const [
    bucketRows,
    sessionRows,
    heatBucketRows,
    bucketDeviceRows,
    linkedDeviceRows,
    syncRows,
    sourceDistRows,
    projectDistRows,
    deviceDistRows,
    recordRows,
    recordCountRows,
    optionSourceRows,
    optionModelRows,
    optionEffortRows,
    optionAgentVersionRows,
    optionProjectRows,
    optionDeviceRows,
    prevBucketRows,
    prevSessionRows,
    lifetimeRows,
    weeklyRows,
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
  const estimateRow = (row: RowDataPacket, tokens: UsageTokenBreakdown) =>
    estimateCostMicros(
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
    return estimate.micros;
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
  const heatmap = emptyHeatmap();
  const sessionDeviceIds = aggregateSessionRows(sessionRows, filters, totals, {
    ensureDay,
    heatmap,
  });
  for (const item of byDay.values()) item.totalTokens = totalOf(item);
  totals.totalTokens = totalOf(totals);
  const lifetimeTokens = lifetimeRows[0] ? totalOf(tokensOf(lifetimeRows[0])) : 0;
  // 范围内活跃设备 = bucket ∪ session 事实里的去重 device_id
  totals.activeDevices = new Set(
    [
      ...bucketDeviceRows.map((row) => String(row.device_id)),
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
  aggregateSessionRows(prevSessionRows, prevFilters, previous);
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
  for (const row of heatBucketRows) {
    const weekday = num(row.weekday);
    const hour = num(row.hour);
    if (!inGrid(weekday, hour)) continue;
    const tokens = tokensOf(row);
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
    const key = trendKeyOf(row.day, "week");
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
    k: unknown;
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
    device_name?: unknown;
    device_platform?: unknown;
    device_surface?: unknown;
    device_client_version?: unknown;
    device_parser_version?: unknown;
    device_terminal_name?: unknown;
    device_terminal_version?: unknown;
    device_os_name?: unknown;
    device_os_version?: unknown;
    device_architecture?: unknown;
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
      const modelCanonical = canonicalUsageModel({
        source: row.source,
        model,
        modelCanonical: row.model_canonical,
        modelProvider: row.model_provider,
      });
      const stored = num(row.stored_cost_micros);
      let estimated = 0;
      // legacy 迁入行的存储成本是旧口径假值,标记未定价,避免把 $0.00 伪装成准确值
      let unpriced = model === LEGACY_MODEL;
      if (model !== LEGACY_MODEL) {
        const contextTier = String(row.context_tier ?? "");
        const estimate = estimateCostMicros(
          tokens,
          matchModelPrice(
            prices,
            modelCanonical,
            new Date(row.sample_at as string),
            String(row.source),
            contextTier || undefined,
          ),
          contextTier || undefined,
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
    device: buildDistribution(deviceDistRows as unknown as DistInput[], (row) =>
      usageDeviceDisplayName({
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
      }),
    ),
  };
  // model 分布直接由精确时间行集派生;不得先跨价格窗口合并再套用首个价格。
  distributions.model = buildDistribution(
    bucketRows.map((row) => ({ ...row, k: canonicalModelOf(row) })) as unknown as DistInput[],
    (row) => usageModelDisplayName({ model: row.k, modelCanonical: row.k }),
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
      total: num(recordCountRows[0]?.groups_count),
      page: filters.page,
      pageSize: filters.pageSize,
    },
    options: {
      sources: optionSourceRows.map((row) => String(row.source)),
      models: optionModelRows.map((row) => String(row.model)),
      efforts: optionEffortRows.map((row) => String(row.reasoning_effort)),
      agentVersions: optionAgentVersionRows.map((row) => String(row.agent_version)),
      projects: optionProjectRows.map((row) => String(row.project_label)),
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
    activeDevices: num(linkedDeviceRows[0]?.count),
    lastSyncAt: (syncRows[0]?.last_sync as Date | null) ?? null,
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
