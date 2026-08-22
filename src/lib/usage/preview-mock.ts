/* 未登录用量预览的确定性示例数据(20260822):给 UsagePreviewStrip 渲染真实
   面板组件(Hero 卡 / 趋势图 / 热力图)用的 snapshot——「真组件活渲染」
   替代静态截图,语言/主题/气质自动跟随,UI 迭代永不腐化。
   写法沿用 share.ts 的 mockUsageShareSnapshot 先例:无随机源,sin 波形 +
   固定分桶比率,同一访客每次看到同一份;日期相对 now 滚动(示例永远是
   「近 30 天」,不会停留在某个写死的月份)。
   纯函数,单测直接测(tests/usage-preview-mock.test.ts)。 */
import type {
  UsageHeatmap,
  UsageTotals,
  UsageTrendDay,
} from "./query-types";

export interface UsagePreviewSnapshot {
  totals: UsageTotals;
  trend: UsageTrendDay[];
  heatmap: UsageHeatmap;
}

/* 分桶比率(占当日 totalTokens):缓存读为主 → 命中率 ~87%,
   贴合站内真实重度用户的形态(缓存读是最长的那截堆叠柱) */
const RATIO = {
  input: 0.09,
  cacheWrite: 0.02,
  output: 0.04,
  reasoning: 0.02,
} as const;
/* 缓存读 = 余量(保证分桶之和恰等于 totalTokens,不漂移) */
const CACHE_READ_RATIO =
  1 - RATIO.input - RATIO.cacheWrite - RATIO.output - RATIO.reasoning;

/* 混合估费 $0.48/Mtok(输入重缓存场景的加权价):tokens × 0.48 恰为
   微美元数(1 Mtok × $0.48 = $0.48 = 480000 micros) */
const COST_PER_MTOK = 0.48;

function dayKeyAt(base: Date, offsetDays: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/* 单日趋势:工作日重、周末淡,每 11 天休一天(波形不假);休整日全零 */
function previewDay(base: Date, offsetDays: number, i: number): UsageTrendDay {
  const day = dayKeyAt(base, offsetDays);
  const weekday = (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7; // 0=周一
  const weekend = weekday >= 5 ? 0.45 : 1;
  const rest = i % 11 === 3;
  const totalTokens = rest
    ? 0
    : Math.round((Math.sin(i * 1.73) + 1.35) * 68_000_000 * weekend);
  const inputTokens = Math.round(totalTokens * RATIO.input);
  const cacheWriteInputTokens = Math.round(totalTokens * RATIO.cacheWrite);
  const outputTokens = Math.round(totalTokens * RATIO.output);
  const reasoningOutputTokens = Math.round(totalTokens * RATIO.reasoning);
  const cacheReadInputTokens =
    totalTokens - inputTokens - cacheWriteInputTokens - outputTokens - reasoningOutputTokens;
  return {
    day,
    inputTokens,
    cacheWriteInputTokens,
    cacheReadInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    requests: Math.round(totalTokens / 9_200),
    sessions: Math.round(totalTokens / 2_600_000),
    activeSeconds: Math.round(totalTokens / 34_000),
    costMicros: Math.round(totalTokens * COST_PER_MTOK),
  };
}

function emptyMatrix(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

function emptyBoolMatrix(): boolean[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => false));
}

/* 7×24 热力图:工作时段重、周末淡、凌晨休(0-6 点无采集)——与真实
   Builder 的作息形态一致,夜里的空档让「采集缺口 vs 零用量」的语义
   也被示例如实展示(hasData=false 走网格底色) */
function previewHeatmap(): UsageHeatmap {
  const heatmap: UsageHeatmap = {
    tokens: emptyMatrix(),
    inputTokens: emptyMatrix(),
    cacheWriteInputTokens: emptyMatrix(),
    cacheReadInputTokens: emptyMatrix(),
    outputTokens: emptyMatrix(),
    reasoningOutputTokens: emptyMatrix(),
    costMicros: emptyMatrix(),
    activeSeconds: emptyMatrix(),
    prompts: emptyMatrix(),
    hasData: emptyBoolMatrix(),
  };
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      if (hour < 7) continue; // 凌晨休:零用量 + 无采集
      const work = hour >= 9 ? 1 : 0.3;
      const weekend = weekday >= 5 ? 0.45 : 1;
      const tokens = Math.round(
        (Math.sin(weekday * 3.7 + hour * 1.13) + 1.15) * 1_800_000 * work * weekend,
      );
      heatmap.tokens[weekday][hour] = tokens;
      heatmap.inputTokens[weekday][hour] = Math.round(tokens * RATIO.input);
      heatmap.cacheWriteInputTokens[weekday][hour] = Math.round(tokens * RATIO.cacheWrite);
      heatmap.cacheReadInputTokens[weekday][hour] = Math.round(tokens * CACHE_READ_RATIO);
      heatmap.outputTokens[weekday][hour] = Math.round(tokens * RATIO.output);
      heatmap.reasoningOutputTokens[weekday][hour] = Math.round(tokens * RATIO.reasoning);
      heatmap.costMicros[weekday][hour] = Math.round(tokens * COST_PER_MTOK);
      heatmap.activeSeconds[weekday][hour] = Math.round(tokens / 36_000);
      heatmap.prompts[weekday][hour] = Math.round(tokens / 58_000);
      heatmap.hasData[weekday][hour] = tokens > 0;
    }
  }
  return heatmap;
}

export function usagePreviewSnapshot(now = new Date()): UsagePreviewSnapshot {
  /* 近 30 天,截止昨日(今日不完整,不进示例) */
  const trend = Array.from({ length: 30 }, (_, i) => previewDay(now, i - 30, i));

  const totals: UsageTotals = {
    inputTokens: 0,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    requests: 0,
    sessions: 0,
    userMessages: 0,
    messages: 0,
    activeSeconds: 0,
    durationSeconds: 0,
    costMicros: 0,
    activeDevices: 2,
  };
  for (const d of trend) {
    totals.inputTokens += d.inputTokens;
    totals.cacheWriteInputTokens += d.cacheWriteInputTokens;
    totals.cacheReadInputTokens += d.cacheReadInputTokens;
    totals.outputTokens += d.outputTokens;
    totals.reasoningOutputTokens += d.reasoningOutputTokens;
    totals.totalTokens += d.totalTokens;
    totals.requests += d.requests;
    totals.sessions += d.sessions;
    totals.activeSeconds += d.activeSeconds;
    totals.costMicros += d.costMicros;
  }
  totals.userMessages = Math.round(totals.requests * 0.62);
  totals.messages = Math.round(totals.requests * 1.4);
  totals.durationSeconds = Math.round(totals.activeSeconds * 1.7);

  return { totals, trend, heatmap: previewHeatmap() };
}
