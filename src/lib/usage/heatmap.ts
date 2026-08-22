import { compactNumber } from "../format";
import type { UsageMetric } from "./filters";
import type { UsageHeatmap } from "./query-types";

/* Metrics switchable on the heatmap: the page's main metric plus user prompts. */
export type UsageHeatMetric = UsageMetric | "prompts";

/* Extract the 7x24 value grid for a metric. */
export function heatGridFor(heatmap: UsageHeatmap, metric: UsageHeatMetric): number[][] {
  if (metric === "cost") return heatmap.costMicros;
  if (metric === "duration") return heatmap.activeSeconds;
  if (metric === "prompts") return heatmap.prompts;
  return heatmap.tokens;
}

export interface HeatSlot {
  weekday: number;
  hour: number;
  value: number;
}

/* Weekday names shared by the TOP5 cards (server-rendered) and the heatmap. */
export const USAGE_WEEKDAYS_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
export const USAGE_WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/* Most active slots: TOP N cells (value > 0) on the 7x24 grid for the current metric. */
export function heatTopSlots(
  heatmap: UsageHeatmap,
  metric: UsageHeatMetric,
  count = 5,
): HeatSlot[] {
  return heatGridFor(heatmap, metric)
    .flatMap((row, weekday) => row.map((value, hour) => ({ weekday, hour, value })))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

/* Peak cell (white ring): the max cell under the current metric; null when all zero. */
export function heatPeakSlot(heatmap: UsageHeatmap, metric: UsageHeatMetric): HeatSlot | null {
  return heatTopSlots(heatmap, metric, 1)[0] ?? null;
}

/* Trend-stack card header legend (shared by the usage page and the profile
   page); colors map 1:1 to the FILL_* constants in UsageVisualizations —
   change them on both sides. */
export const USAGE_TREND_LEGEND = [
  { key: "input", zh: "输入(含缓存写)", en: "Input (incl. cache write)", chip: "bg-blue" },
  { key: "cache", zh: "缓存读", en: "Cache read", chip: "bg-status-ok/80" },
  { key: "output", zh: "输出", en: "Output", chip: "bg-paper/75" },
  { key: "reasoning", zh: "推理", en: "Reasoning", chip: "bg-status-warn" },
] as const;

export interface UsageCurrencySpec {
  rate: number;
  symbol: string;
}

function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
}

function durationText(seconds: number, zh: boolean): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return zh ? `${hours}时 ${minutes}分` : `${hours}h ${minutes}m`;
  return zh ? `${minutes} 分钟` : `${minutes}m`;
}

/* Numeric copy shared by the heatmap and TOP5 (tokens / cost / duration / prompts). */
export function heatMetricText(
  metric: UsageHeatMetric,
  value: number,
  zh: boolean,
  currency: UsageCurrencySpec,
): string {
  if (metric === "cost") {
    const converted = (value / 1e6) * currency.rate;
    return `${currency.symbol}${converted >= 0.01 ? converted.toFixed(2) : converted.toFixed(4)}`;
  }
  if (metric === "duration") return durationText(value, zh);
  if (metric === "prompts") {
    return zh ? `${compact(value, zh)} 条用户消息` : `${compact(value, zh)} user messages`;
  }
  return `${compact(value, zh)} tokens`;
}
