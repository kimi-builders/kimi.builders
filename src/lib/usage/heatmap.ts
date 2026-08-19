import { compactNumber } from "../format";
import type { UsageMetric } from "./filters";
import type { UsageHeatmap } from "./query-types";

/* 热图可切换的指标:页面主指标 + 用户消息(prompts)。 */
export type UsageHeatMetric = UsageMetric | "prompts";

/* 按指标取出 7×24 数值网格。 */
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

/* TOP5 卡(服务端渲染)与热图共用星期名。 */
export const USAGE_WEEKDAYS_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
export const USAGE_WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/* 最活跃时段:按当前指标在 7×24 网格上取 TOP N(value>0)。 */
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

/* 峰值格(白圈):当前指标下最大值所在格;全零返回 null。 */
export function heatPeakSlot(heatmap: UsageHeatmap, metric: UsageHeatMetric): HeatSlot | null {
  return heatTopSlots(heatmap, metric, 1)[0] ?? null;
}

/* 趋势堆叠柱的卡头图例(用量中心 page.tsx 与个人主页 page.tsx 共用);
   颜色与 UsageVisualizations 的 FILL_* 填充一一对应,改色两边同步。 */
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

/* 热图/TOP5 共用的数值文案(token / 估费 / 时长 / 用户消息)。 */
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
