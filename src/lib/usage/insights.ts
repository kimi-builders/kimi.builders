import { compactNumber } from "@/src/lib/format";
import type { UsageAttribution, UsageTrendDay } from "@/src/lib/usage/query";

export interface UsageInsight {
  id: "change" | "peak" | "cache" | "activity" | "empty";
  title: string;
  detail: string;
  action: string;
  tone: "focus" | "neutral" | "attention";
}

export interface UsageInsightInput {
  trend: UsageTrendDay[];
  currentTokens: number;
  previousTokens?: number;
  cacheHitRate?: number | null;
  attribution?: UsageAttribution;
  sourceLabel?: (source: string) => string;
  zh: boolean;
}

function percentDelta(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function shortDay(day: string, zh: boolean): string {
  if (!zh) return day.slice(5);
  const [, month = "", date = ""] = day.split("-");
  return `${Number(month)}月${Number(date)}日`;
}

function sumTokens(items: UsageTrendDay[]): number {
  return items.reduce((sum, item) => sum + item.totalTokens, 0);
}

function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
}

export function buildUsageInsights({
  trend,
  currentTokens,
  previousTokens,
  cacheHitRate,
  attribution,
  sourceLabel = (source) => source,
  zh,
}: UsageInsightInput): UsageInsight[] {
  const populated = trend.filter((item) => item.totalTokens > 0);
  if (currentTokens <= 0 || populated.length === 0) {
    return [
      {
        id: "empty",
        title: zh ? "当前范围没有可分析的用量" : "No usage to analyze in this range",
        detail: zh ? "没有发现有效的 Token 事实桶。" : "No populated token buckets were found.",
        action: zh ? "检查 Collector 同步状态，或扩大时间范围。" : "Check Collector sync or widen the time range.",
        tone: "attention",
      },
    ];
  }

  const insights: UsageInsight[] = [];
  const recent = trend.slice(-7);
  const earlier = trend.slice(-14, -7);
  const recentDelta = earlier.length > 0 ? percentDelta(sumTokens(recent), sumTokens(earlier)) : null;
  const periodDelta = previousTokens === undefined ? null : percentDelta(currentTokens, previousTokens);
  const delta = periodDelta ?? recentDelta;

  if (delta !== null) {
    const magnitude = Math.abs(delta);
    const direction = delta >= 0 ? (zh ? "增长" : "up") : zh ? "下降" : "down";
    const rangeLabel = periodDelta !== null ? (zh ? "较上一周期" : "vs previous period") : zh ? "近 7 天较此前 7 天" : "last 7 days vs prior 7";
    insights.push({
      id: "change",
      title: zh
        ? `Token ${rangeLabel}${direction} ${magnitude.toFixed(1)}%`
        : `Tokens are ${direction} ${magnitude.toFixed(1)}% ${rangeLabel}`,
      detail: zh
        ? `当前累计 ${compact(currentTokens, zh)}，变化由所选范围内的事实桶计算。`
        : `${compact(currentTokens, zh)} total, calculated from buckets in the selected range.`,
      action:
        magnitude < 10
          ? zh
            ? "波动较小，继续观察下一周期。"
            : "The change is small; continue monitoring."
          : delta >= 0
            ? zh
              ? "优先检查峰值日及主要 Agent、模型分布。"
              : "Inspect the peak day and leading agent/model distributions."
            : zh
              ? "确认下降来自效率提升、工作节奏变化，还是采集缺口。"
              : "Confirm whether the drop reflects efficiency, cadence, or missing collection.",
      tone: "focus",
    });
  }

  const peak = populated.reduce((best, item) => (item.totalTokens > best.totalTokens ? item : best));
  const activeAverage = sumTokens(populated) / populated.length;
  const peakRatio = activeAverage > 0 ? peak.totalTokens / activeAverage : 0;
  const peakCacheShare = peak.totalTokens > 0 ? peak.cacheReadInputTokens / peak.totalTokens : 0;
  const peakAttribution = attribution?.peak.key === peak.day ? attribution.peak : null;
  const topAgent = peakAttribution?.agent.rows[0];
  const topModel = peakAttribution?.model.rows[0];
  const topProject = peakAttribution?.project.rows[0];
  const attributionParts = [
    topAgent
      ? `${zh ? "Agent" : "Agent"} ${sourceLabel(topAgent.key)} ${(topAgent.share * 100).toFixed(1)}%`
      : null,
    topModel
      ? `${zh ? "模型" : "model"} ${topModel.label} ${(topModel.share * 100).toFixed(1)}%`
      : null,
    topProject
      ? `${zh ? "项目" : "project"} ${topProject.label} ${(topProject.share * 100).toFixed(1)}%`
      : null,
  ].filter((item): item is string => item !== null);
  const attributionAction = (() => {
    if (!peakAttribution) {
      return peakRatio >= 1.8
        ? zh
          ? "这是明显峰值，建议查看该日的 Agent、模型和会话明细。"
          : "This is a clear spike; inspect that day's agents, models, and sessions."
        : zh
          ? "峰值仍在常态范围内，可作为容量基线。"
          : "The peak remains close to normal activity and can serve as a capacity baseline.";
    }
    if (peakAttribution.project.coverage === 0) {
      return zh
        ? "项目归因未开启或当前范围没有项目标签；未归因部分未被猜测。"
        : "Project attribution is disabled or has no labels in this range; missing data was not inferred.";
    }
    if (peakAttribution.project.coverage < 0.8) {
      return zh
        ? `项目覆盖率仅 ${(peakAttribution.project.coverage * 100).toFixed(1)}%，建议先提升采集覆盖；未归因部分未被猜测。`
        : `Project coverage is ${(peakAttribution.project.coverage * 100).toFixed(1)}%; improve collection coverage before drawing a stronger conclusion.`;
    }
    if (peakAttribution.exactMeasurementCoverage < 0.8) {
      return zh
        ? `精确计量覆盖率为 ${(peakAttribution.exactMeasurementCoverage * 100).toFixed(1)}%，结论应按趋势参考。`
        : `Exact measurement coverage is ${(peakAttribution.exactMeasurementCoverage * 100).toFixed(1)}%; treat this as directional.`;
    }
    return zh
      ? "归因覆盖充足，可优先检查最大贡献的 Agent、模型和项目。"
      : "Attribution coverage is strong; inspect the leading agent, model, and project first.";
  })();
  insights.push({
    id: "peak",
    title: zh
      ? `峰值出现在 ${shortDay(peak.day, zh)}，达到 ${compact(peak.totalTokens, zh)}`
      : `Peak usage was ${compact(peak.totalTokens, zh)} on ${shortDay(peak.day, zh)}`,
    detail: zh
      ? `约为活跃日均值的 ${peakRatio.toFixed(1)} 倍，缓存读取占 ${(peakCacheShare * 100).toFixed(1)}%。${attributionParts.length > 0 ? `可归因用量中：${attributionParts.join(" · ")}。` : ""}`
      : `${peakRatio.toFixed(1)}x the active-day average; cache reads contributed ${(peakCacheShare * 100).toFixed(1)}%.${attributionParts.length > 0 ? ` Within attributable usage: ${attributionParts.join(" · ")}.` : ""}`,
    action: attributionAction,
    tone: insights.length === 0 ? "focus" : peakRatio >= 1.8 ? "attention" : "neutral",
  });

  if (cacheHitRate !== undefined && cacheHitRate !== null) {
    const rate = cacheHitRate * 100;
    insights.push({
      id: "cache",
      title:
        cacheHitRate >= 0.85
          ? zh
            ? `缓存命中率保持在 ${rate.toFixed(1)}%`
            : `Cache hit rate remains at ${rate.toFixed(1)}%`
          : zh
            ? `缓存命中率为 ${rate.toFixed(1)}%，仍有提升空间`
            : `Cache hit rate is ${rate.toFixed(1)}% and can improve`,
      detail:
        cacheHitRate >= 0.85
          ? zh
            ? "大部分重复输入已被复用，缓存读取仍是 Token 构成的主要部分。"
            : "Most repeated input is being reused; cache reads remain the largest token component."
          : zh
            ? "更多输入正在重复计入，可检查上下文前缀是否稳定。"
            : "More input is being counted repeatedly; check whether context prefixes stay stable.",
      action:
        cacheHitRate >= 0.85
          ? zh
            ? "保持稳定的系统提示词与上下文前缀。"
            : "Keep system prompts and context prefixes stable."
          : zh
            ? "合并重复上下文，并减少每次请求中不必要的前缀变化。"
            : "Consolidate repeated context and reduce unnecessary prefix changes.",
      tone: cacheHitRate < 0.6 ? "attention" : "neutral",
    });
  }

  return insights.slice(0, 3);
}
