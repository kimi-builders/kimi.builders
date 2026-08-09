/* 用量看板共享筛选层(Phase 2)。
   页面、GET /api/usage、GET /api/usage/export 全部通过 parseUsageFilters +
   bucketFilterSql/sessionFilterSql 走同一套条件,任何图表不得自造 WHERE。
   时区约定:tzOffsetMinutes = 本地时间 − UTC 的分钟数(北京 +480);
   SQL 里以整数内联(已夹取),不用占位符(MySQL 预备语句对 INTERVAL ? 支持不稳)。 */
import { isUsageSourceId } from "../usage-contract";

export type UsageRangeLabel = "today" | "24h" | "7d" | "30d" | "90d" | "custom";
export type UsageMetric = "tokens" | "cost" | "duration";
/* 明细时间粒度:day = 按本地日聚合;bucket = 按 30 分钟事实桶(最细可查粒度)。 */
export type UsageRecordGrain = "day" | "bucket";
/* 趋势粒度:today/24h/≤2 天自定义 → 小时;≥60 天 → 周(周一起);其余按本地日。 */
export type UsageGranularity = "hour" | "day" | "week";

export interface UsageFilters {
  /* UTC 边界,[from, to)。预设范围 to=查询时刻;自定义 to=本地结束日次日(夹到 now)。 */
  from: Date;
  to: Date;
  rangeLabel: UsageRangeLabel;
  /* 覆盖的本地日数(7/30/90;custom 按实际跨度) */
  days: number;
  sources: string[] | null;
  models: string[] | null;
  efforts: string[] | null;
  agentVersions: string[] | null;
  /* 仅 uploadProject=true 时非 null;否则强制 null(不允许按项目筛选) */
  projects: string[] | null;
  /* 用户是否开启了项目名上传(决定项目维度/筛选是否展示) */
  projectsEnabled: boolean;
  /* usage_devices.public_id 列表 */
  devices: string[] | null;
  tzOffsetMinutes: number;
  metric: UsageMetric;
  granularity: UsageGranularity;
  grain: UsageRecordGrain;
  page: number;
  pageSize: number;
}

export const USAGE_RANGE_PRESETS = [7, 30, 90] as const;
export const USAGE_MAX_RANGE_DAYS = 366;
export const USAGE_MAX_PAGE_SIZE = 100;
export const USAGE_DEFAULT_PAGE_SIZE = 25;
export const USAGE_EXPORT_MAX_ROWS = 20000;
const MAX_FILTER_VALUES = 20;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function csvList(
  raw: string | string[] | undefined,
  maxLength: number,
  keep: (value: string) => boolean,
): string[] | null {
  const text = first(raw).trim();
  if (!text) return null;
  const values = text
    .split(",")
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item) => item.length > 0 && keep(item));
  const unique = [...new Set(values)].slice(0, MAX_FILTER_VALUES);
  return unique.length > 0 ? unique : null;
}

function localDayStartUtc(day: string, tzOffsetMinutes: number): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const utcMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(utcMs)) return null;
  const date = new Date(utcMs);
  if (date.getUTCMonth() !== Number(match[2]) - 1) return null;
  return new Date(utcMs - tzOffsetMinutes * 60_000);
}

function clampTzOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(840, Math.max(-720, Math.trunc(parsed)));
}

export function parseUsageFilters(
  raw: RawParams,
  options: { uploadProject: boolean; tzOffsetMinutes?: unknown; now?: Date },
): UsageFilters {
  const now = options.now ?? new Date();
  const tzOffsetMinutes = clampTzOffset(options.tzOffsetMinutes);

  // 预设范围优先;兼容旧参数 days=7|30|90;from/to 为预留的自定义范围接口。
  let days = 30;
  let rangeLabel: UsageRangeLabel = "30d";
  let from: Date;
  let to: Date = now;
  const rangeParam = first(raw.range).trim();
  const legacyDays = Number(first(raw.days));
  if (rangeParam === "today" || rangeParam === "24h") {
    days = 1;
    rangeLabel = rangeParam;
  }
  const preset = rangeParam.endsWith("d")
    ? Number(rangeParam.slice(0, -1))
    : Number(rangeParam);
  if ((USAGE_RANGE_PRESETS as readonly number[]).includes(preset)) {
    days = preset;
    rangeLabel = `${preset}d` as UsageRangeLabel;
  } else if ((USAGE_RANGE_PRESETS as readonly number[]).includes(legacyDays)) {
    days = legacyDays;
    rangeLabel = `${legacyDays}d` as UsageRangeLabel;
  }
  const customFrom = localDayStartUtc(first(raw.from).trim(), tzOffsetMinutes);
  const customTo = localDayStartUtc(first(raw.to).trim(), tzOffsetMinutes);
  if (rangeLabel === "30d" && !rangeParam && !first(raw.days) && customFrom && customTo) {
    const spanDays = Math.round((customTo.getTime() - customFrom.getTime()) / 86_400_000) + 1;
    if (spanDays >= 1 && spanDays <= USAGE_MAX_RANGE_DAYS && customFrom <= now) {
      rangeLabel = "custom";
      days = spanDays;
      from = customFrom;
      to = new Date(
        Math.min(customTo.getTime() + 86_400_000, now.getTime()),
      );
    }
  }
  const localNowMs = now.getTime() + tzOffsetMinutes * 60_000;
  const localTodayUtc = Date.UTC(
    new Date(localNowMs).getUTCFullYear(),
    new Date(localNowMs).getUTCMonth(),
    new Date(localNowMs).getUTCDate(),
  );
  if (rangeLabel === "24h") {
    // 滚动 24 小时,不按日界对齐
    from = new Date(now.getTime() - 86_400_000);
    to = now;
  } else if (rangeLabel === "today") {
    from = new Date(localTodayUtc - tzOffsetMinutes * 60_000);
    to = now;
  } else if (rangeLabel !== "custom") {
    from = new Date(localTodayUtc - (days - 1) * 86_400_000 - tzOffsetMinutes * 60_000);
    to = now;
  }

  const metricParam = first(raw.metric).trim();
  const metric: UsageMetric =
    metricParam === "cost" || metricParam === "duration" ? metricParam : "tokens";
  const page = Math.max(1, Math.min(10_000, Math.trunc(Number(first(raw.page)) || 1)));
  const pageSize = Math.max(
    1,
    Math.min(USAGE_MAX_PAGE_SIZE, Math.trunc(Number(first(raw.ps)) || USAGE_DEFAULT_PAGE_SIZE)),
  );

  return {
    from: from!,
    to,
    rangeLabel,
    days,
    sources: csvList(raw.sources, 40, (value) => isUsageSourceId(value)),
    models: csvList(raw.models, 160, () => true),
    efforts: csvList(raw.efforts, 32, (value) => /^[A-Za-z0-9._+-]+$/.test(value)),
    agentVersions: csvList(raw.agentVersions, 80, (value) => /^[A-Za-z0-9._+-]+$/.test(value)),
    projects: options.uploadProject
      ? csvList(raw.projects, 120, (value) => !value.includes("/") && !value.includes("\\"))
      : null,
    projectsEnabled: options.uploadProject,
    devices: csvList(raw.devices, 40, (value) => /^udv_[A-Za-z0-9_-]{1,32}$/.test(value)),
    tzOffsetMinutes,
    metric,
    grain: first(raw.grain).trim() === "bucket" ? "bucket" : "day",
    granularity:
      rangeLabel === "today" || rangeLabel === "24h"
        ? "hour"
        : rangeLabel === "custom"
          ? days <= 2
            ? "hour"
            : days >= 60
              ? "week"
              : "day"
          : days >= 60
            ? "week"
            : "day",
    page,
    pageSize,
  };
}

export interface UsageFilterSql {
  where: string;
  params: unknown[];
}

function sharedClauses(
  userId: number,
  filters: UsageFilters,
  column: { time: string; hasModel: boolean; hasEffort: boolean; hasAgentVersion: boolean },
  alias = "",
): { clauses: string[]; params: unknown[] } {
  const a = alias ? `${alias}.` : "";
  const clauses: string[] = [
    `${a}user_id = ?`,
    `${a}${column.time} >= ?`,
    `${a}${column.time} < ?`,
  ];
  const params: unknown[] = [filters.from, filters.to];
  if (filters.sources) {
    clauses.push(`${a}source IN (${filters.sources.map(() => "?").join(",")})`);
    params.push(...filters.sources);
  }
  if (column.hasModel && filters.models) {
    clauses.push(`${a}model IN (${filters.models.map(() => "?").join(",")})`);
    params.push(...filters.models);
  }
  if (column.hasEffort && filters.efforts) {
    clauses.push(`${a}reasoning_effort IN (${filters.efforts.map(() => "?").join(",")})`);
    params.push(...filters.efforts);
  }
  if (column.hasAgentVersion && filters.agentVersions) {
    clauses.push(`${a}agent_version IN (${filters.agentVersions.map(() => "?").join(",")})`);
    params.push(...filters.agentVersions);
  }
  if (filters.projects) {
    clauses.push(`${a}project_label IN (${filters.projects.map(() => "?").join(",")})`);
    params.push(...filters.projects);
  }
  if (filters.devices) {
    clauses.push(
      `${a}device_id IN (SELECT id FROM usage_devices WHERE user_id = ? AND public_id IN (${filters.devices
        .map(() => "?")
        .join(",")}))`,
    );
    params.push(userId, ...filters.devices);
  }
  return { clauses, params };
}

/* usage_buckets 筛选。会话表没有 model/reasoning_effort 列:这两个筛选只作用于
   bucket 派生指标；agent_version 是会话可用的独立事实。页面需注明口径差异。 */
export function bucketFilterSql(
  userId: number,
  filters: UsageFilters,
  alias = "",
): UsageFilterSql {
  const { clauses, params } = sharedClauses(
    userId,
    filters,
    { time: "bucket_start", hasModel: true, hasEffort: true, hasAgentVersion: true },
    alias,
  );
  return { where: clauses.join(" AND "), params: [userId, ...params] };
}

export function sessionFilterSql(
  userId: number,
  filters: UsageFilters,
  alias = "",
): UsageFilterSql {
  const { clauses, params } = sharedClauses(
    userId,
    filters,
    { time: "first_message_at", hasModel: false, hasEffort: false, hasAgentVersion: true },
    alias,
  );
  return { where: clauses.join(" AND "), params: [userId, ...params] };
}

/* 本地日 / 星期×小时 分组表达式(tz 偏移已夹取为整数,内联安全)。 */
export function localDayExpr(column: string, filters: UsageFilters): string {
  return `DATE(DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE))`;
}

export function localWeekdayExpr(column: string, filters: UsageFilters): string {
  return `WEEKDAY(DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE))`;
}

export function localHourExpr(column: string, filters: UsageFilters): string {
  return `HOUR(DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE))`;
}

/* 把筛选状态写回 URL(分享/刷新可恢复)。空维度不出现在 URL。 */
export function usageFiltersToSearch(filters: UsageFilters): string {
  const params = new URLSearchParams();
  if (filters.rangeLabel !== "custom") params.set("range", filters.rangeLabel);
  else {
    const day = (date: Date) =>
      new Date(date.getTime() + filters.tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
    params.set("from", day(filters.from));
    params.set("to", day(new Date(filters.to.getTime() - 1)));
  }
  if (filters.sources) params.set("sources", filters.sources.join(","));
  if (filters.models) params.set("models", filters.models.join(","));
  if (filters.efforts) params.set("efforts", filters.efforts.join(","));
  if (filters.agentVersions) params.set("agentVersions", filters.agentVersions.join(","));
  if (filters.projects) params.set("projects", filters.projects.join(","));
  if (filters.devices) params.set("devices", filters.devices.join(","));
  if (filters.metric !== "tokens") params.set("metric", filters.metric);
  if (filters.grain === "bucket") params.set("grain", "bucket");
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== USAGE_DEFAULT_PAGE_SIZE) params.set("ps", String(filters.pageSize));
  const text = params.toString();
  return text ? `?${text}` : "";
}
