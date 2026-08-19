import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { BarChart3, Clock3, Link2, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import { ChartHeader, InsightHeader, MetricCard } from "@/components/data-display";
import UsageInsightPanel from "@/components/UsageInsightPanel";
import UsageAttributionSummary from "@/components/UsageAttributionSummary";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber, relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { usageCacheHitRate } from "@/src/lib/usage-contract";
import { listUsageDevices } from "@/src/lib/usage/device";
import {
  parseUsageFilters,
  usageFiltersToSearch,
  type UsageGranularity,
  type UsageMetric,
} from "@/src/lib/usage/filters";
import {
  heatMetricText,
  heatTopSlots,
  USAGE_WEEKDAYS_EN,
  USAGE_WEEKDAYS_ZH,
  type UsageHeatMetric,
} from "@/src/lib/usage/heatmap";
import {
  parseWeekKey,
  weekKeyFor,
  weekLabel,
  weekWindowFor,
} from "@/src/lib/usage/week";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import { buildUsageInsights } from "@/src/lib/usage/insights";
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
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { UsageFirstRun, UsageRangeEmpty } from "./_components/UsageEmptyStates";
import UsageFilterBar from "./_components/UsageFilterBar";
import UsageExportDialog from "./_components/UsageExportDialog";
import UsageLoadErrorCard from "./_components/UsageLoadErrorCard";
import UsageManagementPanels from "./_components/UsageManagementPanels";
import UsageMethodologyDialog from "./_components/UsageMethodologyDialog";
import UsagePrivacyDialog from "./_components/UsagePrivacyDialog";
import UsageRecordsSection from "./_components/UsageRecordsSection";
import UsageShareDialog from "./_components/UsageShareDialog";
import UsageSyncDialog from "./_components/UsageSyncDialog";
import {
  UsageHeatmapGrid,
  UsageTrendChart,
  UsageWeeklyTrend,
} from "./_components/UsageVisualizations";

export const metadata: Metadata = { title: "用量 — kimi.builders" };

function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
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
      className={`font-mono text-[11px] ${pct >= 0 ? "text-viz-positive-text" : "text-viz-negative-text"}`}
      title={title}
    >
      {`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
    </span>
  );
}

/* Hero 卡右上角的环比 pill(中性色,TrendingUp/Down 表方向);上一周期为零不显示。 */
function DeltaPill({ cur, prev, zh }: { cur: number; prev: number; zh: boolean }) {
  if (prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-paper/[0.07] px-2 py-0.5 font-mono text-[11px] font-semibold text-paper/80"
      title={zh ? "环比上一等长周期" : "vs the previous equal-length period"}
    >
      <Icon size={11} aria-hidden="true" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* 命中率状态 pill:>=85% 良好(mint)/ 60–85% 一般(amber)/ <60% 偏低(red)。 */
function HitRatePill({ rate, zh }: { rate: number; zh: boolean }) {
  const tone =
    rate >= 0.85
      ? { text: zh ? "● 良好" : "● Good", cls: "bg-viz-green-soft/10 text-paper" }
      : rate >= 0.6
        ? { text: zh ? "● 一般" : "● Fair", cls: "bg-viz-yellow-soft/10 text-paper" }
        : { text: zh ? "● 偏低" : "● Low", cls: "bg-viz-red-soft/10 text-paper" };
  return (
    <span className={`absolute right-4 top-4 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${tone.cls}`}>
      {tone.text}
    </span>
  );
}

/* 分段切换(趋势/热图指标):样式常量在 seg-classes.ts,与筛选栏时间分段、
   明细粒度、币种切换共用同一套容器+激活态。 */
function SegLinks({
  items,
  label,
}: {
  items: { key: string; label: string; href: string; active: boolean }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className={SEG_WRAP}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={`${SEG_ITEM} ${item.active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function HeroCard({
  label,
  help,
  value,
  valueClass,
  pill,
  caption,
}: {
  label: string;
  help?: ReactNode;
  value: string;
  valueClass?: string;
  pill?: ReactNode;
  caption: ReactNode;
}) {
  return (
    <MetricCard
      className="usage-hero rounded-2xl bg-transparent p-5"
      label={label}
      labelAccessory={help}
      value={value}
      valueClassName={`!text-[28px] tracking-[-0.5px] ${valueClass ?? "text-paper"}`}
      status={pill}
      description={caption}
    />
  );
}

/* 指标带格子:2/3/5 列响应式,行间发丝线 + 桌面列间分隔线。 */
const STRIP_CELL =
  "border-line px-4 py-3 [&:nth-child(n+3)]:border-t sm:[&:nth-child(-n+3)]:border-t-0 sm:[&:nth-child(n+4)]:border-t lg:[&:nth-child(-n+5)]:border-t-0 lg:[&:not(:nth-child(5n+1))]:border-l";

interface StripCellSpec {
  label: string;
  value: string;
  note?: string;
  title?: string;
  cur?: number;
  prev?: number;
  help?: "duration";
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
    <section className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-paper">{title}</h3>
        <span className="font-mono text-[11px] text-grey/80">
          {byCost ? (zh ? "按估费" : "by cost") : zh ? "按 Token" : "by tokens"}
        </span>
      </div>
      {dist.rows.length === 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-grey">
          {emptyText ?? (zh ? "该范围内暂无数据" : "No data in this range")}
        </p>
      ) : (
        <ul className="mt-2">
          {dist.rows.map((row, index) => {
            const basis = byCost ? row.costMicros : row.tokens;
            const pct = denom > 0 ? (basis / denom) * 100 : 0;
            const label = labelOf(row);
            return (
              <li key={row.key === "" ? "__empty__" : row.key} className="py-2">
                <div className="flex items-center gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-paper">
                    {iconOf?.(row)}
                    <span className="truncate" title={label}>
                      {label}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold text-paper">
                    {compact(row.tokens, zh)} · {Math.round(pct)}%
                  </span>
                  <span className="w-[86px] shrink-0 text-right font-mono text-[11px] text-grey">
                    {row.hasUnpriced && row.costMicros === 0 ? (
                      zh ? "未定价" : "unpriced"
                    ) : (
                      fmtCost(row.costMicros, ccy)
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 bg-viz-grid">
                  <div
                    className={`h-full rounded-[2px] ${
                      index === 0 ? "bg-viz-blue-primary" : "bg-viz-neutral-muted"
                    }`}
                    style={{ width: `${Math.max(pct, 1.5)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestHeaders = await headers();
  trackEvent("usage_view", { kind: "page", id: "usage" }, { headers: requestHeaders });
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";

  if (!user) {
    /* 未登录:统一登录引导卡(20260919,直开/刷新的兜底;侧栏入口已直链弹窗) */
    return (
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[0.2px] text-paper">
          <BarChart3 size={20} aria-hidden="true" /> {zh ? "用量" : "Usage"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-grey">
          {zh
            ? "以 Kimi 为第一公民的多 Agent AI 编程用量中心。数据默认私有，只上传统计字段。"
            : "A Kimi-first usage center for AI coding agents. Data stays private and only metrics are uploaded."}
        </p>
        <div className="mt-8">
          <LoginGate locale={locale} title={t(locale, "gate.usage")} next="/usage" />
        </div>
      </div>
    );
  }

  const deviceLoadPromise = captureUsageOperation(
    "usage.dashboard.devices",
    () => listUsageDevices(user.id),
    {
      slowMs: 750,
      summarize: (value) => ({ devices: value.length }),
    },
  );
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
  /* 热图双模式:heatmode=week 时按 heatweek(用户时区的周一日期)另取单周网格,
     页面其余区块仍跟随主范围。 */
  const heatModeParam = Array.isArray(raw.heatmode) ? raw.heatmode[0] : raw.heatmode;
  const heatWeekParam = Array.isArray(raw.heatweek) ? raw.heatweek[0] : raw.heatweek;
  /* 以主范围终点为「本周」锚点(预设范围≈请求时刻;历史自定义范围翻到其末尾所在周)。 */
  const currentWeek = weekWindowFor(filters.to.getTime(), tz);
  const activeWeek = heatModeParam === "week"
    ? parseWeekKey(heatWeekParam, tz) ?? currentWeek
    : null;

  const [overviewLoad, deviceLoad] = await Promise.all([
    captureUsageOperation("usage.dashboard.overview", () => getUsageOverview(user.id, filters, { heatWeek: activeWeek }), {
      slowMs: 1_500,
      metadata: { rangeDays: filters.days, pageSize: filters.pageSize },
      summarize: (value) => ({
        recordGroups: value.records.total,
        activeDevices: value.activeDevices,
        databaseQueries: value.meta.diagnostics.statements,
        rowsFetched: value.meta.diagnostics.rowsFetched,
      }),
    }),
    deviceLoadPromise,
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
    <header className="flex flex-col gap-4 border-b border-line pb-6">
      {/* 标题行:标题左、操作按钮右;状态条不再挤在标题列里(与按钮抢宽,
          英文偏长时被逐项折成多行),而是独占下方整行,中英文都是稳定一行 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[0.2px] text-paper">
          <BarChart3 size={20} aria-hidden="true" /> {zh ? "用量中心" : "Usage center"}
          {/* 隐私边界说明收进弹窗(原页头常驻副标题,太占位);摘要仍在下方状态条「默认私有」 */}
          <UsagePrivacyDialog zh={zh} />
        </h1>
        <div className="grid w-full shrink-0 grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
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
            <UsageShareDialog zh={zh} tzOffsetMinutes={filters.tzOffsetMinutes} />
          )}
          {overview && hasUsageHistory && <UsageSyncDialog zh={zh} />}
          <Link
            href="/usage/device"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue bg-blue px-4 text-xs font-semibold text-white shadow-lg shadow-blue/25 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto"
          >
            <Link2 size={14} aria-hidden="true" /> {zh ? "连接设备" : "Connect device"}
          </Link>
        </div>
      </div>
      {/* 各段 nowrap:段内永不折断;整段只在手机窄屏换行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] text-grey" role="status" aria-live="polite">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <ShieldCheck size={13} className="text-status-ok-fg" aria-hidden="true" />
          {zh ? "默认私有" : "Private by default"}
        </span>
        <span aria-hidden="true" className="whitespace-nowrap">·</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <i className="usage-pulse-dot shrink-0" aria-hidden="true" />
          {lastSyncAt
            ? zh
              ? `最近同步 ${relTime(lastSyncAt, locale)}`
              : `Synced ${relTime(lastSyncAt, locale)}`
            : zh
              ? "尚未同步"
              : "Not synced yet"}
        </span>
        {staleSync && (
          <span className="whitespace-nowrap rounded-md border border-status-warn/40 px-1.5 py-0.5 text-status-warn-fg">
            {zh ? `超过 ${USAGE_STALE_AFTER_HOURS} 小时未同步` : `Not synced for ${USAGE_STALE_AFTER_HOURS}+ hours`}
          </span>
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
          hasAuthorizedDevice={devices?.some((device) => !device.revokedAt) ?? false}
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
        : "Hourly trend"
      : filters.granularity === "week"
        ? zh
          ? "每周趋势"
          : "Weekly trend"
        : zh
          ? "每日趋势"
          : "Daily trend";

  const pricingVersions = overview.meta.pricingVersions.join("、");
  const unpricedCount = overview.meta.unpricedModels.length;
  const partialCount = overview.meta.partialModels.length;
  const pricingCoverage = `${(overview.meta.pricingCoverage * 100).toFixed(1)}%`;
  const pricingIncomplete = overview.meta.pricingCoverage < 0.9995;
  const inputWithCacheWrite = totals.inputTokens + totals.cacheWriteInputTokens;
  const methodologyProps = {
    zh,
    currentRange: overview.range,
    tzLabel: gmtLabel(overview.meta.tzOffsetMinutes),
    tzOffsetMinutes: overview.meta.tzOffsetMinutes,
  };
  const hitRate = usageCacheHitRate(totals);
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

  const avgActiveMs =
    totals.requests > 0 ? (totals.activeSeconds / totals.requests) * 1000 : null;
  const avgActiveLabel =
    avgActiveMs === null
      ? "—"
      : avgActiveMs >= 1000
        ? `${(avgActiveMs / 1000).toFixed(1)}s`
        : `${Math.round(avgActiveMs)}ms`;

  const stripCells: StripCellSpec[] = [
    {
      label: zh ? "峰值 TOKEN" : "PEAK TOKENS",
      value: compact(peak?.totalTokens ?? 0, zh),
      note: peakNote,
    },
    {
      label: zh ? "活跃时长" : "ACTIVE TIME",
      value: duration(totals.activeSeconds, zh),
      cur: totals.activeSeconds,
      prev: previous.activeSeconds,
      help: "duration",
    },
    {
      label: zh ? "投入时长" : "ENGAGED TIME",
      value: duration(totals.durationSeconds, zh),
      note: zh ? "单次空闲间隔最多计 30 分钟" : "idle gaps capped at 30m",
      cur: totals.durationSeconds,
      prev: previous.durationSeconds,
    },
    {
      label: zh ? "会话数" : "SESSIONS",
      value: compact(totals.sessions, zh),
      note: `${totals.activeDevices} ${zh ? "台活跃设备" : "active devices"}`,
      cur: totals.sessions,
      prev: previous.sessions,
    },
    {
      label: zh ? "总消息数" : "MESSAGES",
      value: compact(totals.messages, zh),
      cur: totals.messages,
      prev: previous.messages,
    },
    {
      label: zh ? "用户消息" : "USER MSGS",
      value: compact(totals.userMessages, zh),
      cur: totals.userMessages,
      prev: previous.userMessages,
    },
    {
      label: zh ? "平均耗时" : "AVG ACTIVE",
      value: avgActiveLabel,
      title: zh ? "≈ 活跃时长 ÷ 请求数" : "≈ active time ÷ requests",
    },
    {
      label: zh ? "请求数" : "REQUESTS",
      value: compact(totals.requests, zh),
    },
    {
      label: zh ? "累计 TOKEN" : "LIFETIME TOKENS",
      value: compact(overview.lifetimeTokens, zh),
      note: zh ? "全部已同步历史 · 保留维度筛选" : "all synced history · dimension filters apply",
    },
    {
      label: zh ? "推理" : "REASONING",
      value: compact(totals.reasoningOutputTokens, zh),
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
      trailing={
        hasUsageHistory ? (
          <CurrencyToggle currency={ccy} label={zh ? "展示币种" : "Display currency"} />
        ) : undefined
      }
    />
  );
  const staleNotice = staleSync ? (
    <aside className="mt-4 flex flex-col gap-3 rounded-xl border border-status-warn/35 bg-status-warn/5 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
      <div className="flex items-start gap-2">
        <Clock3 size={16} className="mt-0.5 shrink-0 text-status-warn-fg" aria-hidden="true" />
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
      <code className="shrink-0 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11px] text-paper">
        npx @kimi.builders/usage@latest sync
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
  const currency = USAGE_DISPLAY_CURRENCIES[ccy];
  const heatModeItems = [
    {
      key: "aggregate",
      label: zh ? "聚合" : "Aggregate",
      href: hrefWith(query, { heatmode: null, heatweek: null }),
      active: activeWeek === null,
    },
    {
      key: "week",
      label: zh ? "单周" : "Week",
      href: hrefWith(query, { heatmode: "week", heatweek: weekKeyFor(currentWeek.fromUtcMs, tz) }),
      active: activeWeek !== null,
    },
  ];
  const firstWeekMs = overview.firstDataAt
    ? weekWindowFor(overview.firstDataAt.getTime(), tz).fromUtcMs
    : null;
  const canPrevWeek = activeWeek !== null && firstWeekMs !== null && activeWeek.fromUtcMs > firstWeekMs;
  const canNextWeek = activeWeek !== null && activeWeek.fromUtcMs < currentWeek.fromUtcMs;
  const weekPagerHref = (weeks: number) =>
    hrefWith(query, {
      heatmode: "week",
      heatweek: weekKeyFor((activeWeek ?? currentWeek).fromUtcMs + weeks * 7 * 86_400_000, tz),
    });
  const activeHeatmap = activeWeek !== null && overview.weekHeatmap ? overview.weekHeatmap : overview.heatmap;
  const topSlots = heatTopSlots(activeHeatmap, heatMetric, 5);
  const weekdayNames = zh ? USAGE_WEEKDAYS_ZH : USAGE_WEEKDAYS_EN;
  const pad2 = (value: number) => String(value).padStart(2, "0");

  return (
    <div className="usage-dashboard">
      {header}
      {usageFilterBar}
      {staleNotice}

      {/* Hero 三卡:费用 / 总 Token / 缓存命中率 */}
      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <HeroCard
          label={pricingIncomplete ? (zh ? "已定价部分" : "Priced portion") : zh ? "预估费用" : "Est. cost"}
          help={
            <UsageMethodologyDialog
              kind="pricing"
              compact
              {...methodologyProps}
              pricingMatches={overview.meta.pricingMatches}
              pricingCoverage={pricingCoverage}
              pricingVersions={pricingVersions}
              assumedTokens={overview.meta.assumedTokens}
            />
          }
          value={fmtCost(totals.costMicros, ccy)}
          pill={<DeltaPill cur={totals.costMicros} prev={previous.costMicros} zh={zh} />}
          caption={
            zh
              ? `vs 上一周期 · 覆盖 ${pricingCoverage} Token · ${unpricedCount} 未定价 / ${partialCount} 部分定价${overview.meta.assumedTokens > 0 ? ` · ${compact(overview.meta.assumedTokens, zh)} 使用估算假设` : ""}`
              : `vs previous period · ${pricingCoverage} token coverage · ${unpricedCount} unpriced / ${partialCount} partial${overview.meta.assumedTokens > 0 ? ` · ${compact(overview.meta.assumedTokens, zh)} assumed` : ""}`
          }
        />
        <HeroCard
          label={zh ? "总 Token" : "Total tokens"}
          help={<UsageMethodologyDialog kind="tokens" compact {...methodologyProps} />}
          value={compact(totals.totalTokens, zh)}
          pill={<DeltaPill cur={totals.totalTokens} prev={previous.totalTokens} zh={zh} />}
          caption={
            zh
              ? `输入 ${compact(inputWithCacheWrite, zh)} · 输出 ${compact(totals.outputTokens, zh)} · 缓存读 ${compact(totals.cacheReadInputTokens, zh)}`
              : `Input ${compact(inputWithCacheWrite, zh)} · output ${compact(totals.outputTokens, zh)} · cache read ${compact(totals.cacheReadInputTokens, zh)}`
          }
        />
        <HeroCard
          label={zh ? "缓存命中率" : "Cache hit rate"}
          value={fmtHitRate(hitRate)}
          pill={hitRate !== null ? <HitRatePill rate={hitRate} zh={zh} /> : undefined}
          caption={
            zh
              ? `缓存写 ${compact(totals.cacheWriteInputTokens, zh)} · 命中率越高，费用越低`
              : `Cache write ${compact(totals.cacheWriteInputTokens, zh)} · higher hit rate, lower cost`
          }
        />
      </section>

      {/* 指标带:10 格 */}
      <section className="mt-3 grid grid-cols-2 rounded-2xl border border-line bg-card sm:grid-cols-3 lg:grid-cols-5">
        {stripCells.map((cellItem) => (
          <div key={cellItem.label} title={cellItem.title} className={STRIP_CELL}>
            <div className="flex items-center gap-0.5 text-[11px] tracking-[0.08em] text-grey/80">
              <span className="truncate">{cellItem.label}</span>
              {cellItem.help === "duration" && (
                <UsageMethodologyDialog kind="duration" compact {...methodologyProps} />
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="whitespace-nowrap font-mono text-sm font-semibold text-paper">
                {cellItem.value}
              </span>
              {cellItem.cur !== undefined &&
                cellItem.prev !== undefined &&
                deltaNote(cellItem.cur, cellItem.prev, zh)}
            </div>
            {cellItem.note && (
              <div className="mt-0.5 truncate font-mono text-[10.5px] text-grey/70" title={cellItem.note}>
                {cellItem.note}
              </div>
            )}
          </div>
        ))}
      </section>
      {bucketOnlyFiltersActive && (
        <p className="mt-2 text-[11px] text-grey/80">
          {zh
            ? "会话指标不按模型或推理强度拆分"
            : "Session metrics are not split by model or effort"}
        </p>
      )}

      <UsageInsightPanel
        className="mt-4"
        insights={buildUsageInsights({
          trend,
          currentTokens: totals.totalTokens,
          previousTokens: previous.totalTokens,
          cacheHitRate: hitRate,
          attribution: overview.attribution,
          sourceLabel: usageSourceLabel,
          zh,
        })}
        zh={zh}
      />

      <UsageAttributionSummary
        attribution={overview.attribution}
        totals={totals}
        currency={currency}
        sourceLabel={usageSourceLabel}
        zh={zh}
      />

      {/* 趋势 */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <ChartHeader
          title={trendTitle}
          description={
            <>
              {zh
                ? `${gmtLabel(filters.tzOffsetMinutes)} · 30 分钟事实桶聚合`
                : `${gmtLabel(filters.tzOffsetMinutes)} · 30-minute buckets`}
            </>
          }
          source={zh ? "来源：设备同步事实桶" : "Source: device-synced fact buckets"}
          meta={[
            zh
              ? `生成于 ${new Date(overview.meta.generatedAt).toLocaleString("zh-CN")}`
              : `Generated ${new Date(overview.meta.generatedAt).toLocaleString("en-US")}`,
          ]}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {filters.metric === "tokens" && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 text-[11px] text-grey">
                  <i className="h-2 w-2 rounded-[2px] bg-viz-blue-primary" />
                  {zh ? "总 Token" : "Total tokens"}
                </span>
              </div>
            )}
            <span className="flex items-center gap-1.5 text-[11px] text-grey">
              <i className="h-0 w-3.5 border-t-2 border-dashed border-grey/70" />
              {zh ? "7 日均值" : "7-slot avg"}
            </span>
            <SegLinks items={trendSwitch} label={zh ? "趋势指标" : "Trend metric"} />
          </div>
          }
        />
        <div className="mt-4">
          <UsageTrendChart
            trend={trend}
            metric={filters.metric}
            granularity={filters.granularity}
            rangeLabel={filters.rangeLabel}
            zh={zh}
            currency={currency}
          />
        </div>
      </section>

      {/* 自然周趋势 */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-paper">
              {zh ? "自然周趋势" : "Natural-week trend"}
            </h2>
            <p className="mt-1 text-[11px] text-grey">
              {zh
                ? `截至所选范围末尾的 12 周 · 周一 00:00 → 下周一 00:00 · ${gmtLabel(filters.tzOffsetMinutes)}`
                : `12 weeks ending at the selected range · Monday 00:00 → next Monday 00:00 · ${gmtLabel(filters.tzOffsetMinutes)}`}
            </p>
          </div>
          <UsageMethodologyDialog kind="changes" compact {...methodologyProps} />
        </div>
        <div className="mt-4">
          <UsageWeeklyTrend trend={weeklyTrend} zh={zh} currency={currency} />
        </div>
      </section>

      {/* 用量热力图 + 最活跃时段 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.9fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold text-paper">
                {zh ? "用量热力图" : "Activity heatmap"}
              </h2>
              <p className="mt-1 text-[11px] text-grey">
                {activeWeek !== null
                  ? `${weekLabel(activeWeek.fromUtcMs, tz, zh)} · ${zh ? "单周实际用量" : "single-week actuals"}`
                  : zh
                    ? "聚合 · 星期 × 本地小时 · 窗口跟随所选范围"
                    : "Aggregate · weekday × local hour · follows the selected range"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegLinks items={heatModeItems} label={zh ? "热图模式" : "Heatmap mode"} />
              <SegLinks items={heatSwitch} label={zh ? "热图指标" : "Heatmap metric"} />
            </div>
          </div>
          {activeWeek !== null ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[11px]">
              {canPrevWeek ? (
                <Link href={weekPagerHref(-1)} scroll={false} className="inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-grey hover:border-blue hover:text-paper">
                  ← {zh ? "上一周" : "Previous week"}
                </Link>
              ) : (
                <span aria-disabled="true" className="inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-grey/40">← {zh ? "上一周" : "Previous week"}</span>
              )}
              <span className="text-paper">{weekLabel(activeWeek.fromUtcMs, tz, zh)}</span>
              {canNextWeek ? (
                <Link href={weekPagerHref(1)} scroll={false} className="inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-grey hover:border-blue hover:text-paper">
                  {zh ? "下一周" : "Next week"} →
                </Link>
              ) : (
                <span aria-disabled="true" className="inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-grey/40">{zh ? "下一周" : "Next week"} →</span>
              )}
              {activeWeek.fromUtcMs !== currentWeek.fromUtcMs ? (
                <Link href={hrefWith(query, { heatmode: "week", heatweek: weekKeyFor(currentWeek.fromUtcMs, tz) })} scroll={false} className="inline-flex min-h-8 items-center px-1.5 text-blue hover:underline">
                  {zh ? "回到本周" : "This week"}
                </Link>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4">
            <UsageHeatmapGrid
              heatmap={activeHeatmap}
              metric={heatMetric}
              tzLabel={gmtLabel(filters.tzOffsetMinutes)}
              zh={zh}
              currency={currency}
            />
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-[13px] font-semibold text-paper">
            {zh ? "最活跃时段" : "Busiest slots"}
          </h2>
          <p className="mt-1 text-[11px] text-grey">
            {activeWeek !== null
              ? `TOP 5 · ${weekLabel(activeWeek.fromUtcMs, tz, zh)} · ${zh ? "随热图指标联动" : "follows heatmap metric"}`
              : zh
                ? "TOP 5 · 聚合 · 随热图指标联动"
                : "TOP 5 · aggregate · follows heatmap metric"}
          </p>
          {topSlots.length === 0 ? (
            <p className="mt-4 text-xs text-grey">
              {zh ? "该范围内暂无数据" : "No data in this range"}
            </p>
          ) : (
            <ol className="mt-2">
              {topSlots.map((slot, index) => (
                <li key={`${slot.weekday}-${slot.hour}`} className="border-b border-line py-2.5 last:border-b-0">
                  <div className="flex items-baseline gap-3">
                    <span className="w-5 shrink-0 font-mono text-[11px] text-grey/70">{`0${index + 1}`}</span>
                    <span className="text-xs text-paper">
                      {weekdayNames[slot.weekday]} {pad2(slot.hour)}:00
                    </span>
                    <span
                      className={`ml-auto font-mono text-[13px] font-semibold ${index === 0 ? "text-blue" : "text-paper"}`}
                    >
                      {heatMetricText(heatMetric, slot.value, zh, currency)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-paper/[0.06]">
                    <div
                      className="h-full rounded-[2px] bg-viz-blue-primary"
                      style={{ width: `${Math.max((slot.value / topSlots[0].value) * 100, 2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* 分布 */}
      <p className="mt-6 font-mono text-[11px] tracking-[0.14em] text-grey/70">
        {filters.metric === "cost"
          ? zh
            ? "分布 · 按估费"
            : "BREAKDOWN · BY COST"
          : zh
            ? "分布 · 按 TOKEN"
            : "BREAKDOWN · BY TOKENS"}
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <DistributionCard
          title={zh ? "Agent" : "Agents"}
          dist={overview.distributions.source}
          metric={filters.metric}
          zh={zh}
          ccy={ccy}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : usageSourceLabel(row.key))}
          iconOf={(row) =>
            row.key === "__other__" ? null : <AgentIcon id={row.key} context="chart" />
          }
        />
        <DistributionCard
          title={zh ? "模型" : "Models"}
          dist={overview.distributions.model}
          metric={filters.metric}
          zh={zh}
          ccy={ccy}
          labelOf={(row) => (row.key === "__other__" ? otherLabel : row.label)}
        />
        <DistributionCard
          title={zh ? "项目" : "Projects"}
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
          title={zh ? "设备" : "Devices"}
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
        currency={currency}
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
          <Link
            href="/usage/leaderboard"
            className="text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "lb.entry")}
          </Link>
          {" — "}
          {t(locale, "lb.entryHint")}
        </p>
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
