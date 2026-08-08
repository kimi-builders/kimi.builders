/* Usage ingest protocol v2.
   This file freezes transport names and metric semantics before the Phase 1
   API/database implementation. Additive changes are allowed within v2;
   renaming fields, changing their meaning, or reusing a source id requires a
   new protocol version. */

export const USAGE_INGEST_PROTOCOL_VERSION = 2 as const;

export const USAGE_SOURCE_CATALOG = [
  { id: "kimi-code", tier: "core" },
  { id: "claude-code", tier: "stable" },
  { id: "codex", tier: "stable" },
  { id: "gemini-cli", tier: "stable" },
  { id: "opencode", tier: "stable" },
  { id: "copilot-cli", tier: "stable" },
  { id: "grok", tier: "beta" },
  { id: "craft-agent", tier: "beta" },
  { id: "cursor", tier: "explicit-opt-in" },
  { id: "dimagent", tier: "beta" },
  { id: "openclaw", tier: "beta" },
  { id: "omp", tier: "beta" },
  { id: "pi-coding-agent", tier: "beta" },
  { id: "qwen-code", tier: "beta" },
  { id: "amp", tier: "beta" },
  { id: "droid", tier: "beta" },
  { id: "antigravity", tier: "beta" },
  { id: "trae-cli", tier: "beta" },
  { id: "hermes", tier: "beta" },
  { id: "kiro", tier: "beta" },
  { id: "mimocode", tier: "beta" },
  { id: "cline", tier: "beta" },
  { id: "roo-code", tier: "beta" },
  { id: "zcode", tier: "beta" },
] as const;

export type UsageSource = (typeof USAGE_SOURCE_CATALOG)[number];
export type UsageSourceId = UsageSource["id"];
export type UsageSourceTier = UsageSource["tier"];

const USAGE_SOURCE_IDS: ReadonlySet<string> = new Set(
  USAGE_SOURCE_CATALOG.map(({ id }) => id),
);

export function isUsageSourceId(value: string): value is UsageSourceId {
  return USAGE_SOURCE_IDS.has(value);
}

/* Privacy is deny-by-default. `project` and a human-readable device label are
   omitted from ingest payloads unless the user enables the matching setting. */
export const USAGE_PRIVACY_DEFAULTS = {
  uploadProject: false,
  uploadDeviceLabel: false,
  uploadQuotaSnapshots: false,
  retentionDays: 365,
} as const;

/* All token fields are mutually exclusive:
   - inputTokens: non-cached, non-cache-write input
   - cacheWriteInputTokens: cache creation/write input
   - cacheReadInputTokens: tokens read from cache
   - outputTokens: visible output, excluding separately reported reasoning
   - reasoningOutputTokens: separately reported reasoning output
   Clients must not fold one field into another before upload. */
export interface UsageTokenCountsV2 {
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

/* `legacy` is server-generated while migrating v1 daily rows. Collectors may
   only upload exact/estimated/credit measurements. */
export type UsageMeasurement = "exact" | "estimated" | "credit" | "legacy";

export interface UsageBucketV2 extends UsageTokenCountsV2 {
  source: UsageSourceId;
  model: string;
  /* UTC ISO-8601 timestamp aligned to a 30-minute boundary. */
  bucketStart: string;
  /* Omit when project upload is disabled; never send a full path or URL. */
  project?: string;
  requestCount: number;
  /* Provider credits stay separate and are never represented as tokens. */
  creditUnits?: number;
  measurement: UsageMeasurement;
}

export interface UsageSessionV2 {
  source: UsageSourceId;
  /* HMAC-SHA-256 with an installation-local salt; never a raw session id. */
  sessionHash: string;
  project?: string;
  firstMessageAt: string;
  lastMessageAt: string;
  durationSeconds: number;
  activeSeconds: number;
  messageCount: number;
  userMessageCount: number;
  /* Exactly 24 UTC-hour counters, indices 0 through 23. */
  userPromptHours: readonly number[];
}

export type UsageQuotaWindow = "five-hour" | "seven-day" | "monthly" | "balance";

export interface UsageQuotaSnapshotV2 {
  provider: UsageSourceId;
  window: UsageQuotaWindow;
  capturedAt: string;
  resetsAt?: string;
  utilization?: number;
  used?: number;
  limit?: number;
  unit: "tokens" | "credits" | "requests" | "currency" | "percent";
}

export type UsageClientSurface = "cli" | "daemon" | "mac-app" | "windows-app";

export interface UsageClientMetaV2 {
  surface: UsageClientSurface;
  surfaceVersion: string;
  parserVersion: string;
  platform: "darwin" | "linux" | "win32";
  /* Stable per sync run; shared by every batch in that run. */
  syncId: string;
  batchIndex: number;
  batchCount: number;
}

export interface UsageIngestRequestV2 {
  protocolVersion: typeof USAGE_INGEST_PROTOCOL_VERSION;
  client: UsageClientMetaV2;
  buckets: readonly UsageBucketV2[];
  sessions: readonly UsageSessionV2[];
  quotaSnapshots?: readonly UsageQuotaSnapshotV2[];
}

export interface UsageIngestResponseV2 {
  ok: true;
  protocolVersion: typeof USAGE_INGEST_PROTOCOL_VERSION;
  ingested: {
    buckets: number;
    sessions: number;
    quotaSnapshots: number;
  };
  unknownModels?: readonly string[];
}

export function observedTokenTotal(tokens: UsageTokenCountsV2): number {
  return (
    tokens.inputTokens +
    tokens.cacheWriteInputTokens +
    tokens.cacheReadInputTokens +
    tokens.outputTokens +
    tokens.reasoningOutputTokens
  );
}

/* 缓存命中率 = 缓存读 ÷ 输入侧总量(输入 + 缓存写 + 缓存读)。
   分母为 0 时返回 null(没有输入侧流量,命中率无意义,展示为 —)。 */
export function usageCacheHitRate(
  tokens: Pick<
    UsageTokenCountsV2,
    "inputTokens" | "cacheWriteInputTokens" | "cacheReadInputTokens"
  >,
): number | null {
  const base =
    tokens.inputTokens + tokens.cacheWriteInputTokens + tokens.cacheReadInputTokens;
  if (base <= 0) return null;
  return tokens.cacheReadInputTokens / base;
}
