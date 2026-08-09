import type { RowDataPacket } from "mysql2";
import type { SessionUser } from "../auth/session";
import { getPool } from "../db";
import { usageCacheHitRate } from "../usage-contract";
import { bucketFilterSql, parseUsageFilters, type UsageFilters } from "./filters";
import { getUsageOverview } from "./query";
import { USAGE_SHARE_RANGES, type UsageShareRange } from "./share-contract";

export { USAGE_SHARE_RANGES, type UsageShareRange } from "./share-contract";

export interface UsageShareActivityCell {
  key: string;
  tokens: number;
  level: number;
  future: boolean;
}

export interface UsageShareSnapshot {
  range: UsageShareRange;
  rangeLabel: string;
  rangeLabelEn: string;
  generatedDate: string;
  user: {
    handle: string;
    name: string;
    initials: string;
  };
  totalTokens: number;
  lifetimeTokens: number;
  costMicros: number;
  activeSeconds: number;
  peakTokens: number;
  peakLabel: string;
  cacheHitRate: number | null;
  topModel: string;
  topEffort: string;
  toolCount: number;
  requests: number;
  main: {
    kind: "hours" | "days" | "heatmap";
    eyebrow: string;
    headline: string;
    subline: string;
    columns: number;
    rows: number;
    cells: UsageShareActivityCell[];
  };
}

interface DailyUsage {
  day: string;
  tokens: number;
}

const DAY_MS = 86_400_000;

export function normalizeUsageShareRange(value: unknown): UsageShareRange {
  return typeof value === "string" && (USAGE_SHARE_RANGES as readonly string[]).includes(value)
    ? (value as UsageShareRange)
    : "30d";
}

function localDayKey(date: Date, tzOffsetMinutes: number): string {
  return new Date(date.getTime() + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function utcDateOfDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function dayKeyAt(key: string, offset: number): string {
  return new Date(utcDateOfDay(key).getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

function mondayOf(key: string): string {
  const date = utcDateOfDay(key);
  const weekday = (date.getUTCDay() + 6) % 7;
  return dayKeyAt(key, -weekday);
}

function shareFilters(
  range: UsageShareRange,
  tzOffsetMinutes: number,
  uploadProject: boolean,
  retentionDays: number,
  now: Date,
): UsageFilters {
  const parsed = parseUsageFilters(
    { range: range === "all" ? "90d" : range },
    { uploadProject, tzOffsetMinutes, now },
  );
  if (range !== "all") return parsed;
  const days = Math.max(1, Math.min(730, Math.trunc(retentionDays || 365)));
  const localToday = localDayKey(now, parsed.tzOffsetMinutes);
  const fromLocalDay = dayKeyAt(localToday, -(days - 1));
  return {
    ...parsed,
    from: new Date(utcDateOfDay(fromLocalDay).getTime() - parsed.tzOffsetMinutes * 60_000),
    to: now,
    rangeLabel: "custom",
    days,
    granularity: "week",
  };
}

function activityLevel(tokens: number, maximum: number): number {
  if (tokens <= 0 || maximum <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((Math.log1p(tokens) / Math.log1p(maximum)) * 4)));
}

function dailyStreak(days: DailyUsage[], today: string): { current: number; longest: number } {
  const active = [...new Set(days.filter((day) => day.tokens > 0).map((day) => day.day))].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of active) {
    run = previous && dayKeyAt(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const latest = active.at(-1);
  if (!latest || dayKeyAt(latest, 2) <= today) return { current: 0, longest };
  let current = 1;
  for (let index = active.length - 2; index >= 0; index -= 1) {
    if (dayKeyAt(active[index], 1) !== active[index + 1]) break;
    current += 1;
  }
  return { current, longest };
}

function weeklyStreak(days: DailyUsage[], today: string): { current: number; longest: number } {
  const weekly = [...new Set(days.filter((day) => day.tokens > 0).map((day) => mondayOf(day.day)))].sort();
  const currentWeek = mondayOf(today);
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const week of weekly) {
    run = previous && dayKeyAt(previous, 7) === week ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = week;
  }
  const latest = weekly.at(-1);
  if (!latest || dayKeyAt(latest, 14) <= currentWeek) return { current: 0, longest };
  let current = 1;
  for (let index = weekly.length - 2; index >= 0; index -= 1) {
    if (dayKeyAt(weekly[index], 7) !== weekly[index + 1]) break;
    current += 1;
  }
  return { current, longest };
}

function buildCalendarCells(
  daily: DailyUsage[],
  today: string,
  weeks: number,
): UsageShareActivityCell[] {
  const values = new Map(daily.map((item) => [item.day, item.tokens]));
  const currentMonday = mondayOf(today);
  const start = dayKeyAt(currentMonday, -(weeks - 1) * 7);
  const keys = Array.from({ length: weeks * 7 }, (_, index) => dayKeyAt(start, index));
  const maximum = Math.max(0, ...keys.map((key) => values.get(key) ?? 0));
  return keys.map((key) => {
    const tokens = values.get(key) ?? 0;
    return { key, tokens, level: activityLevel(tokens, maximum), future: key > today };
  });
}

function buildDayCells(daily: DailyUsage[], today: string): UsageShareActivityCell[] {
  const values = new Map(daily.map((item) => [item.day, item.tokens]));
  const keys = Array.from({ length: 7 }, (_, index) => dayKeyAt(today, index - 6));
  const maximum = Math.max(0, ...keys.map((key) => values.get(key) ?? 0));
  return keys.map((key) => {
    const tokens = values.get(key) ?? 0;
    return { key, tokens, level: activityLevel(tokens, maximum), future: false };
  });
}

function rangeLabels(range: UsageShareRange): { zh: string; en: string } {
  const values: Record<UsageShareRange, { zh: string; en: string }> = {
    today: { zh: "今天", en: "TODAY" },
    "24h": { zh: "近 24 小时", en: "24H" },
    "7d": { zh: "近 7 天", en: "7D" },
    "30d": { zh: "近 30 天", en: "30D" },
    "90d": { zh: "近 90 天", en: "90D" },
    all: { zh: "全部历史", en: "ALL" },
  };
  return values[range];
}

function initials(name: string, handle: string): string {
  const source = name.trim() || handle.trim() || "KB";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  return [...source].slice(0, 2).join("").toUpperCase();
}

function effortLabel(value: string): string {
  if (!value) return "未记录";
  return value.replaceAll("_", " ").replaceAll("-", " ").toUpperCase();
}

export async function getUsageShareSnapshot(input: {
  user: SessionUser;
  range: UsageShareRange;
  tzOffsetMinutes: number;
  uploadProject: boolean;
  retentionDays: number;
  now?: Date;
}): Promise<UsageShareSnapshot> {
  const now = input.now ?? new Date();
  const filters = shareFilters(
    input.range,
    input.tzOffsetMinutes,
    input.uploadProject,
    input.retentionDays,
    now,
  );
  const bucket = bucketFilterSql(input.user.id, filters);
  const shifted = `DATE_ADD(bucket_start, INTERVAL ${filters.tzOffsetMinutes} MINUTE)`;
  const pool = getPool();
  const [overview, dailyResult, effortResult] = await Promise.all([
    getUsageOverview(input.user.id, filters),
    pool.query<RowDataPacket[]>(
      `SELECT DATE(${shifted}) AS day,
              SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
                  + output_tokens + reasoning_output_tokens) AS tokens
       FROM usage_buckets
       WHERE ${bucket.where}
       GROUP BY DATE(${shifted})
       ORDER BY day`,
      bucket.params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT reasoning_effort,
              SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
                  + output_tokens + reasoning_output_tokens) AS tokens
       FROM usage_buckets
       WHERE ${bucket.where} AND reasoning_effort <> ''
       GROUP BY reasoning_effort
       ORDER BY tokens DESC
       LIMIT 1`,
      bucket.params,
    ),
  ]);
  const daily: DailyUsage[] = dailyResult[0].map((row) => ({
    day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
    tokens: Number(row.tokens ?? 0),
  }));
  const today = localDayKey(now, filters.tzOffsetMinutes);
  const dayRun = dailyStreak(daily, today);
  const weekRun = weeklyStreak(daily, today);
  const labels = rangeLabels(input.range);
  const isHours = input.range === "today" || input.range === "24h";
  const isDays = input.range === "7d";
  const weeks = input.range === "30d" ? 5 : 12;
  const trendMax = Math.max(0, ...overview.trend.map((item) => item.totalTokens));
  const dailyMax = Math.max(0, ...daily.map((item) => item.tokens));
  const hourCells: UsageShareActivityCell[] = overview.trend.map((item) => ({
    key: item.day,
    tokens: item.totalTokens,
    level: activityLevel(item.totalTokens, trendMax),
    future: false,
  }));
  const main = isHours
    ? {
        kind: "hours" as const,
        eyebrow: "BUILD PULSE",
        headline: input.range === "today" ? "今日构建脉冲" : "24 小时构建脉冲",
        subline: `${overview.totals.requests.toLocaleString("zh-CN")} 次请求 · 峰值按小时`,
        columns: Math.max(1, hourCells.length),
        rows: 1,
        cells: hourCells,
      }
    : isDays
      ? {
          kind: "days" as const,
          eyebrow: "7-DAY BUILD RHYTHM",
          headline: `${dayRun.current || dayRun.longest} 天连续构建`,
          subline: `最长连续 ${dayRun.longest} 天 · 峰值按日`,
          columns: 7,
          rows: 1,
          cells: buildDayCells(daily, today),
        }
      : {
          kind: "heatmap" as const,
          eyebrow: `${weeks}-WEEK BUILD STREAK`,
          headline: `${weekRun.current || weekRun.longest} 周连续构建`,
          subline: `最长连续 ${weekRun.longest} 周 · 每格代表一天`,
          columns: weeks,
          rows: 7,
          cells: buildCalendarCells(daily, today, weeks),
        };

  return {
    range: input.range,
    rangeLabel: labels.zh,
    rangeLabelEn: labels.en,
    generatedDate: today,
    user: {
      handle: input.user.handle,
      name: input.user.name,
      initials: initials(input.user.name, input.user.handle),
    },
    totalTokens: overview.totals.totalTokens,
    lifetimeTokens: overview.lifetimeTokens,
    costMicros: overview.totals.costMicros,
    activeSeconds: overview.totals.activeSeconds,
    peakTokens: isHours ? trendMax : dailyMax,
    peakLabel: isHours ? "小时峰值" : "单日峰值",
    cacheHitRate: usageCacheHitRate(overview.totals),
    topModel: overview.distributions.model.rows[0]?.label ?? "未记录",
    topEffort: effortLabel(String(effortResult[0][0]?.reasoning_effort ?? "")),
    toolCount: overview.distributions.source.rows.filter((row) => row.key !== "__other__").length,
    requests: overview.totals.requests,
    main,
  };
}

export function mockUsageShareSnapshot(range: UsageShareRange): UsageShareSnapshot {
  const labels = rangeLabels(range);
  const today = "2026-08-09";
  const weeks = range === "30d" ? 5 : 12;
  const isHours = range === "today" || range === "24h";
  const isDays = range === "7d";
  const count = isHours ? 24 : isDays ? 7 : weeks * 7;
  const cells = Array.from({ length: count }, (_, index) => {
    const pulse = Math.round((Math.sin(index * 1.73) + 1.35) * 71_000_000);
    const inactive = index % 13 === 0 || index % 19 === 0;
    const tokens = inactive ? 0 : pulse;
    return {
      key: dayKeyAt(today, index - count + 1),
      tokens,
      level: inactive ? 0 : ((index * 3) % 4) + 1,
      future: !isHours && !isDays && index >= count - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 + 1),
    };
  });
  return {
    range,
    rangeLabel: labels.zh,
    rangeLabelEn: labels.en,
    generatedDate: today,
    user: { handle: "aklman", name: "Aklman Zhapar", initials: "AZ" },
    totalTokens: range === "today" ? 399_813_342 : range === "24h" ? 612_900_000 : 3_800_000_000,
    lifetimeTokens: 10_800_000_000,
    costMicros: range === "today" ? 222_480_000 : 4_032_510_000,
    activeSeconds: range === "today" ? 14_040 : 181_380,
    peakTokens: 612_900_000,
    peakLabel: isHours ? "小时峰值" : "单日峰值",
    cacheHitRate: 0.897,
    topModel: "GPT-5.6 Sol",
    topEffort: "EXTRA HIGH",
    toolCount: 6,
    requests: 12_481,
    main: {
      kind: isHours ? "hours" : isDays ? "days" : "heatmap",
      eyebrow: isHours ? "BUILD PULSE" : isDays ? "7-DAY BUILD RHYTHM" : `${weeks}-WEEK BUILD STREAK`,
      headline: isHours ? (range === "today" ? "今日构建脉冲" : "24 小时构建脉冲") : isDays ? "7 天连续构建" : `${weeks} 周连续构建`,
      subline: isHours ? "12,481 次请求 · 峰值按小时" : isDays ? "最长连续 7 天 · 峰值按日" : "最长连续 12 周 · 每格代表一天",
      columns: isHours ? 24 : isDays ? 7 : weeks,
      rows: isHours || isDays ? 1 : 7,
      cells,
    },
  };
}
