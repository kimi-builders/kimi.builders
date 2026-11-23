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
  ["k3.1-pro", "kimi-k3.1-pro"],
  ["kimi-k3.1-pro", "kimi-k3.1-pro"],
  ["k3.1-pro-highspeed", "kimi-k3.1-pro-highspeed"],
  ["kimi-k3.1-pro-highspeed", "kimi-k3.1-pro-highspeed"],
  ["k3-256", "kimi-k3-256k"],
  ["k3-256k", "kimi-k3-256k"],
  ["kimi-k3-256k", "kimi-k3-256k"],
  ["kimi-for-coding", "kimi-k2.8-preview"],
  ["kimi-for-coding-highspeed", "kimi-k2.7-code-highspeed"],
  ["kimi-k2.8-preview", "kimi-k2.8-preview"],
  ["kimi-k2.7-code", "kimi-k2.7-code"],
  ["kimi-k2.7-code-highspeed", "kimi-k2.7-code-highspeed"],
  ["kimi-k2.6", "kimi-k2.6"],
  ["kimi-k2.5", "kimi-k2.5"],
]);

const MODEL_LABELS = new Map([
  ["mimo-v2.6-pro", "MiMo V2.6 Pro"],
  ["mimo-v2.6-flash", "MiMo V2.6 Flash"],
  ["mimo-v2.6-pro-ultraspeed", "MiMo V2.6 Pro UltraSpeed"],
  ["step-5-preview", "Step 5 Preview"],
  ["step-3.7-flash", "Step 3.7 Flash"],
  ["step-3.5-flash", "Step 3.5 Flash"],
  ["step-3.5-flash-2603", "Step 3.5 Flash 2603"],
  ["step-1o-turbo-vision", "Step 1o Turbo Vision"],
  ["stepaudio-3-realtime-preview", "StepAudio 3 Realtime Preview"],
  ["stepaudio-3-chat-preview", "StepAudio 3 Chat Preview"],
  ["gpt-6.2-astra", "GPT-6.2 Astra"],
  ["gpt-6.2-sol", "GPT-6.2 Sol"],
  ["gpt-6.1-sol", "GPT-6.1 Sol"],
  ["gpt-6.1-terra", "GPT-6.1 Terra"],
  ["gemini-4-argon", "Gemini 4 Argon"],
  ["gemini-4-carbon", "Gemini 4 Carbon"],
  ["gemini-4-hydrogen", "Gemini 4 Hydrogen"],
  ["gemini-4-neon", "Gemini 4 Neon"],
  ["gemini-3.6-flash", "Gemini 3.6 Flash"],
  ["gpt-6-sol", "GPT-6 Sol"],
  ["gpt-6-luna", "GPT-6 Luna"],
  ["claude-opus-5-5", "Claude Opus 5.5"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5"],
  ["claude-haiku-5-5", "Claude Haiku 5.5"],
  ["claude-fable-5-2", "Claude Fable 5.2"],
  ["claude-mythos-5-2", "Claude Mythos 5.2"],
  ["deepseek-flash", "DeepSeek V4.1 Flash"],
  ["deepseek-v4.1-flash", "DeepSeek V4.1 Flash"],
  ["grok-4.7", "Grok 4.7"],
  ["glm-5.3-flash", "GLM-5.3 Flash"],
  ["glm-5.3-flashx", "GLM-5.3 FlashX"],
  ["qwen3.8-flash", "Qwen3.8 Flash"],
  ["minimax-m2.7-highspeed", "MiniMax M2.7 Highspeed"],
  ["minimax-m3.1-flash", "MiniMax M3.1 Flash"],
  ["minimax-m2.5-highspeed", "MiniMax M2.5 Highspeed"],
  ["kimi-k3", "Kimi K3"],
  ["kimi-k3.1-pro", "Kimi K3.1 Pro"],
  ["kimi-k3.1-pro-highspeed", "Kimi K3.1 Pro Highspeed"],
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

// A user-defined profile or gateway is not part of the model identifier.
export function modelLeaf(model: unknown): string {
  const name = value(model);
  return name.slice(name.lastIndexOf("/") + 1).trim();
}

export function normalizedModelLeaf(model: string): string {
  const leaf = modelLeaf(model).toLowerCase().replace(/[\s_]+/g, "-");
  return leaf.startsWith("claude-")
    ? leaf.replace(/-(\d+)\.(\d+)(?=-|$)/g, "-$1-$2")
    : leaf;
}

function temporalKimiAlias(slug: string, timestamp: unknown): string | null {
  if (slug !== "kimi-for-coding") return null;
  const at = timestamp instanceof Date ? timestamp.getTime() : Date.parse(value(timestamp));
  if (!Number.isFinite(at)) return null;
  return at < KIMI_K2_8_ROLLOUT_AT ? "kimi-k2.7-code" : "kimi-k2.8-preview";
}

export function canonicalUsageModel(identity: UsageModelIdentity): string {
  const stored = value(identity.modelCanonical);
  const raw = value(identity.model).toLowerCase();
  const rawSlug = modelLeaf(raw);
  const slug = stored ? modelLeaf(stored).toLowerCase() : rawSlug;
  return temporalKimiAlias(rawSlug === "kimi-for-coding" ? rawSlug : slug, identity.timestamp ?? identity.bucketStart)
    ?? KIMI_ALIASES.get(slug) ?? (stored || raw);
}

export function usageModelDisplayName(identity: UsageModelIdentity): string {
  const raw = value(identity.model) || "unknown";
  const canonical = canonicalUsageModel(identity);
  return MODEL_LABELS.get(normalizedModelLeaf(canonical)) ?? raw;
}

/* Vendor marks describe the model family, never the Agent or API reseller. */
export function usageModelIconId(identity: UsageModelIdentity): string {
  const id = normalizedModelLeaf(canonicalUsageModel(identity));
  if (id.startsWith("kimi-") || ["k3", "k3-256", "k3-256k"].includes(id)) return "kimi";
  if (id.startsWith("claude-")) return "claude";
  if (id.startsWith("gpt-") || id.startsWith("codex-") || /^o\d(?:-|$)/.test(id)) return "openai";
  if (id.startsWith("gemini-")) return "gemini";
  if (id.startsWith("deepseek-")) return "deepseek";
  if (/^qwen(?:-|\d)/.test(id)) return "qwen";
  if (id.startsWith("grok-")) return "grok";
  if (id.startsWith("minimax-")) return "minimax";
  if (id.startsWith("glm-")) return "glm";
  if (id.startsWith("doubao")) return "doubao";
  if (id.startsWith("ernie") || id.startsWith("wenxin")) return "wenxin";
  if (/^mimo-v\d/.test(id)) return "xiaomimimo";
  if (/^(?:step-(?:\d|audio-|tts-|asr|image-)|stepaudio-\d)/.test(id)) return "stepfun";
  return "";
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
