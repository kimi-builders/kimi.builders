import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Download,
  KeyRound,
  Link2,
  Monitor,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { relTime } from "@/src/lib/format";
import { getLocale } from "@/src/lib/i18n-server";
import { listUsageDevices, type UsageDeviceSummary } from "@/src/lib/usage/device";
import {
  parseUsageFilters,
  usageFiltersToSearch,
  type UsageMetric,
} from "@/src/lib/usage/filters";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import {
  getUsageOverview,
  type UsageDistribution,
  type UsageDistributionRow,
  type UsageHeatmap,
  type UsageOverview,
  type UsageRecordRow,
  type UsageTrendDay,
} from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";
import {
  deleteAllUsageAction,
  deleteDeviceDataAction,
  revokeUsageDeviceAction,
  updateUsageSettingsAction,
} from "./actions";
import TzReporter from "./_components/TzReporter";
import UsageFilterBar from "./_components/UsageFilterBar";

export const metadata: Metadata = { title: "用量 — kimi.builders" };

function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

function duration(seconds: number, zh: boolean): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return zh ? `${hours}时 ${minutes}分` : `${hours}h ${minutes}m`;
  return zh ? `${minutes} 分钟` : `${minutes}m`;
}

/* 本地日序列:from(UTC 边界)+ tzOffset 即本地首日零点,之后用 UTC 数学逐日 +86400s。 */
function fillTrend(
  data: UsageTrendDay[],
  fromIso: string,
  days: number,
  tzOffsetMinutes: number,
): UsageTrendDay[] {
  const values = new Map(data.map((item) => [item.day, item]));
  const startMs = new Date(fromIso).getTime() + tzOffsetMinutes * 60_000;
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(startMs + index * 86_400_000).toISOString().slice(0, 10);
    return (
      values.get(day) ?? {
        day,
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
      }
    );
  });
}

/* 距现在的小时数;null 视为无限大(从未同步 = 过期)。
   时钟读数收在这个非组件 helper 里:组件渲染体内直接 Date.now() 会触发
   react-hooks/purity,而本页是动态服务端组件,每请求重渲染,读时钟是安全的。 */
function hoursSince(value: Date | string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

function gmtLabel(tzOffsetMinutes: number): string {
  const sign = tzOffsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

type RawParams = Record<string, string | string[] | undefined>;

function rawQueryString(raw: RawParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  return params.toString();
}

/* 页内导航链接:从当前 query 出发改少量 key,其余参数(metric/hm/ps…)原样保留。 */
function hrefWith(currentQuery: string, changes: Record<string, string | null>): string {
  const params = new URLSearchParams(currentQuery);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `/usage?${text}` : "/usage";
}

const WEEKDAY_LONG_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_LONG_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_SHORT_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_SHORT_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type HeatMetric = UsageMetric | "prompts";

function heatGrid(heatmap: UsageHeatmap, metric: HeatMetric): number[][] {
  if (metric === "cost") return heatmap.costMicros;
  if (metric === "duration") return heatmap.activeSeconds;
  if (metric === "prompts") return heatmap.prompts;
  return heatmap.tokens;
}

function formatHeatValue(metric: HeatMetric, value: number, zh: boolean): string {
  if (metric === "cost") return `$${(value / 1e6).toFixed(4)}`;
  if (metric === "duration") return duration(value, zh);
  if (metric === "prompts") return zh ? `${compact(value)} 次提示` : `${compact(value)} prompts`;
  return `${compact(value)} tokens`;
}

function SwitchLinks({
  items,
  label,
}: {
  items: { key: string; label: string; href: string; active: boolean }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`px-2.5 py-1 font-mono text-[10px] transition-colors ${
            item.active ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/* 每日趋势:tokens 视图是五类堆叠柱,cost/duration 是单系列柱。
   全零范围渲染居中提示而不是一副空坐标。 */
function TrendChart({
  trend,
  metric,
  zh,
}: {
  trend: UsageTrendDay[];
  metric: UsageMetric;
  zh: boolean;
}) {
  const valueOf = (item: UsageTrendDay): number =>
    metric === "cost" ? item.costMicros : metric === "duration" ? item.activeSeconds : item.totalTokens;
  const max = Math.max(0, ...trend.map(valueOf));
  if (max <= 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-grey">
        {zh ? "该范围内暂无数据" : "No data in this range"}
      </div>
    );
  }
  const labelIndices = new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1]);
  const tooltip = (item: UsageTrendDay): string => {
    if (metric === "cost") return `${item.day} · $${(item.costMicros / 1e6).toFixed(4)}`;
    if (metric === "duration") return `${item.day} · ${duration(item.activeSeconds, zh)}`;
    return `${item.day} · ${compact(item.totalTokens)} tokens`;
  };
  const srValue = (item: UsageTrendDay): string => {
    if (metric === "cost") return `$${(item.costMicros / 1e6).toFixed(4)}`;
    if (metric === "duration") return `${item.activeSeconds.toLocaleString()}s`;
    return `${item.totalTokens.toLocaleString()} tokens`;
  };
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex h-48 items-end gap-1.5 border-b border-line px-1">
            {trend.map((item) => {
              const value = valueOf(item);
              const height = value === 0 ? 1 : Math.max(4, (value / max) * 100);
              return (
                <div key={item.day} className="group relative flex h-full min-w-1 flex-1 items-end">
                  {metric === "tokens" ? (
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden bg-card transition-opacity group-hover:opacity-80"
                      style={{ height: `${height}%` }}
                      title={tooltip(item)}
                    >
                      <span
                        className="block bg-blue"
                        style={{ height: `${item.totalTokens ? (item.inputTokens / item.totalTokens) * 100 : 0}%` }}
                      />
                      <span
                        className="block bg-violet-400/80"
                        style={{ height: `${item.totalTokens ? (item.cacheWriteInputTokens / item.totalTokens) * 100 : 0}%` }}
                      />
                      <span
                        className="block bg-emerald-400/70"
                        style={{ height: `${item.totalTokens ? (item.cacheReadInputTokens / item.totalTokens) * 100 : 0}%` }}
                      />
                      <span
                        className="block bg-paper/70"
                        style={{ height: `${item.totalTokens ? (item.outputTokens / item.totalTokens) * 100 : 0}%` }}
                      />
                      <span
                        className="block bg-amber-400/90"
                        style={{ height: `${item.totalTokens ? (item.reasoningOutputTokens / item.totalTokens) * 100 : 0}%` }}
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-full transition-opacity group-hover:opacity-80 ${
                        value === 0 ? "bg-card" : metric === "cost" ? "bg-blue" : "bg-blue/70"
                      }`}
                      style={{ height: `${height}%` }}
                      title={tooltip(item)}
                    />
                  )}
                  <span className="sr-only">
                    {item.day}: {srValue(item)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5 px-1">
            {trend.map((item, index) => (
              <span
                key={item.day}
                className={`min-w-1 flex-1 truncate font-mono text-[9px] text-grey ${
                  index === 0
                    ? "text-left"
                    : index === trend.length - 1
                      ? "text-right"
                      : "text-center"
                }`}
              >
                {labelIndices.has(index) ? item.day.slice(5) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      {metric === "tokens" && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px] text-grey">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-blue" />{zh ? "输入" : "Input"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-violet-400/80" />{zh ? "缓存写" : "Cache write"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-emerald-400/70" />{zh ? "缓存读" : "Cache read"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-paper/70" />{zh ? "输出" : "Output"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-amber-400/90" />{zh ? "推理" : "Reasoning"}</span>
        </div>
      )}
    </div>
  );
}

/* 分时活跃热图:7(周一..周日)× 24(本地小时),格子不造页面级横向滚动。 */
function HeatmapGrid({
  heatmap,
  metric,
  tzOffsetMinutes,
  zh,
}: {
  heatmap: UsageHeatmap;
  metric: HeatMetric;
  tzOffsetMinutes: number;
  zh: boolean;
}) {
  const grid = heatGrid(heatmap, metric);
  const max = Math.max(0, ...grid.flat());
  const longNames = zh ? WEEKDAY_LONG_ZH : WEEKDAY_LONG_EN;
  const shortNames = zh ? WEEKDAY_SHORT_ZH : WEEKDAY_SHORT_EN;
  const stepClass = (value: number): string => {
    if (value <= 0 || max <= 0) return "bg-card";
    const ratio = value / max;
    if (ratio <= 0.25) return "bg-blue/25";
    if (ratio <= 0.45) return "bg-blue/45";
    if (ratio <= 0.65) return "bg-blue/65";
    if (ratio <= 0.85) return "bg-blue/85";
    return "bg-blue";
  };
  const cellLabel = (weekday: number, hour: number, value: number): string =>
    `${longNames[weekday]} ${String(hour).padStart(2, "0")}:00 · ${formatHeatValue(metric, value, zh)}`;
  const top = grid
    .flatMap((row, weekday) => row.map((value, hour) => ({ weekday, hour, value })))
    .filter((cell) => cell.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-6 shrink-0" />
            <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="text-center font-mono text-[8px] text-grey">
                  {hour % 3 === 0 ? hour : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-1 space-y-[2px]">
            {grid.map((row, weekday) => (
              <div key={weekday} className="flex items-center gap-1.5">
                <span className="w-6 shrink-0 font-mono text-[9px] text-grey">
                  {shortNames[weekday]}
                </span>
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
                  {row.map((value, hour) => (
                    <span
                      key={hour}
                      className={`h-4 sm:h-5 ${stepClass(value)}`}
                      title={cellLabel(weekday, hour, value)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 font-mono text-[9px] text-grey">
        {zh
          ? `时区:${gmtLabel(tzOffsetMinutes)}(浏览器本地)`
          : `Timezone: ${gmtLabel(tzOffsetMinutes)} (browser local)`}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-[10px] text-grey hover:text-paper">
          {zh ? "最活跃时段(TOP 5)" : "BUSIEST SLOTS (TOP 5)"}
        </summary>
        {top.length === 0 ? (
          <p className="mt-2 text-[10px] text-grey">
            {zh ? "该范围内暂无数据" : "No data in this range"}
          </p>
        ) : (
          <ol className="mt-2 space-y-1 font-mono text-[10px] text-grey">
            {top.map((cell) => (
              <li key={`${cell.weekday}-${cell.hour}`}>
                {longNames[cell.weekday]} {String(cell.hour).padStart(2, "0")}:00 —{" "}
                {formatHeatValue(metric, cell.value, zh)}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}

function DistributionCard({
  title,
  dist,
  metric,
  zh,
  labelOf,
}: {
  title: string;
  dist: UsageDistribution;
  metric: UsageMetric;
  zh: boolean;
  labelOf: (row: UsageDistributionRow) => string;
}) {
  const byCost = metric === "cost";
  const denom = byCost ? dist.totalCostMicros : dist.totalTokens;
  return (
    <section className="border border-line bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">{title}</h3>
        <span className="font-mono text-[9px] text-grey">
          {byCost ? (zh ? "按估费" : "by cost") : zh ? "按 Token" : "by tokens"}
        </span>
      </div>
      {dist.rows.length === 0 ? (
        <p className="mt-4 text-xs text-grey">{zh ? "该范围内暂无数据" : "No data in this range"}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {dist.rows.map((row) => {
            const basis = byCost ? row.costMicros : row.tokens;
            const pct = denom > 0 ? (basis / denom) * 100 : 0;
            const label = labelOf(row);
            return (
              <li key={row.key === "" ? "__empty__" : row.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs text-paper" title={label}>
                    {label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-grey">
                    {compact(row.tokens)} · {Math.round(pct)}% ·{" "}
                    {row.hasUnpriced && row.costMicros === 0 ? (
                      <span className="text-grey">{zh ? "未定价" : "unpriced"}</span>
                    ) : (
                      `$${(row.costMicros / 1e6).toFixed(2)}`
                    )}
                  </span>
                </div>
                <div className="mt-1 h-1.5 bg-card">
                  <div className="h-full bg-blue/70" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function recordCost(row: UsageRecordRow, zh: boolean): ReactNode {
  if (row.priceStatus === "legacy") return <span className="text-grey">—</span>;
  if (row.priceStatus === "unpriced") {
    return <span className="text-grey">{zh ? "未定价" : "unpriced"}</span>;
  }
  return (
    <>
      ${(row.costMicros / 1e6).toFixed(2)}
      {row.priceStatus === "partial" ? "*" : ""}
    </>
  );
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";

  if (!user) {
    return (
      <div>
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <BarChart3 size={17} /> {zh ? "用量" : "Usage"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-grey">
          {zh
            ? "以 Kimi 为第一公民的多工具 AI 编程用量中心。数据默认私有，只上传统计字段。"
            : "A Kimi-first usage center for AI coding tools. Data stays private and only metrics are uploaded."}
        </p>
        <p className="mt-8 text-sm text-grey">
          {zh ? "登录后连接设备：" : "Sign in to connect a device:"}
          <a href="/api/auth/github?next=%2Fusage" className="ml-2 text-blue hover:underline">GitHub</a>
          <a href="/api/auth/google?next=%2Fusage" className="ml-3 text-blue hover:underline">Google</a>
        </p>
      </div>
    );
  }

  const settings = await getUsageSettings(user.id);
  const cookieStore = await cookies();
  const parsedTz = Number(cookieStore.get("kb_tz")?.value);
  const tz = Number.isFinite(parsedTz) ? parsedTz : 0;
  const raw = await searchParams;
  const filters = parseUsageFilters(raw, {
    uploadProject: settings.uploadProject,
    tzOffsetMinutes: tz,
  });

  let overview: UsageOverview | null = null;
  let devices: UsageDeviceSummary[] = [];
  try {
    [overview, devices] = await Promise.all([
      getUsageOverview(user.id, filters),
      listUsageDevices(user.id),
    ]);
  } catch {
    overview = null;
    devices = [];
  }

  const query = rawQueryString(raw);
  const lastSyncAt = overview?.lastSyncAt ?? null;
  const staleSync = hoursSince(lastSyncAt) > 48;

  const filterSearch = usageFiltersToSearch(filters);
  const exportSuffix = `tz=${filters.tzOffsetMinutes}${filterSearch ? `&${filterSearch.slice(1)}` : ""}`;
  const clearFiltersHref = hrefWith(query, {
    sources: null,
    models: null,
    projects: null,
    devices: null,
    page: null,
  });

  const header = (
    <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <BarChart3 size={18} /> {zh ? "用量中心" : "Usage center"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
          {zh
            ? "Kimi-first，多工具兼容。这里只接收 token、时间与计数，不接收对话内容、完整路径或供应商凭据。"
            : "Kimi-first and multi-tool ready. Only token, timing, and count metrics are accepted—never conversations, full paths, or provider credentials."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-grey">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-blue" />
            {zh ? "默认私有" : "Private by default"}
          </span>
          <span>·</span>
          <span>
            {lastSyncAt
              ? zh
                ? `最近同步 ${relTime(lastSyncAt, locale)}`
                : `Synced ${relTime(lastSyncAt, locale)}`
              : zh
                ? "尚未同步"
                : "Not synced yet"}
          </span>
          {staleSync && (
            <span className="border border-amber-500/40 px-1.5 py-0.5 text-amber-400">
              {zh ? "数据可能过期" : "Possibly stale"}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a
          href="/usage/device"
          className="inline-flex items-center justify-center gap-2 border border-blue bg-blue px-4 py-2.5 font-mono text-xs font-semibold text-white hover:opacity-90"
        >
          <Link2 size={14} /> {zh ? "连接设备" : "Connect device"}
        </a>
        <a
          href={`/api/usage/export?format=csv&${exportSuffix}`}
          className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue"
        >
          <Download size={12} /> {zh ? "导出 CSV" : "Export CSV"}
        </a>
        <a
          href={`/api/usage/export?format=json&${exportSuffix}`}
          className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue"
        >
          <Download size={12} /> {zh ? "导出 JSON" : "Export JSON"}
        </a>
      </div>
    </header>
  );

  if (!overview) {
    return (
      <div className="usage-dashboard">
        {header}
        <section className="mt-6 border border-red-500/40 bg-card p-5 sm:p-6">
          <p className="text-sm text-grey">
            {zh ? "数据加载失败，请稍后重试。" : "Failed to load usage data. Please try again later."}
          </p>
        </section>
        <TzReporter />
      </div>
    );
  }

  const { totals } = overview;
  const trend = fillTrend(overview.trend, overview.range.from, overview.days, filters.tzOffsetMinutes);
  const totalsEmpty =
    totals.totalTokens === 0 && totals.requests === 0 && totals.sessions === 0;
  const dimensionFiltersActive = !!(
    filters.sources ||
    filters.models ||
    filters.projects ||
    filters.devices
  );
  const showOnboarding = devices.length === 0 || (totalsEmpty && !dimensionFiltersActive);
  const showRangeEmpty = !showOnboarding && totalsEmpty && dimensionFiltersActive;
  const modelsFiltered = filters.models !== null;

  const rawHm = Array.isArray(raw.hm) ? raw.hm[0] : raw.hm;
  const heatMetric: HeatMetric =
    rawHm === "cost" || rawHm === "duration" || rawHm === "prompts" || rawHm === "tokens"
      ? rawHm
      : filters.metric;

  const trendSwitch = (
    [
      { key: "tokens", label: "Token", metric: null as string | null },
      { key: "cost", label: zh ? "费用" : "Cost", metric: "cost" },
      { key: "duration", label: zh ? "时长" : "Time", metric: "duration" },
    ] as const
  ).map((item) => ({
    key: item.key,
    label: item.label,
    href: hrefWith(query, { metric: item.metric }),
    active: filters.metric === item.key,
  }));

  const heatSwitch = (
    [
      { key: "tokens" as HeatMetric, label: "Token" },
      { key: "cost" as HeatMetric, label: zh ? "费用" : "Cost" },
      { key: "duration" as HeatMetric, label: zh ? "时长" : "Time" },
      { key: "prompts" as HeatMetric, label: zh ? "提示" : "Prompts" },
    ] as const
  ).map((item) => ({
    key: item.key,
    label: item.label,
    /* hm 缺省时回落到页面 metric;与页面 metric 相同的项直接清掉 hm。 */
    href: hrefWith(query, { hm: item.key === filters.metric ? null : item.key }),
    active: heatMetric === item.key,
  }));

  const pricingVersions = overview.meta.pricingVersions.join("、");
  const unpricedCount = overview.meta.unpricedModels.length;
  const kpis: { icon: typeof Activity; label: string; value: string; note: string; sessionNote?: boolean }[] = [
    {
      icon: Activity,
      label: zh ? "API 等价估费" : "API EQUIVALENT",
      value: `$${(totals.costMicros / 1e6).toFixed(2)}`,
      note: zh
        ? `价格表 ${pricingVersions || "—"} · ${unpricedCount} 个模型未定价`
        : `Pricing ${pricingVersions || "—"} · ${unpricedCount} unpriced models`,
    },
    {
      icon: BarChart3,
      label: zh ? "总 TOKEN" : "TOTAL TOKENS",
      value: compact(totals.totalTokens),
      note: `${compact(totals.inputTokens)} ${zh ? "输入" : "input"}`,
    },
    {
      icon: Clock3,
      label: zh ? "活跃时长" : "ACTIVE TIME",
      value: duration(totals.activeSeconds, zh),
      note: zh ? "基于本地交互时间" : "From local interactions",
      sessionNote: true,
    },
    {
      icon: Monitor,
      label: zh ? "会话数" : "SESSIONS",
      value: compact(totals.sessions),
      note: `${compact(totals.requests)} ${zh ? "次调用" : "requests"} · ${totals.activeDevices} ${
        zh ? "台活跃设备" : "active devices"
      }`,
      sessionNote: true,
    },
  ];

  const otherLabel = zh ? "其他" : "Other";
  const notUploadedLabel = zh ? "未上传" : "Not uploaded";
  const records = overview.records;
  const totalPages = Math.max(1, Math.ceil(records.total / records.pageSize));
  const prevPageHref =
    records.page > 1
      ? hrefWith(query, { page: records.page - 1 > 1 ? String(records.page - 1) : null })
      : null;
  const nextPageHref =
    records.page < totalPages ? hrefWith(query, { page: String(records.page + 1) }) : null;

  return (
    <div className="usage-dashboard">
      {header}

      {showOnboarding && (
        <section className="mt-6 border border-blue/35 bg-blue/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <KeyRound size={18} className="mt-0.5 shrink-0 text-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-mono text-sm font-semibold text-paper">
                {zh ? "连接 Kimi Code，生成第一份用量" : "Connect Kimi Code for your first report"}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {zh
                  ? "支持 Kimi Code / Claude Code / Codex 三个来源。Collector 在本地读取日志；先展示将上传的字段，再由浏览器批准这台设备。"
                  : "Kimi Code, Claude Code, and Codex are supported. The collector reads logs locally, previews uploaded fields, then asks you to approve this device in the browser."}
              </p>
              <pre className="mt-4 overflow-x-auto border border-line bg-bg px-3 py-3 font-mono text-xs text-paper">
                npx @kimi-builders/usage init
              </pre>
              <ol className="mt-4 grid gap-3 text-xs text-grey sm:grid-cols-3">
                <li><span className="mr-2 font-mono text-blue">01</span>{zh ? "本地检测日志" : "Detect local logs"}</li>
                <li><span className="mr-2 font-mono text-blue">02</span>{zh ? "浏览器批准设备" : "Approve in browser"}</li>
                <li><span className="mr-2 font-mono text-blue">03</span>{zh ? "幂等增量同步" : "Idempotent sync"}</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {showRangeEmpty && (
        <section className="mt-6 border border-line bg-card p-4 text-xs text-grey">
          {zh ? "该筛选范围内没有数据，" : "No data in this filtered range. "}
          <a href={clearFiltersHref} className="text-blue hover:underline">
            {zh ? "试试清除筛选" : "Try clearing filters"}
          </a>
        </section>
      )}

      <UsageFilterBar
        options={overview.options}
        applied={{
          range: filters.rangeLabel,
          sources: filters.sources?.join(","),
          models: filters.models?.join(","),
          projects: filters.projects?.join(","),
          devices: filters.devices?.join(","),
        }}
        projectsEnabled={filters.projectsEnabled}
        zh={zh}
        preservedQuery={query}
      />

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value, note, sessionNote }) => (
          <article key={label} className="border border-line bg-card p-4">
            <div className="flex items-center justify-between text-grey">
              <span className="font-mono text-[10px] tracking-[0.14em]">{label}</span>
              <Icon size={14} />
            </div>
            <div className="mt-4 font-mono text-xl font-semibold text-paper">{value}</div>
            <div className="mt-1.5 text-[10px] text-grey">{note}</div>
            {modelsFiltered && sessionNote && (
              <div className="mt-1 text-[9px] text-grey/70">
                {zh ? "会话指标不按模型拆分" : "Session metrics are not split by model"}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="mt-3 border border-line bg-card p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: zh ? "输入" : "INPUT", value: compact(totals.inputTokens) },
            { label: zh ? "输出" : "OUTPUT", value: compact(totals.outputTokens) },
            { label: zh ? "缓存写" : "CACHE WRITE", value: compact(totals.cacheWriteInputTokens) },
            { label: zh ? "缓存读" : "CACHE READ", value: compact(totals.cacheReadInputTokens) },
            { label: zh ? "推理" : "REASONING", value: compact(totals.reasoningOutputTokens) },
            { label: zh ? "请求数" : "REQUESTS", value: compact(totals.requests) },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="font-mono text-[9px] tracking-[0.14em] text-grey">{stat.label}</div>
              <div className="mt-1.5 font-mono text-sm font-semibold text-paper">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {zh ? "每日趋势" : "DAILY TREND"}
            </h2>
            <p className="mt-1 text-[10px] text-grey">
              {zh
                ? `本地日界(${gmtLabel(filters.tzOffsetMinutes)}) · 30 分钟事实桶聚合`
                : `Local days (${gmtLabel(filters.tzOffsetMinutes)}) · 30-minute buckets`}
            </p>
          </div>
          <SwitchLinks items={trendSwitch} label={zh ? "趋势指标" : "Trend metric"} />
        </div>
        <div className="mt-6">
          <TrendChart trend={trend} metric={filters.metric} zh={zh} />
        </div>
      </section>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {zh ? "分时活跃" : "ACTIVITY HEATMAP"}
            </h2>
            <p className="mt-1 text-[10px] text-grey">
              {zh ? "星期 × 本地小时" : "Weekday × local hour"}
            </p>
          </div>
          <SwitchLinks items={heatSwitch} label={zh ? "热图指标" : "Heatmap metric"} />
        </div>
        <div className="mt-5">
          <HeatmapGrid
            heatmap={overview.heatmap}
            metric={heatMetric}
            tzOffsetMinutes={filters.tzOffsetMinutes}
            zh={zh}
          />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DistributionCard
          title={zh ? "工具" : "TOOLS"}
          dist={overview.distributions.source}
          metric={filters.metric}
          zh={zh}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : usageSourceLabel(row.key))}
        />
        <DistributionCard
          title={zh ? "模型" : "MODELS"}
          dist={overview.distributions.model}
          metric={filters.metric}
          zh={zh}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : row.key)}
        />
        <section className="border border-line bg-card p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {zh ? "项目" : "PROJECTS"}
            </h3>
            <span className="font-mono text-[9px] text-grey">
              {filters.metric === "cost" ? (zh ? "按估费" : "by cost") : zh ? "按 Token" : "by tokens"}
            </span>
          </div>
          {!filters.projectsEnabled ? (
            <p className="mt-4 text-xs leading-relaxed text-grey">
              {zh
                ? "项目名未上传 — 在隐私设置中开启后按项目拆分"
                : "Project names are not uploaded — enable them in privacy settings to split by project"}
            </p>
          ) : overview.distributions.project.rows.length === 0 ? (
            <p className="mt-4 text-xs text-grey">
              {zh ? "该范围内暂无数据" : "No data in this range"}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {overview.distributions.project.rows.map((row) => {
                const byCost = filters.metric === "cost";
                const denom = byCost
                  ? overview.distributions.project.totalCostMicros
                  : overview.distributions.project.totalTokens;
                const pct = denom > 0 ? ((byCost ? row.costMicros : row.tokens) / denom) * 100 : 0;
                const label =
                  row.key === "__other__" ? otherLabel : row.key === "" ? notUploadedLabel : row.key;
                return (
                  <li key={row.key === "" ? "__empty__" : row.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-xs text-paper" title={label}>
                        {label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-grey">
                        {compact(row.tokens)} · {Math.round(pct)}% ·{" "}
                        {row.hasUnpriced && row.costMicros === 0 ? (
                          <span className="text-grey">{zh ? "未定价" : "unpriced"}</span>
                        ) : (
                          `$${(row.costMicros / 1e6).toFixed(2)}`
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-card">
                      <div className="h-full bg-blue/70" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <DistributionCard
          title={zh ? "设备" : "DEVICES"}
          dist={overview.distributions.device}
          metric={filters.metric}
          zh={zh}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : row.label)}
        />
      </div>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
            {zh ? "明细" : "RECORDS"}
          </h2>
          <p className="font-mono text-[9px] text-grey">
            {zh
              ? `按 日×工具×模型×项目×设备 聚合 · 共 ${records.total} 组`
              : `Grouped by day × source × model × project × device · ${records.total} groups`}
          </p>
        </div>
        {records.rows.length === 0 ? (
          <p className="mt-4 text-xs text-grey">
            {zh ? "该范围内暂无数据" : "No data in this range"}
          </p>
        ) : (
          <>
            <div className="mt-4 hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead>
                    <tr className="text-left font-mono text-[10px] tracking-wide text-grey">
                      {(zh
                        ? ["日期", "工具", "模型", "项目", "设备", "输入", "缓存写", "缓存读", "输出", "推理", "请求", "估费"]
                        : ["DAY", "SOURCE", "MODEL", "PROJECT", "DEVICE", "INPUT", "CACHE W", "CACHE R", "OUTPUT", "REASON", "REQS", "COST"]
                      ).map((heading) => (
                        <th key={heading} className="whitespace-nowrap pb-2 pr-4 font-normal">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.rows.map((row, index) => (
                      <tr
                        key={`${row.day}-${row.source}-${row.model}-${row.project ?? ""}-${row.deviceId}-${index}`}
                        className="border-t border-line"
                      >
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{row.day}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">
                          {usageSourceLabel(row.source)}
                        </td>
                        <td
                          className="max-w-[180px] truncate whitespace-nowrap py-2 pr-4 text-paper"
                          title={row.model}
                        >
                          {row.model}
                        </td>
                        <td
                          className="max-w-[140px] truncate whitespace-nowrap py-2 pr-4 text-paper"
                          title={row.project ?? notUploadedLabel}
                        >
                          {row.project === null ? (
                            <span className="text-grey">{notUploadedLabel}</span>
                          ) : (
                            row.project
                          )}
                        </td>
                        <td
                          className="max-w-[120px] truncate whitespace-nowrap py-2 pr-4 text-paper"
                          title={row.deviceName}
                        >
                          {row.deviceName}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{compact(row.inputTokens)}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{compact(row.cacheWriteInputTokens)}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{compact(row.cacheReadInputTokens)}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{compact(row.outputTokens)}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{compact(row.reasoningOutputTokens)}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-paper">{compact(row.requests)}</td>
                        <td className="whitespace-nowrap py-2 text-paper">{recordCost(row, zh)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <ul className="mt-4 space-y-2 sm:hidden">
              {records.rows.map((row, index) => (
                <li
                  key={`${row.day}-${row.source}-${row.model}-${row.project ?? ""}-${row.deviceId}-${index}`}
                  className="border border-line p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-grey">{row.day}</span>
                    <span className="min-w-0 truncate text-xs text-paper" title={`${usageSourceLabel(row.source)} · ${row.model}`}>
                      {usageSourceLabel(row.source)} · {row.model}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[10px] text-grey">
                    {compact(row.totalTokens)} tokens · {recordCost(row, zh)} · {compact(row.requests)}{" "}
                    {zh ? "次请求" : "req"}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          {prevPageHref ? (
            <a
              href={prevPageHref}
              className="border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue"
            >
              {zh ? "上一页" : "Prev"}
            </a>
          ) : (
            <span className="cursor-not-allowed border border-line px-3 py-1.5 font-mono text-[10px] text-grey/40">
              {zh ? "上一页" : "Prev"}
            </span>
          )}
          <span className="font-mono text-[10px] text-grey">
            {zh ? `第 ${records.page} / ${totalPages} 页` : `Page ${records.page} / ${totalPages}`}
          </span>
          {nextPageHref ? (
            <a
              href={nextPageHref}
              className="border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue"
            >
              {zh ? "下一页" : "Next"}
            </a>
          ) : (
            <span className="cursor-not-allowed border border-line px-3 py-1.5 font-mono text-[10px] text-grey/40">
              {zh ? "下一页" : "Next"}
            </span>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {zh ? "设备与 Key" : "DEVICES & KEYS"}
            </h2>
            <a href="/usage/device" className="font-mono text-[10px] text-blue hover:underline">
              + {zh ? "连接" : "Connect"}
            </a>
          </div>
          {devices.length === 0 ? (
            <p className="mt-5 text-xs text-grey">
              {zh ? "还没有已授权设备。" : "No authorized devices yet."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {devices.map((device) => {
                const stale = hoursSince(device.lastSeenAt) > 24;
                return (
                  <li key={device.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-paper">{device.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-grey">
                          <span>
                            {device.platform} · {device.surface}
                            {device.lastSeenAt ? ` · ${relTime(device.lastSeenAt, locale)}` : ""}
                          </span>
                          {stale && (
                            <span className="inline-flex items-center gap-1 text-grey">
                              <Clock3 size={10} />
                              {zh ? ">24h 未同步" : "stale >24h"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {device.revokedAt ? (
                          <span className="border border-line px-2 py-1 font-mono text-[9px] text-grey">
                            {zh ? "已撤销" : "Revoked"}
                          </span>
                        ) : (
                          <form action={revokeUsageDeviceAction}>
                            <input type="hidden" name="device_id" value={device.id} />
                            <button className="flex items-center gap-1 font-mono text-[9px] text-grey hover:text-paper">
                              <Trash2 size={11} />
                              {zh ? "撤销" : "Revoke"}
                            </button>
                          </form>
                        )}
                        <form action={deleteDeviceDataAction}>
                          <input type="hidden" name="device_id" value={device.id} />
                          <input type="hidden" name="confirm_device_data" value="1" />
                          <button className="flex items-center gap-1 font-mono text-[9px] text-grey hover:text-red-400">
                            <Trash2 size={11} />
                            {zh ? "删除数据" : "Delete data"}
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border border-line bg-card p-4 sm:p-5">
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
            {zh ? "隐私设置" : "PRIVACY"}
          </h2>
          <form action={updateUsageSettingsAction} className="mt-4">
            <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-line pb-4">
              <span>
                <span className="block text-sm text-paper">
                  {zh ? "上传项目目录名" : "Upload project names"}
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-grey">
                  {zh
                    ? "仅 basename；关闭后 Collector 的 payload 中不会出现 project 字段。"
                    : "Basename only; when off, project is absent from collector payloads."}
                </span>
              </span>
              <input
                type="checkbox"
                name="upload_project"
                value="1"
                defaultChecked={settings.uploadProject}
                className="mt-1 h-4 w-4 shrink-0 accent-blue"
              />
            </label>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] text-grey">
                {zh ? `保留 ${settings.retentionDays} 天` : `${settings.retentionDays}-day retention`}
              </span>
              <button className="border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue">
                {zh ? "保存" : "Save"}
              </button>
            </div>
          </form>
          <details className="mt-5 border-t border-line pt-4">
            <summary className="cursor-pointer font-mono text-[10px] text-grey hover:text-paper">
              {zh ? "删除全部用量数据" : "Delete all usage data"}
            </summary>
            <form action={deleteAllUsageAction} className="mt-3">
              <p className="text-[10px] leading-relaxed text-grey">
                {zh
                  ? "输入 DELETE 后删除所有事实数据和 legacy 数据；设备授权保持不变。"
                  : "Type DELETE to remove all fact and legacy data. Device authorization remains."}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  name="confirmation"
                  placeholder="DELETE"
                  className="min-w-0 flex-1 border border-line bg-bg px-2 py-1.5 font-mono text-xs text-paper outline-none focus:border-blue"
                />
                <button className="border border-red-500/40 px-3 font-mono text-[10px] text-red-400 hover:border-red-500">
                  {zh ? "删除" : "Delete"}
                </button>
              </div>
            </form>
          </details>
        </section>
      </div>

      <div className="mt-5 space-y-2 text-[10px] leading-relaxed text-grey/80">
        <p>
          {zh
            ? "可信度说明：数据来自用户设备的自报日志，可能不完整或被修改；它用于个人洞察，不是可验证的计量凭证。"
            : "Trust note: data is self-reported from user devices and may be incomplete or modified. It is for personal insight, not verified metering."}
        </p>
        <p>
          {zh
            ? `估费为服务端价格表的 API 等价估算(版本 ${pricingVersions || "—"}),不代表订阅账单;未定价模型的 token 照常统计但不计费。`
            : `Costs are API-equivalent estimates from the server pricing table (version ${pricingVersions || "—"}), not subscription bills. Tokens from unpriced models are counted as usual but never billed.`}
        </p>
        {overview.meta.unpricedModels.length > 0 && (
          <p className="truncate font-mono" title={overview.meta.unpricedModels.join(", ")}>
            {zh ? "未定价模型:" : "Unpriced models: "}
            {overview.meta.unpricedModels.join(", ")}
          </p>
        )}
      </div>

      <TzReporter />
    </div>
  );
}
