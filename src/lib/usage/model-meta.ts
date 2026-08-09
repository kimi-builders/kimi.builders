export interface UsageModelIdentity {
  source?: unknown;
  model?: unknown;
  modelCanonical?: unknown;
  modelProvider?: unknown;
}

const KIMI_ALIASES = new Map([
  ["k3", "kimi-k3"],
  ["kimi-k3", "kimi-k3"],
  ["k3-256", "kimi-k3-256k"],
  ["k3-256k", "kimi-k3-256k"],
  ["kimi-k3-256k", "kimi-k3-256k"],
  ["kimi-for-coding", "kimi-k2.7-code"],
  ["kimi-for-coding-highspeed", "kimi-k2.7-code-highspeed"],
  ["kimi-k2.7-code", "kimi-k2.7-code"],
  ["kimi-k2.7-code-highspeed", "kimi-k2.7-code-highspeed"],
  ["kimi-k2.6", "kimi-k2.6"],
  ["kimi-k2.5", "kimi-k2.5"],
]);

const MODEL_LABELS = new Map([
  ["kimi-k3", "Kimi K3"],
  ["kimi-k3-256k", "Kimi K3 256K"],
  ["kimi-k2.7-code", "Kimi K2.7 Code"],
  ["kimi-k2.7-code-highspeed", "Kimi K2.7 Code Highspeed"],
  ["kimi-k2.6", "Kimi K2.6"],
  ["kimi-k2.5", "Kimi K2.5"],
]);

function value(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

export function canonicalUsageModel(identity: UsageModelIdentity): string {
  const stored = value(identity.modelCanonical);
  if (stored) return stored;
  const raw = value(identity.model).toLowerCase();
  const slug = raw.startsWith("kimi-code/") ? raw.slice("kimi-code/".length) : raw;
  const kimiContext = value(identity.source) === "kimi-code"
    || /kimi|moonshot/i.test(value(identity.modelProvider))
    || slug.startsWith("kimi-")
    || ["k3", "k3-256", "k3-256k"].includes(slug);
  return kimiContext ? KIMI_ALIASES.get(slug) ?? raw : raw;
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
