"use client";

import { useRef, useState, type FocusEvent, type MouseEvent } from "react";
import type { UsageGranularity, UsageMetric, UsageRangeLabel } from "@/src/lib/usage/filters";
import type { UsageHeatmap, UsageTrendDay } from "@/src/lib/usage/query";

export type UsageHeatMetric = UsageMetric | "prompts";

interface CurrencySpec {
  rate: number;
  symbol: string;
}

const WEEKDAY_LONG_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_LONG_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_SHORT_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_SHORT_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

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

function fmtCost(micros: number, currency: CurrencySpec): string {
  const value = (micros / 1e6) * currency.rate;
  return `${currency.symbol}${value >= 0.01 ? value.toFixed(2) : value.toFixed(4)}`;
}

function hitRate(item: UsageTrendDay | HeatTokenCell): string {
  const inputSide = item.inputTokens + item.cacheWriteInputTokens + item.cacheReadInputTokens;
  return inputSide <= 0 ? "—" : `${((item.cacheReadInputTokens / inputSide) * 100).toFixed(1)}%`;
}

function metricValue(item: UsageTrendDay, metric: UsageMetric): number {
  if (metric === "cost") return item.costMicros;
  if (metric === "duration") return item.activeSeconds;
  return item.totalTokens;
}

function metricText(
  item: UsageTrendDay,
  metric: UsageMetric,
  zh: boolean,
  currency: CurrencySpec,
): string {
  if (metric === "cost") return fmtCost(item.costMicros, currency);
  if (metric === "duration") return duration(item.activeSeconds, zh);
  return `${compact(item.totalTokens)} tokens`;
}

function trendAxisLabel(
  key: string,
  granularity: UsageGranularity,
  rangeLabel: UsageRangeLabel,
): string {
  if (granularity === "hour") return rangeLabel === "today" ? key.slice(11) : key.slice(5);
  return key.slice(5);
}

function labelIndexes(length: number, target = 9): Set<number> {
  if (length <= 0) return new Set();
  const step = Math.max(1, Math.ceil((length - 1) / Math.max(1, target - 1)));
  const values = new Set<number>([0, length - 1]);
  for (let index = step; index < length - 1; index += step) {
    if (length - 1 - index >= Math.max(2, step)) values.add(index);
  }
  return values;
}

function TokenBreakdown({ item, zh }: { item: UsageTrendDay | HeatTokenCell; zh: boolean }) {
  const rows = [
    {
      label: zh ? "输入(含缓存写)" : "Input (incl. cache write)",
      value: item.inputTokens + item.cacheWriteInputTokens,
      color: "bg-blue",
    },
    { label: zh ? "缓存读" : "Cache read", value: item.cacheReadInputTokens, color: "bg-emerald-400/80" },
    { label: zh ? "输出" : "Output", value: item.outputTokens, color: "bg-paper/75" },
    { label: zh ? "推理" : "Reasoning", value: item.reasoningOutputTokens, color: "bg-amber-400" },
  ];
  return (
    <dl className="mt-2 space-y-1 font-mono text-[11px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-1.5 text-grey">
            <i className={`h-1.5 w-1.5 shrink-0 ${row.color}`} />
            {row.label}
          </dt>
          <dd className="text-paper">{compact(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TokenStack({ item, heightPx }: { item: UsageTrendDay; heightPx: number }) {
  const segments = [
    { value: item.inputTokens + item.cacheWriteInputTokens, color: "bg-blue" },
    { value: item.cacheReadInputTokens, color: "bg-emerald-400/80" },
    { value: item.outputTokens, color: "bg-paper/75" },
    { value: item.reasoningOutputTokens, color: "bg-amber-400" },
  ];
  const nonZero = segments.filter((segment) => segment.value > 0).length;
  const visibleHeight = item.totalTokens <= 0 ? 1 : Math.max(heightPx, nonZero * 2);
  return (
    <span
      className="flex w-full flex-col-reverse overflow-hidden bg-card transition-opacity group-hover:opacity-80 group-focus-visible:outline group-focus-visible:outline-1 group-focus-visible:outline-blue"
      style={{ height: `${visibleHeight}px` }}
    >
      {segments.map((segment, index) => (
        <i
          key={index}
          className={`block ${segment.color}`}
          style={{
            flexBasis: 0,
            flexGrow: segment.value,
            minHeight: segment.value > 0 ? "2px" : 0,
          }}
        />
      ))}
    </span>
  );
}

function tooltipLeft(
  event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
  viewport: HTMLDivElement | null,
): number {
  if (!viewport) return 8;
  const viewportRect = viewport.getBoundingClientRect();
  const targetRect = event.currentTarget.getBoundingClientRect();
  const center = targetRect.left + targetRect.width / 2 - viewportRect.left;
  const width = 244;
  return Math.max(8, Math.min(viewportRect.width - width - 8, center - width / 2));
}

export function UsageTrendChart({
  trend,
  metric,
  granularity,
  rangeLabel,
  zh,
  currency,
}: {
  trend: UsageTrendDay[];
  metric: UsageMetric;
  granularity: UsageGranularity;
  rangeLabel: UsageRangeLabel;
  zh: boolean;
  currency: CurrencySpec;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ index: number; left: number } | null>(null);
  const max = Math.max(0, ...trend.map((item) => metricValue(item, metric)));
  if (max <= 0) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-grey">
        {zh ? "该范围内暂无数据" : "No data in this range"}
      </div>
    );
  }

  const labels = labelIndexes(trend.length);
  const minWidth = Math.max(680, trend.length * (granularity === "hour" ? 34 : 28));
  const maxMarker =
    metric === "cost"
      ? fmtCost(max, currency)
      : metric === "duration"
        ? duration(max, zh)
        : compact(max);
  const active = hovered ? trend[hovered.index] : null;

  return (
    <div ref={viewportRef} className="relative" onMouseLeave={() => setHovered(null)}>
      <div className="overflow-x-auto pb-1">
        <div style={{ minWidth }}>
          <div className="relative">
            <span className="pointer-events-none absolute left-1 top-0 z-10 font-mono text-[10px] text-grey/80">
              {maxMarker}
            </span>
            <div className="flex h-52 items-end gap-1.5 border-b border-line px-1">
              {trend.map((item, index) => {
                const value = metricValue(item, metric);
                const heightPx = value === 0 ? 1 : Math.max(4, Math.round((value / max) * 192));
                const announce = `${item.day}: ${metricText(item, metric, zh, currency)}`;
                return (
                  <button
                    key={item.day}
                    type="button"
                    aria-label={announce}
                    className="group relative flex h-full min-w-1 flex-1 items-end focus:outline-none"
                    onMouseEnter={(event) =>
                      setHovered({ index, left: tooltipLeft(event, viewportRef.current) })
                    }
                    onFocus={(event) =>
                      setHovered({ index, left: tooltipLeft(event, viewportRef.current) })
                    }
                    onBlur={() => setHovered(null)}
                  >
                    {metric === "tokens" ? (
                      <TokenStack item={item} heightPx={heightPx} />
                    ) : (
                      <span
                        className={`block w-full transition-opacity group-hover:opacity-80 group-focus-visible:outline group-focus-visible:outline-1 group-focus-visible:outline-blue ${
                          value === 0 ? "bg-card" : metric === "cost" ? "bg-blue" : "bg-blue/70"
                        }`}
                        style={{ height: `${heightPx}px` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative mt-1.5 h-4 px-1">
            {trend.map((item, index) => {
              if (!labels.has(index)) return null;
              const pct = trend.length <= 1 ? 0 : (index / (trend.length - 1)) * 100;
              return (
                <span
                  key={item.day}
                  className={`absolute whitespace-nowrap font-mono text-[10px] text-grey ${
                    index === 0 ? "translate-x-0" : index === trend.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
                  }`}
                  style={{ left: `${pct}%` }}
                >
                  {trendAxisLabel(item.day, granularity, rangeLabel)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {active && hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-3 z-20 w-[244px] border border-line bg-moon p-3 shadow-2xl"
          style={{ left: hovered.left }}
        >
          <div className="font-mono text-[11px] font-semibold text-paper">{active.day}</div>
          <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <span className="text-paper">{metricText(active, metric, zh, currency)}</span>
            {metric === "tokens" && (
              <span className="text-grey">{zh ? "命中率" : "hit"} {hitRate(active)}</span>
            )}
          </div>
          {metric === "tokens" && <TokenBreakdown item={active} zh={zh} />}
        </div>
      )}

      {metric === "tokens" && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[11px] text-grey">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-blue" />{zh ? "输入(含缓存写)" : "Input (incl. cache write)"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-emerald-400/80" />{zh ? "缓存读" : "Cache read"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-paper/75" />{zh ? "输出" : "Output"}</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-amber-400" />{zh ? "推理" : "Reasoning"}</span>
        </div>
      )}
    </div>
  );
}

function weekEnd(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

function percentDelta(current: number, previous: number): string {
  if (previous <= 0) return "—";
  const value = ((current - previous) / previous) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function UsageWeeklyTrend({
  trend,
  zh,
}: {
  trend: UsageTrendDay[];
  zh: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(0, ...trend.map((item) => item.totalTokens));
  const current = trend.at(-1);
  const previous = trend.at(-2);
  const active = hovered === null ? null : trend[hovered];
  return (
    <div onMouseLeave={() => setHovered(null)}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-grey">
        <span>{zh ? "本周" : "This week"} <strong className="text-paper">{compact(current?.totalTokens ?? 0)}</strong></span>
        <span>{zh ? "上周" : "Last week"} <strong className="text-paper">{compact(previous?.totalTokens ?? 0)}</strong></span>
        <span className={(current?.totalTokens ?? 0) >= (previous?.totalTokens ?? 0) ? "text-emerald-400" : "text-red-400"}>
          {percentDelta(current?.totalTokens ?? 0, previous?.totalTokens ?? 0)}
        </span>
      </div>
      <div className="relative">
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[680px]">
            <div className="relative">
              <span className="pointer-events-none absolute left-1 top-0 font-mono text-[10px] text-grey/80">
                {compact(max)}
              </span>
              <div className="flex h-40 items-end gap-2 border-b border-line px-1">
                {trend.map((item, index) => {
                  const heightPx = item.totalTokens <= 0 ? 1 : Math.max(4, Math.round((item.totalTokens / Math.max(1, max)) * 140));
                  return (
                    <button
                      key={item.day}
                      type="button"
                      aria-label={`${item.day}–${weekEnd(item.day)}: ${compact(item.totalTokens)} tokens`}
                      className="group relative flex h-full min-w-3 flex-1 items-end focus:outline-none"
                      onMouseEnter={() => setHovered(index)}
                      onFocus={() => setHovered(index)}
                      onBlur={() => setHovered(null)}
                    >
                      <TokenStack item={item} heightPx={heightPx} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-12 gap-2 px-1">
              {trend.map((item, index) => (
                <span key={item.day} className="text-center font-mono text-[9px] text-grey" title={item.day}>
                  {index % 2 === 0 || index === trend.length - 1 ? item.day.slice(5) : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
        {active && hovered !== null && (
          <div
            role="tooltip"
            className={`pointer-events-none absolute top-3 z-20 w-[244px] border border-line bg-moon p-3 shadow-2xl ${
              hovered < trend.length / 2 ? "left-3" : "right-3"
            }`}
          >
            <div className="font-mono text-[11px] font-semibold text-paper">
              {active.day} → {weekEnd(active.day)}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px]">
              <span className="text-paper">{compact(active.totalTokens)} tokens</span>
              <span className="text-grey">
                {zh ? "环比" : "WoW"} {percentDelta(active.totalTokens, trend[hovered - 1]?.totalTokens ?? 0)}
              </span>
            </div>
            <TokenBreakdown item={active} zh={zh} />
          </div>
        )}
      </div>
    </div>
  );
}

interface HeatTokenCell {
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

function heatGrid(heatmap: UsageHeatmap, metric: UsageHeatMetric): number[][] {
  if (metric === "cost") return heatmap.costMicros;
  if (metric === "duration") return heatmap.activeSeconds;
  if (metric === "prompts") return heatmap.prompts;
  return heatmap.tokens;
}

function heatValueText(
  metric: UsageHeatMetric,
  value: number,
  zh: boolean,
  currency: CurrencySpec,
): string {
  if (metric === "cost") return fmtCost(value, currency);
  if (metric === "duration") return duration(value, zh);
  if (metric === "prompts") {
    return zh ? `${compact(value)} 条用户消息` : `${compact(value)} user messages`;
  }
  return `${compact(value)} tokens`;
}

export function UsageHeatmapGrid({
  heatmap,
  metric,
  tzLabel,
  zh,
  currency,
}: {
  heatmap: UsageHeatmap;
  metric: UsageHeatMetric;
  tzLabel: string;
  zh: boolean;
  currency: CurrencySpec;
}) {
  const [hovered, setHovered] = useState<{ weekday: number; hour: number } | null>(null);
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
  const cell = hovered
    ? {
        inputTokens: heatmap.inputTokens[hovered.weekday][hovered.hour],
        cacheWriteInputTokens: heatmap.cacheWriteInputTokens[hovered.weekday][hovered.hour],
        cacheReadInputTokens: heatmap.cacheReadInputTokens[hovered.weekday][hovered.hour],
        outputTokens: heatmap.outputTokens[hovered.weekday][hovered.hour],
        reasoningOutputTokens: heatmap.reasoningOutputTokens[hovered.weekday][hovered.hour],
        totalTokens: heatmap.tokens[hovered.weekday][hovered.hour],
      }
    : null;
  const top = grid
    .flatMap((row, weekday) => row.map((value, hour) => ({ weekday, hour, value })))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[620px]">
          <div className="flex items-center gap-1.5">
            <span className="w-6 shrink-0" />
            <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="text-center font-mono text-[9px] text-grey">
                  {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-1 space-y-[3px]">
            {grid.map((row, weekday) => (
              <div key={weekday} className="flex items-center gap-1.5">
                <span className="w-6 shrink-0 font-mono text-[10px] text-grey">{shortNames[weekday]}</span>
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                  {row.map((value, hour) => (
                    <button
                      key={hour}
                      type="button"
                      aria-label={`${longNames[weekday]} ${String(hour).padStart(2, "0")}:00 · ${heatValueText(metric, value, zh, currency)}`}
                      className={`aspect-square transition-transform hover:scale-110 focus:outline focus:outline-1 focus:outline-blue ${stepClass(value)}`}
                      onMouseEnter={() => setHovered({ weekday, hour })}
                      onFocus={() => setHovered({ weekday, hour })}
                      onBlur={() => setHovered(null)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hovered && cell && (
        <div role="tooltip" className="pointer-events-none absolute right-1 top-5 z-20 w-[252px] border border-line bg-moon p-3 shadow-2xl">
          <div className="font-mono text-[11px] font-semibold text-paper">
            {longNames[hovered.weekday]} {String(hovered.hour).padStart(2, "0")}:00
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <span className="text-paper">{compact(cell.totalTokens)} tokens</span>
            <span className="text-grey">{zh ? "命中率" : "hit"} {hitRate(cell)}</span>
          </div>
          <TokenBreakdown item={cell} zh={zh} />
          <div className="mt-2 border-t border-line pt-2 font-mono text-[10px] text-grey">
            {zh ? "估费" : "Cost"} {fmtCost(heatmap.costMicros[hovered.weekday][hovered.hour], currency)} ·{" "}
            {zh ? "活跃" : "Active"} {duration(heatmap.activeSeconds[hovered.weekday][hovered.hour], zh)} ·{" "}
            {compact(heatmap.prompts[hovered.weekday][hovered.hour])}{" "}
            {zh ? "条用户消息" : "user messages"}
          </div>
        </div>
      )}

      <p className="mt-3 font-mono text-[10px] text-grey">
        {zh ? `时区:${tzLabel}(浏览器本地)` : `Timezone: ${tzLabel} (browser local)`}
      </p>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 font-mono text-[11px] text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
          {zh ? "最活跃时段(TOP 5)" : "BUSIEST SLOTS (TOP 5)"}
        </summary>
        {top.length === 0 ? (
          <p className="mt-2 text-[10px] text-grey">{zh ? "该范围内暂无数据" : "No data in this range"}</p>
        ) : (
          <ol className="mt-2 space-y-1 font-mono text-[10px] text-grey">
            {top.map((item) => (
              <li key={`${item.weekday}-${item.hour}`}>
                {longNames[item.weekday]} {String(item.hour).padStart(2, "0")}:00 —{" "}
                {heatValueText(metric, item.value, zh, currency)}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
