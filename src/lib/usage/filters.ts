/* Shared filter layer for the usage dashboard (Phase 2). The page,
   GET /api/usage, and GET /api/usage/export all go through parseUsageFilters
   + bucketFilterSql/sessionFilterSql — no chart builds its own WHERE.
   Timezone: tzOffsetMinutes = local - UTC minutes (Beijing +480); inlined
   as a clamped integer, not a placeholder (MySQL prepared statements handle
   INTERVAL ? inconsistently). */
import { isUsageSourceId } from "../usage-contract";

export type UsageRangeLabel = "today" | "24h" | "7d" | "30d" | "90d" | "custom";
export type UsageMetric = "tokens" | "cost" | "duration";
/* Record granularity: day = local-day aggregate; bucket = 30-minute fact
   buckets (finest queryable grain). */
export type UsageRecordGrain = "day" | "bucket";
/* Trend grain: today/24h/custom <= 2 days -> hour; >= 60 days -> week
   (Mon-start); otherwise local day. */
export type UsageGranularity = "hour" | "day" | "week";

export interface UsageFilters {
  /* UTC boundaries [from, to). Presets set to=now; custom sets
     to=next local day (clamped to now). */
  from: Date;
  to: Date;
  rangeLabel: UsageRangeLabel;
  /* Local days covered (7/30/90; custom by actual span) */
  days: number;
  sources: string[] | null;
  models: string[] | null;
  efforts: string[] | null;
  agentVersions: string[] | null;
  /* Non-null only when uploadProject=true; otherwise forced null (no
     project filtering allowed) */
  projects: string[] | null;
  /* Whether the user uploads project names (gates the project dimension
     and filter) */
  projectsEnabled: boolean;
  /* usage_devices.public_id list */
  devices: string[] | null;
  tzOffsetMinutes: number;
  metric: UsageMetric;
  granularity: UsageGranularity;
  grain: UsageRecordGrain;
  page: number;
  pageSize: number;
}

export const USAGE_RANGE_PRESETS = [7, 30, 90] as const;
/* No-param default. "today" left returning visitors (sync gaps are
   normal) staring at an empty first screen; 30d shows the recent
   window and stays shareable. Explicit deep links (?range=today etc.)
   keep working; the anonymous preview, the public leaderboard, and
   the share posters have their own range contracts and don't read
   this. */
export const USAGE_DEFAULT_RANGE: UsageRangeLabel = "30d";
export const USAGE_MAX_RANGE_DAYS = 366;
export const USAGE_MAX_PAGE_SIZE = 100;
export const USAGE_DEFAULT_PAGE_SIZE = 25;
export const USAGE_EXPORT_MAX_ROWS = 20000;
export const USAGE_JSON_EXPORT_ROW_CAP = 100_000;
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

  // Preset ranges win; days=7|30|90 kept for old links; from/to reserved
  // for custom ranges. The no-param default seeds `days` from
  // USAGE_DEFAULT_RANGE so the window matches the label (a "30d" label
  // with a 1-day window would misstate the range everywhere).
  const defaultPresetDays = USAGE_DEFAULT_RANGE.endsWith("d")
    ? Number(USAGE_DEFAULT_RANGE.slice(0, -1))
    : 1;
  let days = defaultPresetDays;
  let rangeLabel: UsageRangeLabel = USAGE_DEFAULT_RANGE;
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
  if (!rangeParam && !first(raw.days) && customFrom && customTo) {
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
    // Rolling 24 hours, not day-aligned
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
  column: {
    time: string;
    endTime?: string;
    hasModel: boolean;
    hasEffort: boolean;
    hasAgentVersion: boolean;
  },
  alias = "",
): { clauses: string[]; params: unknown[] } {
  const a = alias ? `${alias}.` : "";
  const clauses: string[] = [
    `${a}user_id = ?`,
    `${a}${column.endTime ?? column.time} >= ?`,
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

/* usage_buckets filter. The session table has no model/reasoning_effort
   columns: those two filters apply only to bucket-derived metrics;
   agent_version is an independent session fact. Pages must label the
   difference. */
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
  /* Sessions are reusable and can span the selected boundary. Select every
     overlapping session; query.ts then clips its sparse UTC-hour facts to the
     exact [from,to) window. Filtering only first_message_at loses activity
     from long-lived sessions that began before the range. */
  const { clauses, params } = sharedClauses(
    userId,
    filters,
    {
      time: "first_message_at",
      endTime: "last_message_at",
      hasModel: false,
      hasEffort: false,
      hasAgentVersion: true,
    },
    alias,
  );
  return { where: clauses.join(" AND "), params: [userId, ...params] };
}

/* Local-day / weekday-x-hour grouping expressions (tz offset clamped to an
   integer, safe to inline). */
export function localDayExpr(column: string, filters: UsageFilters): string {
  return `DATE(DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE))`;
}

export function localWeekdayExpr(column: string, filters: UsageFilters): string {
  return `WEEKDAY(DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE))`;
}

export function localHourExpr(column: string, filters: UsageFilters): string {
  return `HOUR(DATE_ADD(${column}, INTERVAL ${filters.tzOffsetMinutes} MINUTE))`;
}

/* Serialize filter state back into the URL (restorable by share/refresh).
   Empty dimensions stay out of the URL. */
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
