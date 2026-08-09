import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Clock3,
  Database,
  Gauge,
  Link2,
  MessageSquare,
  MessagesSquare,
  Orbit,
  ShieldCheck,
  Timer,
  User,
} from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import { getSessionUser } from "@/src/lib/auth/session";
import { relTime } from "@/src/lib/format";
import { getLocale } from "@/src/lib/i18n-server";
import { usageCacheHitRate } from "@/src/lib/usage-contract";
import { listUsageDevices } from "@/src/lib/usage/device";
import {
  parseUsageFilters,
  usageFiltersToSearch,
  type UsageGranularity,
  type UsageMetric,
} from "@/src/lib/usage/filters";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import { captureUsageOperation } from "@/src/lib/usage/observability";
import {
  USAGE_STALE_AFTER_HOURS,
  usageDashboardViewState,
} from "@/src/lib/usage/presentation";
import {
  USAGE_DISPLAY_CURRENCIES,
  USAGE_FX_AS_OF,
  type UsageDisplayCurrency,
} from "@/src/lib/usage/pricing";
import {
  getUsageOverview,
  type UsageDistribution,
  type UsageDistributionRow,
  type UsageTrendDay,
} from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";
import CurrencyToggle from "./_components/CurrencyToggle";
import TzReporter from "./_components/TzReporter";
import { UsageFirstRun, UsageRangeEmpty } from "./_components/UsageEmptyStates";
import UsageFilterBar from "./_components/UsageFilterBar";
import UsageExportDialog from "./_components/UsageExportDialog";
import UsageLoadErrorCard from "./_components/UsageLoadErrorCard";
import UsageManagementPanels from "./_components/UsageManagementPanels";
import UsageMethodologyDialog from "./_components/UsageMethodologyDialog";
import UsageRecordsSection from "./_components/UsageRecordsSection";
import {
  UsageHeatmapGrid,
  UsageTrendChart,
  UsageWeeklyTrend,
  type UsageHeatMetric,
} from "./_components/UsageVisualizations";

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

/* 距现在的小时数;null 视为无限大(从未同步 = 过期)。
   时钟读数收在这个非组件 helper 里:组件渲染体内直接 Date.now() 会触发
   react-hooks/purity,而本页是动态服务端组件,每请求重渲染,读时钟是安全的。 */
function hoursSince(value: Date | string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

/* 展示层币种折算(静态汇率,仅影响展示):micros(美元)→ 目标币种;
   折算值 >= 0.01 两位小数,否则四位(小数额保持可见)。
   未定价/legacy 不走这里,保持「未定价」/「—」。 */
function fmtCost(micros: number, ccy: UsageDisplayCurrency): string {
  const { rate, symbol } = USAGE_DISPLAY_CURRENCIES[ccy];
  const value = (micros / 1e6) * rate;
  return `${symbol}${value >= 0.01 ? value.toFixed(2) : value.toFixed(4)}`;
}

/* 缓存命中率展示:ratio 0..1 → "87.3%";null(无输入侧流量)→ —。 */
function fmtHitRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function zeroTrendSlot(key: string): UsageTrendDay {
  return {
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
}

/* 趋势补零:按粒度生成 [from, to) 的完整本地时间格序列。
   纯 UTC 数学:localMs = utcMs + tzOffset,再用 getUTC* 读移位后的墙钟。
   hour → "YYYY-MM-DD HH:00"(24h 滚动从 from 之后第一个整点开始);
   day → "YYYY-MM-DD";week → 本地周一的 "YYYY-MM-DD"。与 query.ts 的
   trendTimeExpr 输出一一对应。 */
function fillTrend(
  data: UsageTrendDay[],
  fromIso: string,
  toIso: string,
  granularity: UsageGranularity,
  tzOffsetMinutes: number,
): UsageTrendDay[] {
  const values = new Map(data.map((item) => [item.day, item]));
  const tz = tzOffsetMinutes * 60_000;
  const fromShifted = new Date(fromIso).getTime() + tz;
  const toShifted = new Date(toIso).getTime() + tz;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayKey = (shiftedMs: number) => new Date(shiftedMs).toISOString().slice(0, 10);
  const hourKey = (shiftedMs: number) => {
    const d = new Date(shiftedMs);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
      d.getUTCHours(),
    )}:00`;
  };

  let cursor: number;
  let step: number;
  let keyOf: (shiftedMs: number) => string;
  if (granularity === "hour") {
    cursor = Math.ceil(fromShifted / HOUR_MS) * HOUR_MS;
    step = HOUR_MS;
    keyOf = hourKey;
  } else if (granularity === "week") {
    const dayFloor = Math.floor(fromShifted / DAY_MS) * DAY_MS;
    cursor = dayFloor - ((new Date(dayFloor).getUTCDay() + 6) % 7) * DAY_MS;
    step = 7 * DAY_MS;
    keyOf = dayKey;
  } else {
    cursor = Math.floor(fromShifted / DAY_MS) * DAY_MS;
    step = DAY_MS;
    keyOf = dayKey;
  }

  const series: UsageTrendDay[] = [];
  for (let m = cursor; m < toShifted; m += step) {
    const key = keyOf(m);
    series.push(values.get(key) ?? zeroTrendSlot(key));
  }
  return series;
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

/* 页内导航链接:从当前 query 出发改少量 key,其余参数(metric/hm/ps/cols…)原样保留。 */
function hrefWith(currentQuery: string, changes: Record<string, string | null>): string {
  const params = new URLSearchParams(currentQuery);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `/usage?${text}` : "/usage";
}

/* 环比小注:正 emerald / 负 red / 上期为零 → 「—」。 */
function deltaNote(cur: number, prev: number, zh: boolean): ReactNode {
  const title = zh ? "环比上一等长周期" : "vs the previous equal-length period";
  if (prev <= 0) {
    return (
      <span className="font-mono text-[11px] text-grey" title={title}>
        —
      </span>
    );
  }
  const pct = ((cur - prev) / prev) * 100;
  return (
    <span
      className={`font-mono text-[11px] ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
      title={title}
    >
      {`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
    </span>
  );
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
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
            item.active ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function DistributionCard({
  title,
  dist,
  metric,
  zh,
  ccy,
  labelOf,
  iconOf,
  emptyText,
}: {
  title: string;
  dist: UsageDistribution;
  metric: UsageMetric;
  zh: boolean;
  ccy: UsageDisplayCurrency;
  labelOf: (row: UsageDistributionRow) => string;
  iconOf?: (row: UsageDistributionRow) => ReactNode;
  emptyText?: string;
}) {
  const byCost = metric === "cost";
  const denom = byCost ? dist.totalCostMicros : dist.totalTokens;
  return (
    <section className="border border-line bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">{title}</h3>
        <span className="font-mono text-[10px] text-grey">
          {byCost ? (zh ? "按估费" : "by cost") : zh ? "按 Token" : "by tokens"}
        </span>
      </div>
      {dist.rows.length === 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-grey">
          {emptyText ?? (zh ? "该范围内暂无数据" : "No data in this range")}
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {dist.rows.map((row) => {
            const basis = byCost ? row.costMicros : row.tokens;
            const pct = denom > 0 ? (basis / denom) * 100 : 0;
            const label = labelOf(row);
            return (
              <li key={row.key === "" ? "__empty__" : row.key} className="-mx-2 px-2 py-2 hover:bg-card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-paper">
                    {iconOf?.(row)}
                    <span className="truncate" title={label}>
                      {label}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-grey">
                    {compact(row.tokens)} · {Math.round(pct)}% ·{" "}
                    {row.hasUnpriced && row.costMicros === 0 ? (
                      <span className="text-grey">{zh ? "未定价" : "unpriced"}</span>
                    ) : (
                      fmtCost(row.costMicros, ccy)
                    )}
                  </span>
                </div>
                <div className="mt-1 h-1.5 bg-bg">
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

interface KpiCardSpec {
  icon: typeof Activity;
  label: string;
  value: string;
  note?: string;
  cur?: number;
  prev?: number;
  sessionNote?: boolean;
  help?: "pricing" | "tokens" | "duration";
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
          <BarChart3 size={17} aria-hidden="true" /> {zh ? "用量" : "Usage"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-grey">
          {zh
            ? "以 Kimi 为第一公民的多工具 AI 编程用量中心。数据默认私有，只上传统计字段。"
            : "A Kimi-first usage center for AI coding tools. Data stays private and only metrics are uploaded."}
        </p>
        <div className="mt-8">
          <p className="text-sm text-grey">{zh ? "登录后连接设备：" : "Sign in to connect a device:"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/auth/github?next=%2Fusage" className="inline-flex min-h-11 items-center border border-blue px-4 font-mono text-xs font-semibold text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">GitHub</a>
            <a href="/api/auth/google?next=%2Fusage" className="inline-flex min-h-11 items-center border border-line px-4 font-mono text-xs text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">Google</a>
          </div>
        </div>
      </div>
    );
  }

  const settings = await getUsageSettings(user.id);
  const cookieStore = await cookies();
  const parsedTz = Number(cookieStore.get("kb_tz")?.value);
  const tz = Number.isFinite(parsedTz) ? parsedTz : 0;
  const ccy: UsageDisplayCurrency =
    cookieStore.get("kb_usage_ccy")?.value === "cny" ? "cny" : "usd";
  const raw = await searchParams;
  const filters = parseUsageFilters(raw, {
    uploadProject: settings.uploadProject,
    tzOffsetMinutes: tz,
  });

  const [overviewLoad, deviceLoad] = await Promise.all([
    captureUsageOperation("usage.dashboard.overview", () => getUsageOverview(user.id, filters), {
      slowMs: 1_500,
      metadata: { rangeDays: filters.days, pageSize: filters.pageSize },
      summarize: (value) => ({
        recordGroups: value.records.total,
        activeDevices: value.activeDevices,
        databaseQueries: value.meta.diagnostics.statements,
        rowsFetched: value.meta.diagnostics.rowsFetched,
      }),
    }),
    captureUsageOperation("usage.dashboard.devices", () => listUsageDevices(user.id), {
      slowMs: 750,
      summarize: (value) => ({ devices: value.length }),
    }),
  ]);
  const overview = overviewLoad.ok ? overviewLoad.value : null;
  const devices = deviceLoad.ok ? deviceLoad.value : null;
  const overviewErrorReference = overviewLoad.ok ? undefined : overviewLoad.reference;
  const deviceErrorReference = deviceLoad.ok ? undefined : deviceLoad.reference;

  const query = rawQueryString(raw);
  const deviceLastSyncAt = devices?.reduce<Date | null>((latest, device) => {
    if (!device.lastSeenAt) return latest;
    const value = new Date(device.lastSeenAt);
    return !latest || value > latest ? value : latest;
  }, null) ?? null;
  const lastSyncAt = overview?.lastSyncAt ?? deviceLastSyncAt;
  const hasUsageHistory = Boolean(overview?.lastSyncAt);
  const staleSync = lastSyncAt !== null && hoursSince(lastSyncAt) > USAGE_STALE_AFTER_HOURS;

  const filterSearch = usageFiltersToSearch(filters);
  const exportSuffix = `tz=${filters.tzOffsetMinutes}${filterSearch ? `&${filterSearch.slice(1)}` : ""}`;
  const clearFiltersHref = hrefWith(query, {
    sources: null,
    models: null,
    efforts: null,
    agentVersions: null,
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
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-grey" role="status" aria-live="polite">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-blue" aria-hidden="true" />
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
              {zh ? `超过 ${USAGE_STALE_AFTER_HOURS} 小时未同步` : `Not synced for ${USAGE_STALE_AFTER_HOURS}+ hours`}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link
          href="/usage/device"
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-blue bg-blue px-4 font-mono text-xs font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <Link2 size={14} aria-hidden="true" /> {zh ? "连接设备" : "Connect device"}
        </Link>
        {overview && hasUsageHistory && (
          <UsageExportDialog
            csvHref={`/api/usage/export?format=csv&${exportSuffix}`}
            jsonHref={`/api/usage/export?format=json&${exportSuffix}`}
            filteredRecordCount={overview.records.total}
            rangeLabel={overview.range.label}
            zh={zh}
          />
        )}
        {overview && hasUsageHistory && (
          <UsageMethodologyDialog
            zh={zh}
            pricingMatches={overview.meta.pricingMatches}
            pricingCoverage={`${(overview.meta.pricingCoverage * 100).toFixed(1)}%`}
            pricingVersions={overview.meta.pricingVersions.join("、")}
            assumedTokens={overview.meta.assumedTokens}
            currentRange={overview.range}
            tzLabel={gmtLabel(overview.meta.tzOffsetMinutes)}
            tzOffsetMinutes={overview.meta.tzOffsetMinutes}
          />
        )}
        {hasUsageHistory && (
          <CurrencyToggle currency={ccy} label={zh ? "展示币种" : "Display currency"} />
        )}
      </div>
    </header>
  );

  if (!overview) {
    return (
      <div className="usage-dashboard">
        {header}
        <div className="mt-6">
          <UsageLoadErrorCard reference={overviewErrorReference ?? "usage_unknown"} zh={zh} />
        </div>
        <UsageManagementPanels
          devices={devices}
          deviceErrorReference={deviceErrorReference}
          settings={settings}
          locale={locale}
        />
        <TzReporter />
      </div>
    );
  }

  const { totals, previous } = overview;
  const viewState = usageDashboardViewState({
    lastSyncAt: overview.lastSyncAt,
    totalTokens: totals.totalTokens,
    requests: totals.requests,
    sessions: totals.sessions,
  });

  if (viewState === "first-run") {
    return (
      <div className="usage-dashboard">
        {header}
        <UsageFirstRun
          hasAuthorizedDevice={(devices?.length ?? 0) > 0}
          currentRange={overview.range}
          tzLabel={gmtLabel(overview.meta.tzOffsetMinutes)}
          tzOffsetMinutes={overview.meta.tzOffsetMinutes}
          zh={zh}
        />
        <UsageManagementPanels
          devices={devices}
          deviceErrorReference={deviceErrorReference}
          settings={settings}
          locale={locale}
        />
        <TzReporter />
      </div>
    );
  }

  const trend = fillTrend(
    overview.trend,
    overview.range.from,
    overview.range.to,
    filters.granularity,
    overview.meta.tzOffsetMinutes,
  );
  const weeklyTrend = fillTrend(
    overview.weekly.trend,
    overview.weekly.from,
    overview.weekly.to,
    "week",
    overview.meta.tzOffsetMinutes,
  );
  const peak = trend.filter((item) => item.totalTokens > 0).reduce<UsageTrendDay | null>(
    (best, item) => (!best || item.totalTokens > best.totalTokens ? item : best),
    null,
  );
  const dimensionFiltersActive = !!(
    filters.sources ||
    filters.models ||
    filters.efforts ||
    filters.agentVersions ||
    filters.projects ||
    filters.devices
  );
  const bucketOnlyFiltersActive = filters.models !== null || filters.efforts !== null;

  const rawHm = Array.isArray(raw.hm) ? raw.hm[0] : raw.hm;
  const heatMetric: UsageHeatMetric =
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
      { key: "tokens" as UsageHeatMetric, label: "Token" },
      { key: "cost" as UsageHeatMetric, label: zh ? "费用" : "Cost" },
      { key: "duration" as UsageHeatMetric, label: zh ? "时长" : "Time" },
      { key: "prompts" as UsageHeatMetric, label: zh ? "用户消息" : "User messages" },
    ] as const
  ).map((item) => ({
    key: item.key,
    label: item.label,
    /* hm 缺省时回落到页面 metric;与页面 metric 相同的项直接清掉 hm。 */
    href: hrefWith(query, { hm: item.key === filters.metric ? null : item.key }),
    active: heatMetric === item.key,
  }));

  const trendTitle =
    filters.granularity === "hour"
      ? zh
        ? "每小时趋势"
        : "HOURLY TREND"
      : filters.granularity === "week"
        ? zh
          ? "每周趋势"
          : "WEEKLY TREND"
        : zh
          ? "每日趋势"
          : "DAILY TREND";

  const pricingVersions = overview.meta.pricingVersions.join("、");
  const unpricedCount = overview.meta.unpricedModels.length;
  const partialCount = overview.meta.partialModels.length;
  const pricingCoverage = `${(overview.meta.pricingCoverage * 100).toFixed(1)}%`;
  const pricingIncomplete = overview.meta.pricingCoverage < 0.9995;
  const inputWithCacheWrite = totals.inputTokens + totals.cacheWriteInputTokens;
  const prevInputWithCacheWrite = previous.inputTokens + previous.cacheWriteInputTokens;
  const methodologyProps = {
    zh,
    currentRange: overview.range,
    tzLabel: gmtLabel(overview.meta.tzOffsetMinutes),
    tzOffsetMinutes: overview.meta.tzOffsetMinutes,
  };
  const pricingMethodologyProps = {
    pricingMatches: overview.meta.pricingMatches,
    pricingCoverage,
    pricingVersions,
    assumedTokens: overview.meta.assumedTokens,
  };
  const peakNote = peak
    ? `${peak.day} · ${
        filters.granularity === "hour"
          ? zh
            ? "小时峰值"
            : "hour peak"
          : filters.granularity === "week"
            ? zh
              ? "自然周峰值"
              : "natural-week peak"
            : zh
              ? "单日峰值"
              : "daily peak"
      }`
    : zh
      ? "当前范围无数据"
      : "No data in range";

  const kpiRow1: KpiCardSpec[] = [
    {
      icon: Activity,
      label: pricingIncomplete
        ? zh
          ? "已定价部分"
          : "PRICED PORTION"
        : zh
          ? "预估费用"
          : "EST. COST",
      value: fmtCost(totals.costMicros, ccy),
      note: zh
        ? `覆盖 ${pricingCoverage} Token · ${unpricedCount} 未定价 / ${partialCount} 部分定价${overview.meta.assumedTokens > 0 ? ` · ${compact(overview.meta.assumedTokens)} 使用估算假设` : ""}`
        : `${pricingCoverage} token coverage · ${unpricedCount} unpriced / ${partialCount} partial${overview.meta.assumedTokens > 0 ? ` · ${compact(overview.meta.assumedTokens)} assumed` : ""}`,
      cur: totals.costMicros,
      prev: previous.costMicros,
      help: "pricing",
    },
    {
      icon: BarChart3,
      label: zh ? "总 TOKEN" : "TOTAL TOKENS",
      value: compact(totals.totalTokens),
      cur: totals.totalTokens,
      prev: previous.totalTokens,
      help: "tokens",
    },
    {
      icon: Orbit,
      label: zh ? "累计 TOKEN" : "LIFETIME TOKENS",
      value: compact(overview.lifetimeTokens),
      note: zh ? "全部已同步历史 · 保留维度筛选" : "all synced history · dimension filters apply",
    },
    {
      icon: ArrowDownToLine,
      label: zh ? "输入 TOKEN" : "INPUT TOKENS",
      value: compact(inputWithCacheWrite),
      note: zh ? "含缓存写" : "incl. cache write",
      cur: inputWithCacheWrite,
      prev: prevInputWithCacheWrite,
    },
    {
      icon: ArrowUpFromLine,
      label: zh ? "输出 TOKEN" : "OUTPUT TOKENS",
      value: compact(totals.outputTokens),
      cur: totals.outputTokens,
      prev: previous.outputTokens,
    },
    {
      icon: Database,
      label: zh ? "缓存 TOKEN" : "CACHE TOKENS",
      value: compact(totals.cacheReadInputTokens),
      note: zh ? "缓存读" : "cache read",
      cur: totals.cacheReadInputTokens,
      prev: previous.cacheReadInputTokens,
    },
  ];
  const kpiRow2: KpiCardSpec[] = [
    {
      icon: Gauge,
      label: zh ? "峰值 TOKEN" : "PEAK TOKENS",
      value: compact(peak?.totalTokens ?? 0),
      note: peakNote,
    },
    {
      icon: Clock3,
      label: zh ? "活跃时长" : "ACTIVE TIME",
      value: duration(totals.activeSeconds, zh),
      cur: totals.activeSeconds,
      prev: previous.activeSeconds,
      sessionNote: true,
      help: "duration",
    },
    {
      icon: Timer,
      label: zh ? "投入时长" : "ENGAGED TIME",
      value: duration(totals.durationSeconds, zh),
      note: zh ? "单次空闲间隔最多计 30 分钟" : "idle gaps capped at 30m",
      cur: totals.durationSeconds,
      prev: previous.durationSeconds,
      sessionNote: true,
      help: "duration",
    },
    {
      icon: MessagesSquare,
      label: zh ? "会话数" : "SESSIONS",
      value: compact(totals.sessions),
      note: `${totals.activeDevices} ${zh ? "台活跃设备" : "active devices"}`,
      cur: totals.sessions,
      prev: previous.sessions,
      sessionNote: true,
    },
    {
      icon: MessageSquare,
      label: zh ? "总消息数" : "MESSAGES",
      value: compact(totals.messages),
      cur: totals.messages,
      prev: previous.messages,
      sessionNote: true,
    },
    {
      icon: User,
      label: zh ? "用户消息数" : "USER MSGS",
      value: compact(totals.userMessages),
      cur: totals.userMessages,
      prev: previous.userMessages,
      sessionNote: true,
    },
  ];

  const renderKpiRow = (cards: KpiCardSpec[]) => (
    <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ icon: Icon, label, value, note, cur, prev, sessionNote, help }) => (
        <article key={label} className="border border-line bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-grey">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-[11px] tracking-[0.14em]">{label}</span>
              {help && (
                <UsageMethodologyDialog
                  kind={help}
                  compact
                  {...methodologyProps}
                  {...(help === "pricing" ? pricingMethodologyProps : {})}
                />
              )}
            </span>
            <Icon size={14} className="shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-4 font-mono text-xl font-semibold text-paper">{value}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-grey">
            {note && <span>{note}</span>}
            {cur !== undefined && prev !== undefined && deltaNote(cur, prev, zh)}
          </div>
          {bucketOnlyFiltersActive && sessionNote && (
            <div className="mt-1 text-[10px] text-grey/80">
              {zh
                ? "会话指标不按模型或推理强度拆分"
                : "Session metrics are not split by model or effort"}
            </div>
          )}
        </article>
      ))}
    </section>
  );

  const avgActiveMs =
    totals.requests > 0 ? (totals.activeSeconds / totals.requests) * 1000 : null;
  const avgActiveLabel =
    avgActiveMs === null
      ? "—"
      : avgActiveMs >= 1000
        ? `${(avgActiveMs / 1000).toFixed(1)}s`
        : `${Math.round(avgActiveMs)}ms`;
  const stripStats: { label: string; value: string; title?: string }[] = [
    { label: zh ? "缓存写" : "CACHE WRITE", value: compact(totals.cacheWriteInputTokens) },
    { label: zh ? "推理" : "REASONING", value: compact(totals.reasoningOutputTokens) },
    { label: zh ? "请求数" : "REQUESTS", value: compact(totals.requests) },
    {
      label: zh ? "平均耗时" : "AVG ACTIVE",
      value: avgActiveLabel,
      title: zh ? "≈ 活跃时长 ÷ 请求数" : "≈ active time ÷ requests",
    },
    {
      label: zh ? "缓存命中率" : "CACHE HIT",
      value: fmtHitRate(usageCacheHitRate(totals)),
      title: zh ? "缓存读 ÷(输入+缓存写+缓存读)" : "cache read ÷ (input + cache write + cache read)",
    },
  ];

  const localDayOf = (date: Date): string =>
    new Date(date.getTime() + filters.tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
  const usageFilterBar = (
    <UsageFilterBar
      options={overview.options}
      applied={{
        range: filters.rangeLabel,
        sources: filters.sources?.join(","),
        models: filters.models?.join(","),
        efforts: filters.efforts?.join(","),
        agentVersions: filters.agentVersions?.join(","),
        projects: filters.projects?.join(","),
        devices: filters.devices?.join(","),
        customFrom: filters.rangeLabel === "custom" ? localDayOf(filters.from) : undefined,
        customTo:
          filters.rangeLabel === "custom"
            ? localDayOf(new Date(filters.to.getTime() - 1))
            : undefined,
      }}
      projectsEnabled={filters.projectsEnabled}
      zh={zh}
      preservedQuery={query}
    />
  );
  const staleNotice = staleSync ? (
    <aside className="mt-4 flex flex-col gap-3 border border-amber-400/35 bg-amber-400/5 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
      <div className="flex items-start gap-2">
        <Clock3 size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-paper">
            {zh ? "这份看板可能已经过期" : "This dashboard may be out of date"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-grey">
            {zh
              ? `最近一次同步已超过 ${USAGE_STALE_AFTER_HOURS} 小时；站点不会主动读取本地日志。`
              : `The last sync was over ${USAGE_STALE_AFTER_HOURS} hours ago; the site never reads local logs on its own.`}
          </p>
        </div>
      </div>
      <code className="shrink-0 border border-line bg-bg px-3 py-2 font-mono text-[11px] text-paper">
        npx @kimi-builders/usage sync
      </code>
    </aside>
  ) : null;

  if (viewState === "empty-range") {
    return (
      <div className="usage-dashboard">
        {header}
        {usageFilterBar}
        {staleNotice}
        <UsageRangeEmpty
          clearHref={clearFiltersHref}
          range30Href={hrefWith(query, { range: "30d", from: null, to: null, days: null, page: null })}
          range90Href={hrefWith(query, { range: "90d", from: null, to: null, days: null, page: null })}
          filtersActive={dimensionFiltersActive}
          zh={zh}
        />
        <UsageManagementPanels
          devices={devices}
          deviceErrorReference={deviceErrorReference}
          settings={settings}
          locale={locale}
        />
        <TzReporter />
      </div>
    );
  }

  const otherLabel = zh ? "其他" : "Other";
  const notUploadedLabel = zh ? "未上传" : "Not uploaded";
  const rawCols = Array.isArray(raw.cols) ? raw.cols[0] : raw.cols;
  const initialEnabledColumns = (rawCols ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    <div className="usage-dashboard">
      {header}
      {usageFilterBar}
      {staleNotice}

      {renderKpiRow(kpiRow1)}
      {renderKpiRow(kpiRow2)}

      <section className="mt-3 border border-line bg-card p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {stripStats.map((stat) => (
            <div key={stat.label} title={stat.title}>
              <div className="font-mono text-[10px] tracking-[0.14em] text-grey">{stat.label}</div>
              <div className="mt-1.5 font-mono text-sm font-semibold text-paper">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {trendTitle}
            </h2>
            <p className="mt-1 text-[11px] text-grey">
              {zh
                ? `${gmtLabel(filters.tzOffsetMinutes)} · 30 分钟事实桶聚合`
                : `${gmtLabel(filters.tzOffsetMinutes)} · 30-minute buckets`}
            </p>
          </div>
          <SwitchLinks items={trendSwitch} label={zh ? "趋势指标" : "Trend metric"} />
        </div>
        <div className="mt-6">
          <UsageTrendChart
            trend={trend}
            metric={filters.metric}
            granularity={filters.granularity}
            rangeLabel={filters.rangeLabel}
            zh={zh}
            currency={USAGE_DISPLAY_CURRENCIES[ccy]}
          />
        </div>
      </section>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {zh ? "自然周趋势" : "NATURAL-WEEK TREND"}
            </h2>
            <p className="mt-1 text-[11px] text-grey">
              {zh
                ? `截至所选范围末尾的 12 周 · 周一 00:00 → 下周一 00:00 · ${gmtLabel(filters.tzOffsetMinutes)}`
                : `12 weeks ending at the selected range · Monday 00:00 → next Monday 00:00 · ${gmtLabel(filters.tzOffsetMinutes)}`}
            </p>
          </div>
          <UsageMethodologyDialog kind="changes" compact {...methodologyProps} />
        </div>
        <div className="mt-5">
          <UsageWeeklyTrend trend={weeklyTrend} zh={zh} />
        </div>
      </section>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">
              {zh ? "分时活跃" : "ACTIVITY HEATMAP"}
            </h2>
            <p className="mt-1 text-[11px] text-grey">
              {zh
                ? "星期 × 本地小时 · 新版 Collector 精确到小时"
                : "Weekday × local hour · exact hourly facts from current collectors"}
            </p>
          </div>
          <SwitchLinks items={heatSwitch} label={zh ? "热图指标" : "Heatmap metric"} />
        </div>
        <div className="mt-5">
          <UsageHeatmapGrid
            heatmap={overview.heatmap}
            metric={heatMetric}
            tzLabel={gmtLabel(filters.tzOffsetMinutes)}
            zh={zh}
            currency={USAGE_DISPLAY_CURRENCIES[ccy]}
          />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DistributionCard
          title={zh ? "工具" : "TOOLS"}
          dist={overview.distributions.source}
          metric={filters.metric}
          zh={zh}
          ccy={ccy}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : usageSourceLabel(row.key))}
          iconOf={(row) =>
            row.key === "__other__" ? null : <AgentIcon id={row.key} size={12} />
          }
        />
        <DistributionCard
          title={zh ? "模型" : "MODELS"}
          dist={overview.distributions.model}
          metric={filters.metric}
          zh={zh}
          ccy={ccy}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : row.label)}
        />
        <DistributionCard
          title={zh ? "项目" : "PROJECTS"}
          dist={overview.distributions.project}
          metric={filters.metric}
          zh={zh}
          ccy={ccy}
          labelOf={(row) =>
            row.key === "__other__" ? otherLabel : row.key === "" ? notUploadedLabel : row.key
          }
          emptyText={
            filters.projectsEnabled
              ? undefined
              : zh
                ? "项目名未上传 — 在隐私设置中开启后按项目拆分"
                : "Project names are not uploaded — enable them in privacy settings to split by project"
          }
        />
        <DistributionCard
          title={zh ? "设备" : "DEVICES"}
          dist={overview.distributions.device}
          metric={filters.metric}
          zh={zh}
          ccy={ccy}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : row.label)}
        />
      </div>

      <UsageRecordsSection
        key={`${filters.grain}:${overview.records.page}:${rawCols ?? ""}`}
        records={overview.records}
        grain={filters.grain}
        initialEnabledColumns={initialEnabledColumns}
        preservedQuery={query}
        tzOffsetMinutes={filters.tzOffsetMinutes}
        currency={USAGE_DISPLAY_CURRENCIES[ccy]}
        zh={zh}
      />

      <UsageManagementPanels
        devices={devices}
        deviceErrorReference={deviceErrorReference}
        settings={settings}
        locale={locale}
      />

      <div className="mt-5 space-y-2 text-[11px] leading-relaxed text-grey/80">
        <p>
          {zh
            ? "可信度说明：数据来自用户设备的自报日志，可能不完整或被修改；它用于个人洞察，不是可验证的计量凭证。"
            : "Trust note: data is self-reported from user devices and may be incomplete or modified. It is for personal insight, not verified metering."}
        </p>
        <p>
          {zh
            ? `估费为服务端价格表的 API 等价估算(版本 ${pricingVersions || "—"}),覆盖 ${pricingCoverage} Token,不代表订阅账单;未定价部分照常统计但不计费。`
            : `Costs are API-equivalent estimates from the server pricing table (version ${pricingVersions || "—"}), covering ${pricingCoverage} of tokens, not subscription bills. Unpriced usage is counted but excluded from cost.`}
        </p>
        {ccy === "cny" && (
          <p>
            {zh
              ? `人民币金额按固定汇率 ${USAGE_DISPLAY_CURRENCIES.cny.rate}(${USAGE_FX_AS_OF})折算,仅用于展示。`
              : `CNY amounts are converted at a fixed rate of ${USAGE_DISPLAY_CURRENCIES.cny.rate} (${USAGE_FX_AS_OF}); display only.`}
          </p>
        )}
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
