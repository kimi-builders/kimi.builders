import type { UsageMetric } from "./filters";
import type { UsageTokenBreakdown } from "./pricing";

export interface UsageTotals extends UsageTokenBreakdown {
  totalTokens: number;
  requests: number;
  sessions: number;
  userMessages: number;
  messages: number;
  activeSeconds: number;
  durationSeconds: number;
  costMicros: number;
  activeDevices: number;
}

export interface UsageTrendDay extends UsageTokenBreakdown {
  day: string;
  totalTokens: number;
  requests: number;
  sessions: number;
  activeSeconds: number;
  costMicros: number;
}

export interface UsageHeatmap {
  /* 7（周一到周日）× 24（本地小时）。 */
  tokens: number[][];
  inputTokens: number[][];
  cacheWriteInputTokens: number[][];
  cacheReadInputTokens: number[][];
  outputTokens: number[][];
  reasoningOutputTokens: number[][];
  costMicros: number[][];
  activeSeconds: number[][];
  prompts: number[][];
  /* 该格是否有任何采集事实落入:false = 采集缺口(区别于「有采集但零用量」)。 */
  hasData: boolean[][];
}

export interface UsagePricingMatch {
  source: string;
  model: string;
  modelCanonical: string;
  modelDisplayName: string;
  modelProvider: string;
  matchedPattern: string | null;
  matchKind: "exact" | "prefix" | null;
  status: "priced" | "partial" | "unpriced";
  inputPerMtok: number | null;
  cacheWritePerMtok: number | null;
  cacheReadPerMtok: number | null;
  outputPerMtok: number | null;
  reasoningPerMtok: number | null;
  contextTier: string;
  processingTier: string;
  cacheWrite5mPerMtok: number | null;
  cacheWrite1hPerMtok: number | null;
  assumptions: string[];
  pricingSourceUrl: string | null;
  verifiedAt: string | null;
  pricingBasis: string | null;
  cacheWriteFallback: boolean;
  reasoningFallback: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: string | null;
  tokens: number;
}

export interface UsageDistributionRow {
  key: string;
  label: string;
  tokens: number;
  costMicros: number;
  share: number;
  hasUnpriced: boolean;
}

export interface UsageDistribution {
  rows: UsageDistributionRow[];
  totalTokens: number;
  totalCostMicros: number;
}

export interface UsageRecordRow extends UsageTokenBreakdown {
  day: string;
  /* grain=bucket 时为桶起点（UTC ISO），day 粒度为 null。 */
  time: string | null;
  source: string;
  model: string;
  modelCanonical: string;
  modelDisplayName: string;
  modelProvider: string;
  reasoningEffort: string;
  agentVersion: string;
  contextTier: string;
  processingTier: string;
  project: string | null;
  deviceId: string;
  deviceName: string;
  deviceDetail: string;
  totalTokens: number;
  requests: number;
  costMicros: number;
  priceStatus: "priced" | "partial" | "unpriced" | "legacy";
}

export interface UsageFilterOptions {
  sources: string[];
  models: string[];
  efforts: string[];
  agentVersions: string[];
  projects: string[];
  devices: { id: string; name: string }[];
}

export interface UsageOverview {
  days: number;
  range: { label: string; from: string; to: string };
  filters: {
    sources: string[] | null;
    models: string[] | null;
    efforts: string[] | null;
    agentVersions: string[] | null;
    projects: string[] | null;
    devices: string[] | null;
    metric: UsageMetric;
  };
  totals: UsageTotals;
  lifetimeTokens: number;
  trend: UsageTrendDay[];
  weekly: {
    from: string;
    to: string;
    trend: UsageTrendDay[];
  };
  heatmap: UsageHeatmap;
  distributions: {
    source: UsageDistribution;
    model: UsageDistribution;
    project: UsageDistribution;
    device: UsageDistribution;
  };
  records: {
    rows: UsageRecordRow[];
    total: number;
    page: number;
    pageSize: number;
  };
  options: UsageFilterOptions;
  previous: {
    inputTokens: number;
    cacheWriteInputTokens: number;
    cacheReadInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
    requests: number;
    sessions: number;
    messages: number;
    userMessages: number;
    activeSeconds: number;
    durationSeconds: number;
    costMicros: number;
  };
  activeDevices: number;
  lastSyncAt: Date | null;
  meta: {
    pricingVersions: string[];
    unpricedModels: string[];
    partialModels: string[];
    pricedTokens: number;
    unpricedTokens: number;
    assumedTokens: number;
    pricingCoverage: number;
    pricingMatches: UsagePricingMatch[];
    tzOffsetMinutes: number;
    generatedAt: string;
    diagnostics: {
      statements: number;
      rowsFetched: number;
    };
  };
}
