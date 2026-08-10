import type { RowDataPacket } from "mysql2";
import type { SessionUser } from "../auth/session";
import { getPool } from "../db";
import { usageCacheHitRate } from "../usage-contract";
import { bucketFilterSql, parseUsageFilters, type UsageFilters } from "./filters";
import { usageSourceLabel } from "./labels";
import { getUsageOverview } from "./query";
import { USAGE_SHARE_RANGES, type UsageShareRange } from "./share-contract";

export { USAGE_SHARE_RANGES, type UsageShareRange } from "./share-contract";

export interface UsageShareActivityCell {
  key: string;
  tokens: number;
  level: number;
  future: boolean;
  /* stacked 主图(30d)专用:当日输入(含缓存写)/缓存读/输出(含推理)。 */
  inputTokens?: number;
  cacheTokens?: number;
  outputTokens?: number;
}

/* 桑基流四类总量(范围内互斥):fresh input = 输入 + 缓存写;输出与推理分列。 */
export interface UsageShareFlow {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface UsageShareTool {
  id: string;
  label: string;
  tokens: number;
  share: number;
}

export interface UsageShareWeek {
  /* 本地周一日 key(YYYY-MM-DD)。 */
  key: string;
  tokens: number;
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
  flow: UsageShareFlow;
  sessions: number;
  /* 自然周连续有量:current 到本周为止;本周暂无量时回退展示 longest。 */
  streakWeeks: { current: number; longest: number };
  /* 最近 12 个自然周(周一锚定,最旧 → 当前周),velocity 图专用。 */
  weeks: UsageShareWeek[];
  /* source 维度 token TOP 5(不含 __other__),id 供工具图标用。 */
  topTools: UsageShareTool[];
  /* totalTokens ÷ fresh input;输入为 0 时 null(海报显示 —)。 */
  leverage: number | null;
  /* 数据起止月份(本地 YYYY-MM):首条 bucket 所在月 → 当前月。 */
  span: { from: string; to: string };
  main: {
    kind: "hours" | "days" | "stacked" | "calendar";
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
  /* 输入 + 缓存写(fresh input)。 */
  inputTokens: number;
  cacheReadTokens: number;
  /* 输出 + 推理。 */
  outputTokens: number;
}

const DAY_MS = 86_400_000;
/* 短周期也把日序列拉满 12 周:streak/velocity 日历在全周期口径一致。 */
const SHARE_WEEKS = 12;

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

export function weeklyStreak(
  days: Pick<DailyUsage, "day" | "tokens">[],
  today: string,
): { current: number; longest: number } {
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

/* 最近 12 个自然周序列(周一锚定,含当周;无量的周为 0)。 */
export function buildShareWeeks(
  days: Pick<DailyUsage, "day" | "tokens">[],
  today: string,
  weeks = SHARE_WEEKS,
): UsageShareWeek[] {
  const byMonday = new Map<string, number>();
  for (const day of days) {
    if (day.tokens <= 0) continue;
    const monday = mondayOf(day.day);
    byMonday.set(monday, (byMonday.get(monday) ?? 0) + day.tokens);
  }
  const start = dayKeyAt(mondayOf(today), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, index) => {
    const key = dayKeyAt(start, index * 7);
    return { key, tokens: byMonday.get(key) ?? 0 };
  });
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

/* 30d 堆叠主图:最近 30 个本地日,每日 输入(含缓存写)/缓存读/输出(含推理)。 */
export function buildShareStackedCells(
  daily: DailyUsage[],
  today: string,
  days = 30,
): UsageShareActivityCell[] {
  const values = new Map(daily.map((item) => [item.day, item]));
  const keys = Array.from({ length: days }, (_, index) => dayKeyAt(today, index - days + 1));
  const maximum = Math.max(0, ...keys.map((key) => values.get(key)?.tokens ?? 0));
  return keys.map((key) => {
    const item = values.get(key);
    const tokens = item?.tokens ?? 0;
    return {
      key,
      tokens,
      level: activityLevel(tokens, maximum),
      future: false,
      inputTokens: item?.inputTokens ?? 0,
      cacheTokens: item?.cacheReadTokens ?? 0,
      outputTokens: item?.outputTokens ?? 0,
    };
  });
}

/* source 分布行 → TOP 工具(__other__ 剔除,按 token 降序取前 limit)。 */
export function shareTopTools(
  rows: { key: string; tokens: number; share: number }[],
  limit = 5,
): UsageShareTool[] {
  return rows
    .filter((row) => row.key !== "__other__" && row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, limit)
    .map((row) => ({
      id: row.key,
      label: usageSourceLabel(row.key),
      tokens: row.tokens,
      share: row.share,
    }));
}

export function shareFlowFromTotals(totals: {
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}): UsageShareFlow {
  return {
    inputTokens: totals.inputTokens + totals.cacheWriteInputTokens,
    cacheReadTokens: totals.cacheReadInputTokens,
    outputTokens: totals.outputTokens,
    reasoningTokens: totals.reasoningOutputTokens,
  };
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
  const today = localDayKey(now, filters.tzOffsetMinutes);
  /* 日序列窗口 = max(范围, 最近 12 个自然周),短周期也能算 streak/velocity。 */
  const weekWindowStartUtc = new Date(
    utcDateOfDay(dayKeyAt(mondayOf(today), -(SHARE_WEEKS - 1) * 7)).getTime()
      - filters.tzOffsetMinutes * 60_000,
  );
  const dailyFilters: UsageFilters =
    filters.from.getTime() <= weekWindowStartUtc.getTime()
      ? filters
      : { ...filters, from: weekWindowStartUtc };
  const bucket = bucketFilterSql(input.user.id, filters);
  const dailyBucket = bucketFilterSql(input.user.id, dailyFilters);
  const shifted = `DATE_ADD(bucket_start, INTERVAL ${dailyFilters.tzOffsetMinutes} MINUTE)`;
  const pool = getPool();
  const [overview, dailyResult, effortResult, firstResult] = await Promise.all([
    getUsageOverview(input.user.id, filters),
    pool.query<RowDataPacket[]>(
      `SELECT DATE(${shifted}) AS day,
              SUM(input_tokens + cache_write_input_tokens) AS input_tokens,
              SUM(cache_read_input_tokens) AS cache_read_tokens,
              SUM(output_tokens + reasoning_output_tokens) AS output_tokens
       FROM usage_buckets
       WHERE ${dailyBucket.where}
       GROUP BY DATE(${shifted})
       ORDER BY day`,
      dailyBucket.params,
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
    pool.query<RowDataPacket[]>(
      `SELECT MIN(bucket_start) AS first_at FROM usage_buckets WHERE user_id = ?`,
      [input.user.id],
    ),
  ]);
  const daily: DailyUsage[] = dailyResult[0].map((row) => {
    const inputTokens = Number(row.input_tokens ?? 0);
    const cacheReadTokens = Number(row.cache_read_tokens ?? 0);
    const outputTokens = Number(row.output_tokens ?? 0);
    return {
      day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      tokens: inputTokens + cacheReadTokens + outputTokens,
      inputTokens,
      cacheReadTokens,
      outputTokens,
    };
  });
  const dayRun = dailyStreak(daily, today);
  const weekRun = weeklyStreak(daily, today);
  const labels = rangeLabels(input.range);
  const isHours = input.range === "today" || input.range === "24h";
  const isDays = input.range === "7d";
  const isStacked = input.range === "30d";
  const trendMax = Math.max(0, ...overview.trend.map((item) => item.totalTokens));
  const dailyMax = Math.max(0, ...daily.map((item) => item.tokens));
  const hourCells: UsageShareActivityCell[] = overview.trend.map((item) => ({
    key: item.day,
    tokens: item.totalTokens,
    level: activityLevel(item.totalTokens, trendMax),
    future: false,
  }));
  const main: UsageShareSnapshot["main"] = isHours
    ? {
        kind: "hours",
        eyebrow: "BUILD PULSE",
        headline: input.range === "today" ? "今日构建脉冲" : "24 小时构建脉冲",
        subline: `${overview.totals.requests.toLocaleString("zh-CN")} 次请求 · 峰值按小时`,
        columns: Math.max(1, hourCells.length),
        rows: 1,
        cells: hourCells,
      }
    : isDays
      ? {
          kind: "days",
          eyebrow: "7-DAY BUILD RHYTHM",
          headline: `${dayRun.current || dayRun.longest} 天连续构建`,
          subline: `最长连续 ${dayRun.longest} 天 · 峰值按日`,
          columns: 7,
          rows: 1,
          cells: buildDayCells(daily, today),
        }
      : isStacked
        ? {
            kind: "stacked",
            eyebrow: "30-DAY TOKEN MIX",
            headline:
              usageCacheHitRate(overview.totals) === null
                ? `${daily.filter((item) => item.tokens > 0).length} 天有构建`
                : `缓存命中 ${((usageCacheHitRate(overview.totals) ?? 0) * 100).toFixed(1)}%`,
            subline: "每柱一天 · 输入 / 缓存命中 / 输出 堆叠",
            columns: 30,
            rows: 1,
            cells: buildShareStackedCells(daily, today),
          }
        : {
            kind: "calendar",
            eyebrow: `${SHARE_WEEKS}-WEEK ACTIVITY`,
            headline: `${weekRun.current || weekRun.longest} 周连续构建`,
            subline: `最长连续 ${weekRun.longest} 周 · 每格代表一天`,
            columns: SHARE_WEEKS,
            rows: 7,
            cells: buildCalendarCells(daily, today, SHARE_WEEKS),
          };

  const firstRow = firstResult[0][0];
  const firstAt = firstRow?.first_at ? new Date(firstRow.first_at as string) : null;
  const flow = shareFlowFromTotals(overview.totals);

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
    flow,
    sessions: overview.totals.sessions,
    streakWeeks: weekRun,
    weeks: buildShareWeeks(daily, today),
    topTools: shareTopTools(overview.distributions.source.rows),
    leverage: flow.inputTokens > 0 ? overview.totals.totalTokens / flow.inputTokens : null,
    span: {
      from: (firstAt ? localDayKey(firstAt, filters.tzOffsetMinutes) : today).slice(0, 7),
      to: today.slice(0, 7),
    },
    main,
  };
}

/* mock 数据量级对齐参考海报(总量 3.8B / 缓存读 3.6B / 12 周 streak),
   方便 dev preview 下做视觉验收;短周期按比例缩放。 */
const MOCK_FLOW_90D: UsageShareFlow = {
  inputTokens: 130_800_000,
  cacheReadTokens: 3_615_500_000,
  outputTokens: 10_900_000,
  reasoningTokens: 42_800_000,
};

function scaleFlow(flow: UsageShareFlow, factor: number): UsageShareFlow {
  return {
    inputTokens: Math.round(flow.inputTokens * factor),
    cacheReadTokens: Math.round(flow.cacheReadTokens * factor),
    outputTokens: Math.round(flow.outputTokens * factor),
    reasoningTokens: Math.round(flow.reasoningTokens * factor),
  };
}

export function mockUsageShareSnapshot(range: UsageShareRange): UsageShareSnapshot {
  const labels = rangeLabels(range);
  const today = "2026-08-09";
  const isHours = range === "today" || range === "24h";
  const isDays = range === "7d";
  const isStacked = range === "30d";
  const count = isHours ? 24 : isDays ? 7 : isStacked ? 30 : SHARE_WEEKS * 7;
  const cells: UsageShareActivityCell[] = Array.from({ length: count }, (_, index) => {
    const pulse = Math.round((Math.sin(index * 1.73) + 1.35) * 71_000_000);
    const inactive = index % 13 === 0 || index % 19 === 0;
    const tokens = inactive ? 0 : pulse;
    const cell: UsageShareActivityCell = {
      key: dayKeyAt(today, index - count + 1),
      tokens,
      level: inactive ? 0 : ((index * 3) % 4) + 1,
      future:
        !isHours && !isDays && !isStacked
          ? index >= count - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 + 1)
          : false,
    };
    if (isStacked) {
      cell.inputTokens = Math.round(tokens * 0.09);
      cell.outputTokens = Math.round(tokens * 0.06);
      cell.cacheTokens = tokens - cell.inputTokens - cell.outputTokens;
    }
    return cell;
  });
  const totalTokens = range === "today"
    ? 399_813_342
    : range === "24h"
      ? 612_900_000
      : range === "7d"
        ? 1_240_000_000
        : range === "30d"
          ? 2_420_000_000
          : range === "90d"
            ? 3_800_000_000
            : 10_800_000_000;
  const flow = scaleFlow(MOCK_FLOW_90D, totalTokens / 3_800_000_000);
  const weeks: UsageShareWeek[] = [
    128, 186, 152, 244, 306, 274, 336, 318, 384, 362, 438, 472,
  ].map((tokens, index) => ({
    key: dayKeyAt(mondayOf(today), (index - (SHARE_WEEKS - 1)) * 7),
    tokens: tokens * 1_000_000,
  }));
  const weekStreak = { current: 12, longest: 12 };
  const dayStreak = { current: 7, longest: 7 };
  const cacheHitRate = 0.897;
  const main: UsageShareSnapshot["main"] = isHours
    ? {
        kind: "hours",
        eyebrow: "BUILD PULSE",
        headline: range === "today" ? "今日构建脉冲" : "24 小时构建脉冲",
        subline: "12,481 次请求 · 峰值按小时",
        columns: 24,
        rows: 1,
        cells,
      }
    : isDays
      ? {
          kind: "days",
          eyebrow: "7-DAY BUILD RHYTHM",
          headline: `${dayStreak.current} 天连续构建`,
          subline: `最长连续 ${dayStreak.longest} 天 · 峰值按日`,
          columns: 7,
          rows: 1,
          cells,
        }
      : isStacked
        ? {
            kind: "stacked",
            eyebrow: "30-DAY TOKEN MIX",
            headline: `缓存命中 ${(cacheHitRate * 100).toFixed(1)}%`,
            subline: "每柱一天 · 输入 / 缓存命中 / 输出 堆叠",
            columns: 30,
            rows: 1,
            cells,
          }
        : {
            kind: "calendar",
            eyebrow: `${SHARE_WEEKS}-WEEK ACTIVITY`,
            headline: `${weekStreak.current} 周连续构建`,
            subline: `最长连续 ${weekStreak.longest} 周 · 每格代表一天`,
            columns: SHARE_WEEKS,
            rows: 7,
            cells,
          };
  return {
    range,
    rangeLabel: labels.zh,
    rangeLabelEn: labels.en,
    generatedDate: today,
    user: { handle: "aklman", name: "Aklman Zhapar", initials: "AZ" },
    totalTokens,
    lifetimeTokens: 10_800_000_000,
    costMicros: range === "today"
      ? 222_480_000
      : range === "24h"
        ? 341_220_000
        : range === "all"
          ? 11_452_300_000
          : 4_032_510_000,
    activeSeconds: range === "today" ? 14_040 : range === "24h" ? 20_700 : 181_380,
    peakTokens: isHours ? 71_000_000 : 612_900_000,
    peakLabel: isHours ? "小时峰值" : "单日峰值",
    cacheHitRate,
    topModel: "GPT-5.6 Sol",
    topEffort: "EXTRA HIGH",
    toolCount: 6,
    requests: 12_481,
    flow,
    sessions: 1_286,
    streakWeeks: weekStreak,
    weeks,
    topTools: [
      { id: "kimi-code", label: "Kimi Code", tokens: 2_140_000_000, share: 0.563 },
      { id: "claude-code", label: "Claude Code", tokens: 890_000_000, share: 0.234 },
      { id: "codex", label: "Codex", tokens: 512_000_000, share: 0.135 },
      { id: "gemini-cli", label: "Gemini CLI", tokens: 176_000_000, share: 0.046 },
      { id: "opencode", label: "opencode", tokens: 82_000_000, share: 0.022 },
    ],
    leverage: totalTokens / flow.inputTokens,
    span: { from: "2026-05", to: "2026-08" },
    main,
  };
}
