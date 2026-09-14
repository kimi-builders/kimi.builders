export interface UsageModelIdentity {
  source?: unknown;
  model?: unknown;
  modelCanonical?: unknown;
  modelProvider?: unknown;
  bucketStart?: unknown;
  timestamp?: unknown;
}

const KIMI_ALIASES = new Map([
  ["k3", "kimi-k3"],
  ["kimi-k3", "kimi-k3"],
  ["k3-256", "kimi-k3-256k"],
  ["k3-256k", "kimi-k3-256k"],
  ["kimi-k3-256k", "kimi-k3-256k"],
  ["kimi-for-coding-highspeed", "kimi-k2.7-code-highspeed"],
  ["kimi-k2.8-preview", "kimi-k2.8-preview"],
  ["kimi-k2.7-code", "kimi-k2.7-code"],
  ["kimi-k2.7-code-highspeed", "kimi-k2.7-code-highspeed"],
  ["kimi-k2.6", "kimi-k2.6"],
  ["kimi-k2.5", "kimi-k2.5"],
]);

const MODEL_LABELS = new Map([
  ["kimi-k3", "Kimi K3"],
  ["kimi-k3-256k", "Kimi K3 256K"],
  ["kimi-k2.7-code", "Kimi K2.7 Code"],
  ["kimi-k2.8-preview", "Kimi K2.8 Preview"],
  ["kimi-k2.7-code-highspeed", "Kimi K2.7 Code Highspeed"],
  ["kimi-k2.6", "Kimi K2.6"],
  ["kimi-k2.5", "Kimi K2.5"],
]);

const KIMI_K2_8_ROLLOUT_AT = Date.parse("2026-09-11T00:00:00.000Z");

function value(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function temporalKimiAlias(slug: string, timestamp: unknown): string | null {
  if (slug !== "kimi-for-coding") return null;
  const at = timestamp instanceof Date ? timestamp.getTime() : Date.parse(value(timestamp));
  return Number.isFinite(at) && at < KIMI_K2_8_ROLLOUT_AT
    ? "kimi-k2.7-code"
    : "kimi-k2.8-preview";
}

export function canonicalUsageModel(identity: UsageModelIdentity): string {
  const stored = value(identity.modelCanonical);
  const raw = value(identity.model).toLowerCase();
  const slug = raw.startsWith("kimi-code/") ? raw.slice("kimi-code/".length) : raw;
  const timestamp = identity.timestamp ?? identity.bucketStart;
  const hasTimestamp = timestamp instanceof Date
    ? Number.isFinite(timestamp.getTime())
    : Number.isFinite(Date.parse(value(timestamp)));
  if (stored && !(slug === "kimi-for-coding" && hasTimestamp)) return stored;
  const kimiContext = value(identity.source) === "kimi-code"
    || /kimi|moonshot/i.test(value(identity.modelProvider))
    || slug.startsWith("kimi-")
    || ["k3", "k3-256", "k3-256k"].includes(slug);
  return kimiContext
    ? temporalKimiAlias(slug, timestamp) ?? KIMI_ALIASES.get(slug) ?? raw
    : raw;
}

export function usageModelDisplayName(identity: UsageModelIdentity): string {
  const raw = value(identity.model) || "unknown";
  const canonical = canonicalUsageModel(identity);
  return MODEL_LABELS.get(canonical) ?? raw;
}

export function usageModelDetail(identity: UsageModelIdentity): string {
  const raw = value(identity.model) || "unknown";
  const canonical = canonicalUsageModel(identity);
  const provider = value(identity.modelProvider);
  const parts = [raw];
  if (canonical && canonical !== raw) parts.push(`canonical: ${canonical}`);
  if (provider) parts.push(`provider: ${provider}`);
  return parts.join(" · ");
}
