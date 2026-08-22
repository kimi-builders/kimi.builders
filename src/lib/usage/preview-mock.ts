/* Deterministic sample data for the logged-out usage preview: rendered by
   UsagePreviewStrip with the real panel components (hero card, trend chart,
   heatmap). Live components replace static screenshots — language, theme,
   and vibe follow automatically, so the preview never rots as the UI
   evolves. Follows the mockUsageShareSnapshot precedent in share.ts: no
   randomness — a sine waveform with fixed bucket ratios, so the same
   visitor always sees the same data; dates roll relative to now (always
   "last 30 days", never stuck in a hardcoded month). Pure functions,
   unit-tested in tests/usage-preview-mock.test.ts. */
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

/* Bucket ratios of the day's totalTokens: cache-read heavy -> ~87% hit
   rate, matching real heavy users on site (cache read is the tallest stack
   segment) */
const RATIO = {
  input: 0.09,
  cacheWrite: 0.02,
  output: 0.04,
  reasoning: 0.02,
} as const;
/* Cache read = remainder (bucket sums always equal totalTokens exactly, no
   drift) */
const CACHE_READ_RATIO =
  1 - RATIO.input - RATIO.cacheWrite - RATIO.output - RATIO.reasoning;

/* Blended $0.48/MTok estimate (input-cache-heavy weighted price):
   tokens x 0.48 lands on micro-dollars exactly (1 MTok x $0.48 = $0.48 =
   480000 micros) */
const COST_PER_MTOK = 0.48;

function dayKeyAt(base: Date, offsetDays: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/* Daily trend: heavy weekdays, light weekends, one rest day every 11 days
   (no fake uniformity); rest days are all-zero */
function previewDay(base: Date, offsetDays: number, i: number): UsageTrendDay {
  const day = dayKeyAt(base, offsetDays);
  const weekday = (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7; // 0=Monday
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

/* 7x24 heatmap: heavy work hours, light weekends, silent small hours (no
   collection 00:00-06:00) — a real builder's rhythm. The overnight gaps
   also demonstrate the "collection gap vs zero usage" semantics in the
   sample (hasData=false renders the grid base color) */
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
      if (hour < 7) continue; // overnight rest: zero usage + no collection
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
  /* Last 30 days ending yesterday (today is incomplete, excluded) */
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
