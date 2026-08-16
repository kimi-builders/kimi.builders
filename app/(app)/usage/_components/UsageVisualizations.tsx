"use client";

import { useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { compactNumber } from "@/src/lib/format";
import type { UsageGranularity, UsageMetric, UsageRangeLabel } from "@/src/lib/usage/filters";
import {
  heatGridFor,
  heatMetricText,
  heatPeakSlot,
  type UsageCurrencySpec,
  type UsageHeatMetric,
} from "@/src/lib/usage/heatmap";
import type { UsageHeatmap, UsageTrendDay } from "@/src/lib/usage/query";

const WEEKDAY_LONG_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_LONG_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_SHORT_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_SHORT_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/* 堆叠序列的配色单一事实源:SVG 柱子用下面的 FILL_*(inline style,Tailwind 不管 SVG 填充),
   page.tsx 的卡头图例用 USAGE_TREND_LEGEND 的 bg-* class。两套值必须同 hue,改色两边同步。 */
const FILL_INPUT = "var(--color-blue)";
const FILL_CACHE = "rgb(52 211 153 / 0.8)"; // emerald-400/80
const FILL_OUTPUT = "color-mix(in srgb, var(--color-paper) 75%, transparent)";
const FILL_REASONING = "#fbbf24"; // amber-400
const FILL_COST = "var(--color-blue)";
const FILL_DURATION = "color-mix(in srgb, var(--color-blue) 70%, transparent)";

function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
}

function duration(seconds: number, zh: boolean): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return zh ? `${hours}时 ${minutes}分` : `${hours}h ${minutes}m`;
  return zh ? `${minutes} 分钟` : `${minutes}m`;
}

function fmtCost(micros: number, currency: UsageCurrencySpec): string {
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
  currency: UsageCurrencySpec,
): string {
  if (metric === "cost") return fmtCost(item.costMicros, currency);
  if (metric === "duration") return duration(item.activeSeconds, zh);
  return `${compact(item.totalTokens, zh)} tokens`;
}

function axisTickText(
  metric: UsageMetric,
  value: number,
  zh: boolean,
  currency: UsageCurrencySpec,
): string {
  if (value === 0) return "0";
  if (metric === "cost") return fmtCost(value, currency);
  if (metric === "duration") {
    const hours = value / 3600;
    return hours >= 1 ? `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h` : `${Math.round(value / 60)}m`;
  }
  return compact(value, zh);
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
          <dd className="text-paper">{compact(row.value, zh)}</dd>
        </div>
      ))}
    </dl>
  );
}

const TIP_WIDTH = 244;

/* 悬浮卡定位:优先放被 hover 柱子的右侧,其次左侧;两侧都放不下(柱宽/容器窄)
   才压到离柱子最远的角落——任何情况下都不盖住鼠标所在的数据位。 */
function tooltipPos(
  event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
  viewport: HTMLDivElement | null,
): { left: number; top: number } {
  if (!viewport) return { left: 8, top: 12 };
  const viewportRect = viewport.getBoundingClientRect();
  const targetRect = event.currentTarget.getBoundingClientRect();
  const barLeft = targetRect.left - viewportRect.left;
  const barRight = targetRect.right - viewportRect.left;
  const gap = 12;
  if (viewportRect.width - barRight >= TIP_WIDTH + gap + 8)
    return { left: barRight + gap, top: 12 };
  if (barLeft >= TIP_WIDTH + gap + 8)
    return { left: barLeft - gap - TIP_WIDTH, top: 12 };
  const barCenter = (barLeft + barRight) / 2;
  return {
    left: barCenter < viewportRect.width / 2 ? viewportRect.width - TIP_WIDTH - 8 : 8,
    top: 12,
  };
}

/* 趋势图核心:SVG 堆叠柱(+可选均线)+ Y 网格线 + HTML 透明热区(保键盘可达)。
   视觉层全 SVG,交互层叠绝对定位的 button 行,两者用同一组 slot 几何对齐。 */
function TrendCore({
  trend,
  metric,
  zh,
  currency,
  granularity,
  rangeLabel,
  maWindow,
  plotHeight = 192,
  tooltipTitle,
  tooltipNote,
}: {
  trend: UsageTrendDay[];
  metric: UsageMetric;
  zh: boolean;
  currency: UsageCurrencySpec;
  granularity: UsageGranularity;
  rangeLabel: UsageRangeLabel;
  maWindow?: number;
  plotHeight?: number;
  tooltipTitle?: (item: UsageTrendDay) => string;
  tooltipNote?: (item: UsageTrendDay, index: number) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ index: number; left: number; top: number } | null>(null);
  const max = Math.max(0, ...trend.map((item) => metricValue(item, metric)));
  if (max <= 0) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-grey">
        {zh ? "该范围内暂无数据" : "No data in this range"}
      </div>
    );
  }

  const n = trend.length;
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  /* slot 宽度按目标总宽自适应:少数几根柱子(如 12 周)更粗,30 天则紧凑。 */
  const slot = Math.max(22, Math.min(64, Math.floor((980 - padL - padR) / Math.max(1, n))));
  const plotW = n * slot;
  const width = padL + plotW + padR;
  const height = padT + plotHeight + padB;
  const barW = slot * 0.62;
  const y = (value: number) => padT + plotHeight - (value / max) * plotHeight;

  const ticks = [0, 1, 2, 3, 4].map((step) => (max * step) / 4);
  const labels = labelIndexes(n);
  const monoFont = "var(--font-jetbrains), ui-monospace, monospace";

  let maPath: string | null = null;
  if (maWindow && n > 1) {
    const points = trend.map((_, index) => {
      const from = Math.max(0, index - maWindow + 1);
      const windowItems = trend.slice(from, index + 1);
      const mean = windowItems.reduce((sum, item) => sum + metricValue(item, metric), 0) / windowItems.length;
      return [padL + index * slot + slot / 2, y(mean)] as const;
    });
    maPath = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let index = 1; index < points.length; index += 1) {
      const [x1, y1] = points[index - 1];
      const [x2, y2] = points[index];
      const midX = (x1 + x2) / 2;
      maPath += ` C${midX.toFixed(1)},${y1.toFixed(1)} ${midX.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
  }

  const active = hovered ? trend[hovered.index] : null;

  return (
    <div ref={viewportRef} className="relative" onMouseLeave={() => setHovered(null)}>
      <div className="overflow-x-auto pb-1">
        {/* 容器窄于 viewBox 时整体等比缩放(width:100% + viewBox);窄于 560px 才横向滚动。 */}
        <div style={{ minWidth: Math.min(560, width) }}>
          <div className="relative" style={{ width: "100%", maxWidth: width }}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{ width: "100%", height: "auto", display: "block" }}
              role="img"
              aria-label={zh ? "趋势图" : "Trend chart"}
            >
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={padL}
                    y1={y(tick)}
                    x2={width - padR}
                    y2={y(tick)}
                    style={{ stroke: "var(--color-line)" }}
                    strokeWidth={tick === 0 ? 1.2 : 1}
                  />
                  <text
                    x={padL - 8}
                    y={y(tick) + 3.5}
                    textAnchor="end"
                    style={{ fill: "var(--color-grey)", font: `10px ${monoFont}` }}
                  >
                    {axisTickText(metric, tick, zh, currency)}
                  </text>
                </g>
              ))}
              {hovered && (
                <rect
                  x={padL + hovered.index * slot}
                  y={padT}
                  width={slot}
                  height={plotHeight}
                  style={{ fill: "color-mix(in srgb, var(--color-paper) 6%, transparent)" }}
                />
              )}
              {trend.map((item, index) => {
                const x = padL + index * slot + (slot - barW) / 2;
                if (metric === "tokens") {
                  const segments = [
                    { value: item.inputTokens + item.cacheWriteInputTokens, fill: FILL_INPUT },
                    { value: item.cacheReadInputTokens, fill: FILL_CACHE },
                    { value: item.outputTokens, fill: FILL_OUTPUT },
                    { value: item.reasoningOutputTokens, fill: FILL_REASONING },
                  ];
                  let cursor = y(0);
                  return (
                    <g key={item.day}>
                      {item.totalTokens <= 0 && (
                        <rect x={x} y={cursor - 1} width={barW} height={1} style={{ fill: "var(--color-card)" }} />
                      )}
                      {segments.map((segment) => {
                        if (segment.value <= 0) return null;
                        const h = (segment.value / max) * plotHeight;
                        cursor -= h;
                        return (
                          <rect
                            key={segment.fill}
                            x={x}
                            y={cursor}
                            width={barW}
                            height={Math.max(h, 1.5)}
                            rx={1}
                            style={{ fill: segment.fill }}
                          />
                        );
                      })}
                    </g>
                  );
                }
                const value = metricValue(item, metric);
                const h = value <= 0 ? 1 : Math.max(2, (value / max) * plotHeight);
                return (
                  <rect
                    key={item.day}
                    x={x}
                    y={y(0) - h}
                    width={barW}
                    height={h}
                    rx={1}
                    style={{
                      fill:
                        value <= 0
                          ? "var(--color-card)"
                          : metric === "cost"
                            ? FILL_COST
                            : FILL_DURATION,
                    }}
                  />
                );
              })}
              {maPath && (
                <path
                  d={maPath}
                  fill="none"
                  strokeWidth={1.6}
                  strokeDasharray="5 5"
                  style={{ stroke: "var(--color-grey)" }}
                />
              )}
              {trend.map((item, index) =>
                labels.has(index) ? (
                  <text
                    key={item.day}
                    /* 两端标签改用 start/end 锚点内收,避免贴边被 padR/padL 裁掉 */
                    x={
                      index === 0
                        ? padL - 4
                        : index === n - 1
                          ? width - padR + 4
                          : padL + index * slot + slot / 2
                    }
                    y={height - 6}
                    textAnchor={index === 0 ? "start" : index === n - 1 ? "end" : "middle"}
                    style={{ fill: "var(--color-grey)", font: `9.5px ${monoFont}` }}
                  >
                    {trendAxisLabel(item.day, granularity, rangeLabel)}
                  </text>
                ) : null,
              )}
            </svg>
            <div
              className="absolute flex"
              /* 与 SVG 同 viewBox 比例定位:整体缩放/拉伸时热区始终对齐柱子。 */
              style={{
                left: `${(padL / width) * 100}%`,
                top: `${(padT / height) * 100}%`,
                width: `${(plotW / width) * 100}%`,
                height: `${(plotHeight / height) * 100}%`,
              }}
            >
              {trend.map((item, index) => (
                <button
                  key={item.day}
                  type="button"
                  aria-label={`${item.day}: ${metricText(item, metric, zh, currency)}`}
                  className="h-full min-w-0 flex-1 cursor-pointer focus:outline-none focus-visible:bg-paper/10"
                  onMouseEnter={(event) =>
                    setHovered({ index, ...tooltipPos(event, viewportRef.current) })
                  }
                  onFocus={(event) =>
                    setHovered({ index, ...tooltipPos(event, viewportRef.current) })
                  }
                  onBlur={() => setHovered(null)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {active && hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-[244px] rounded-lg border border-line bg-moon p-3 shadow-2xl"
          style={{ left: hovered.left, top: hovered.top }}
        >
          <div className="font-mono text-[11px] font-semibold text-paper">
            {tooltipTitle ? tooltipTitle(active) : active.day}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <span className="text-paper">{metricText(active, metric, zh, currency)}</span>
            {metric === "tokens" && (
              <span className="text-grey">{zh ? "命中率" : "hit"} {hitRate(active)}</span>
            )}
          </div>
          {tooltipNote?.(active, hovered.index)}
          {metric === "tokens" && <TokenBreakdown item={active} zh={zh} />}
        </div>
      )}
    </div>
  );
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
  currency: UsageCurrencySpec;
}) {
  return (
    <TrendCore
      trend={trend}
      metric={metric}
      zh={zh}
      currency={currency}
      granularity={granularity}
      rangeLabel={rangeLabel}
      maWindow={7}
    />
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
  currency,
}: {
  trend: UsageTrendDay[];
  zh: boolean;
  currency: UsageCurrencySpec;
}) {
  const current = trend.at(-1);
  const previous = trend.at(-2);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-grey">
        <span>{zh ? "本周" : "This week"} <strong className="text-paper">{compact(current?.totalTokens ?? 0, zh)}</strong></span>
        <span>{zh ? "上周" : "Last week"} <strong className="text-paper">{compact(previous?.totalTokens ?? 0, zh)}</strong></span>
        <span className={(current?.totalTokens ?? 0) >= (previous?.totalTokens ?? 0) ? "text-emerald-400" : "text-red-400"}>
          {percentDelta(current?.totalTokens ?? 0, previous?.totalTokens ?? 0)}
        </span>
      </div>
      <TrendCore
        trend={trend}
        metric="tokens"
        zh={zh}
        currency={currency}
        granularity="day"
        rangeLabel="custom"
        plotHeight={140}
        tooltipTitle={(item) => `${item.day} → ${weekEnd(item.day)}`}
        tooltipNote={(item, index) => (
          <div className="mt-1 font-mono text-[11px] text-grey">
            {zh ? "环比" : "WoW"} {percentDelta(item.totalTokens, trend[index - 1]?.totalTokens ?? 0)}
          </div>
        )}
      />
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

/* 6 档色阶(占峰值比):图例 ramp 与格子共用这一组 class。 */
const HEAT_STEPS = ["bg-blue/15", "bg-blue/30", "bg-blue/45", "bg-blue/60", "bg-blue/80", "bg-blue"];

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
  currency: UsageCurrencySpec;
}) {
  const [hovered, setHovered] = useState<{ weekday: number; hour: number } | null>(null);
  const grid = heatGridFor(heatmap, metric);
  const max = Math.max(0, ...grid.flat());
  const peak = heatPeakSlot(heatmap, metric);
  const longNames = zh ? WEEKDAY_LONG_ZH : WEEKDAY_LONG_EN;
  const shortNames = zh ? WEEKDAY_SHORT_ZH : WEEKDAY_SHORT_EN;
  const stepClass = (value: number): string => {
    if (value <= 0 || max <= 0) return "bg-paper/[0.05]";
    const ratio = value / max;
    if (ratio <= 0.16) return HEAT_STEPS[0];
    if (ratio <= 0.32) return HEAT_STEPS[1];
    if (ratio <= 0.48) return HEAT_STEPS[2];
    if (ratio <= 0.64) return HEAT_STEPS[3];
    if (ratio <= 0.82) return HEAT_STEPS[4];
    return HEAT_STEPS[5];
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

  return (
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      {/* 格子随列宽自适应,但设最大宽度:超宽容器里格子不被拉大,视觉密度恒定。 */}
      <div className="pb-1">
        <div className="max-w-[620px]">
          <div className="space-y-[3px]">
            {grid.map((row, weekday) => (
              <div key={weekday} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-grey">
                  {shortNames[weekday]}
                </span>
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                  {row.map((value, hour) => {
                    if (!heatmap.hasData[weekday][hour]) {
                      /* 采集缺口:虚线描边格,不可交互。 */
                      return (
                        <span
                          key={hour}
                          aria-hidden="true"
                          className="aspect-square rounded-[3px] border border-dashed border-paper/20"
                        />
                      );
                    }
                    const isPeak =
                      peak !== null && peak.weekday === weekday && peak.hour === hour && max > 0;
                    return (
                      <button
                        key={hour}
                        type="button"
                        aria-label={`${longNames[weekday]} ${String(hour).padStart(2, "0")}:00 · ${heatMetricText(metric, value, zh, currency)}`}
                        className={`aspect-square rounded-[3px] transition-transform hover:z-10 hover:scale-125 focus:outline focus:outline-1 focus:outline-blue ${stepClass(value)}`}
                        style={
                          isPeak
                            ? { boxShadow: "0 0 0 1.5px #fff, 0 0 16px rgb(59 130 246 / 0.55)" }
                            : undefined
                        }
                        onMouseEnter={() => setHovered({ weekday, hour })}
                        onFocus={() => setHovered({ weekday, hour })}
                        onBlur={() => setHovered(null)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-[3px] flex items-center gap-1.5">
            <span className="w-5 shrink-0" />
            <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="text-center font-mono text-[10.5px] text-grey">
                  {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hovered && cell && (
        /* 悬浮卡放被 hover 格子的对侧半场:右半场的格子卡片去左边,反之亦然,
           任何格子都不会被自己的数据卡挡住 */
        <div
          role="tooltip"
          className={`pointer-events-none absolute top-5 z-20 w-[252px] rounded-lg border border-line bg-moon p-3 shadow-2xl ${
            hovered.hour >= 12 ? "left-1" : "right-1"
          }`}
        >
          <div className="font-mono text-[11px] font-semibold text-paper">
            {longNames[hovered.weekday]} {String(hovered.hour).padStart(2, "0")}:00
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <span className="text-paper">{compact(cell.totalTokens, zh)} tokens</span>
            <span className="text-grey">{zh ? "命中率" : "hit"} {hitRate(cell)}</span>
          </div>
          <TokenBreakdown item={cell} zh={zh} />
          <div className="mt-2 border-t border-line pt-2 font-mono text-[11px] text-grey">
            {zh ? "估费" : "Cost"} {fmtCost(heatmap.costMicros[hovered.weekday][hovered.hour], currency)} ·{" "}
            {zh ? "活跃" : "Active"} {duration(heatmap.activeSeconds[hovered.weekday][hovered.hour], zh)} ·{" "}
            {compact(heatmap.prompts[hovered.weekday][hovered.hour], zh)}{" "}
            {zh ? "条用户消息" : "user messages"}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-grey">
        <span className="flex items-center gap-1.5">
          {zh ? "少" : "Less"}
          <span className="flex gap-[3px]">
            {HEAT_STEPS.map((step) => (
              <i key={step} className={`h-3 w-3 rounded-[3px] ${step}`} />
            ))}
          </span>
          {zh ? "多" : "More"}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-[11px] w-[11px] rounded-[3px] border border-dashed border-paper/30" />
          {zh ? "描边 = 无数据(采集缺口)" : "Dashed = no data (collection gap)"}
        </span>
        <span className="text-grey/80">
          {zh ? "白圈 = 峰值 · 悬停查看数值" : "White ring = peak · hover for values"}
        </span>
        <span className="text-grey/80">
          {zh ? `时区:${tzLabel}(浏览器本地)` : `Timezone: ${tzLabel} (browser local)`}
        </span>
      </div>
    </div>
  );
}
