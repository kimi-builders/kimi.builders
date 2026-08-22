/* Versioned price catalog. The community API and on-site cost estimates
   share one canonical catalog; the usage_model_prices table stays for
   migration history and audit, no longer the single runtime source of truth.
   Matching: exact beats prefix; longest prefix wins; at equal length a
   source-scoped row beats a generic one; the [effective_from, effective_to)
   window prices by bucket time — never today's price for history.
   Fallback chain: cacheWrite NULL -> input price (Moonshot/OpenAI bill no
   separate cache write); reasoning NULL -> output price (OpenAI/Moonshot
   count reasoning into output); cacheRead NULL -> category unpriced, tokens
   still counted but excluded from cost (model marked partial). */
import type mysql from "mysql2/promise";
import { USAGE_PRICE_CATALOG } from "./price-catalog";

export interface UsageModelPrice {
  modelPattern: string;
  matchKind: "exact" | "prefix";
  source: string | null;
  contextTier: string;
  processingTier: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  inputPerMtok: number;
  cacheWritePerMtok: number | null;
  cacheWrite5mPerMtok: number | null;
  cacheWrite1hPerMtok: number | null;
  cacheReadPerMtok: number | null;
  outputPerMtok: number;
  reasoningPerMtok: number | null;
  version: string;
  pricingSourceUrl: string;
  verifiedAt: string | null;
  pricingBasis: string;
}

export interface UsageTokenBreakdown {
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  /* Partitions of cacheWriteInputTokens; excluded from observed-token totals. */
  cacheWrite5mInputTokens?: number;
  cacheWrite1hInputTokens?: number;
}

export type UsagePriceStatus = "priced" | "partial" | "unpriced";

export interface UsagePriceEstimate {
  /* Micro-dollars. Always 0 when unpriced — show it together with the
     status; a 0 is never "free". */
  micros: number;
  status: UsagePriceStatus;
  version: string | null;
  /* Token coverage is category-aware: a partial model can have priced input
     tokens and unpriced cache-read tokens in the same row. */
  pricedTokens: number;
  unpricedTokens: number;
  assumedTokens: number;
  assumptions: string[];
}

function rate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadModelPrices(
  db?: Pick<mysql.Pool, "query">,
): Promise<UsageModelPrice[]> {
  void db;
  return USAGE_PRICE_CATALOG.entries.map((entry) => ({
    modelPattern: entry.pattern,
    matchKind: entry.match,
    source: entry.source,
    contextTier: entry.contextTier,
    processingTier: entry.processingTier,
    effectiveFrom: new Date(entry.effectiveFrom),
    effectiveTo: entry.effectiveTo === null ? null : new Date(entry.effectiveTo),
    inputPerMtok: Number(entry.input),
    cacheWritePerMtok: rate(entry.cacheWrite),
    cacheWrite5mPerMtok: rate(entry.cacheWrite5m),
    cacheWrite1hPerMtok: rate(entry.cacheWrite1h),
    cacheReadPerMtok: rate(entry.cacheRead),
    outputPerMtok: Number(entry.output),
    reasoningPerMtok: rate(entry.reasoning),
    version: entry.version,
    pricingSourceUrl: entry.sourceUrl,
    verifiedAt: entry.verifiedAt || null,
    pricingBasis: entry.basis,
  }));
}

/* Pick the best row effective at "at": exact > longest prefix >
   source-scoped > latest effective_from. Normalization: match as-is first,
   then retry the segment after the last slash (openrouter/moonshotai/kimi-k3
   -> kimi-k3; aggregator prefixes are the common source of that shape). */
export function matchModelPrice(
  prices: readonly UsageModelPrice[],
  model: string,
  at: Date,
  source?: string,
  contextTier?: string,
  processingTier = "standard",
): UsageModelPrice | null {
  const name = model.trim();
  if (!name) return null;
  // Phase 1/2 rows predate processing-tier collection and persist an empty
  // string. Treat that historical absence as the standard API tier; otherwise
  // switching to the canonical catalog would silently make all old rows
  // unpriced because every catalog entry names its tier explicitly.
  const resolvedProcessingTier = processingTier.trim() || "standard";
  const slash = name.lastIndexOf("/");
  const rawCandidates =
    slash > 0 && slash < name.length - 1 ? [name, name.slice(slash + 1)] : [name];
  const candidates = [...new Set(rawCandidates.flatMap((candidate) => {
    const normalized = candidate.toLowerCase().replace(/[\s_]+/g, "-");
    const claudeAlias = normalized.startsWith("claude-")
      ? normalized.replace(/-(\d+)\.(\d+)(?=-|$)/g, "-$1-$2")
      : normalized;
    return [candidate, normalized, claudeAlias];
  }))];
  for (const candidate of candidates) {
    const hit = matchExactOrPrefix(
      prices,
      candidate,
      at,
      source,
      contextTier,
      resolvedProcessingTier,
    );
    if (hit) return hit;
  }
  return null;
}

function matchExactOrPrefix(
  prices: readonly UsageModelPrice[],
  name: string,
  at: Date,
  source?: string,
  contextTier?: string,
  processingTier = "standard",
): UsageModelPrice | null {
  const inWindow = (price: UsageModelPrice) =>
    price.effectiveFrom <= at && (price.effectiveTo === null || at < price.effectiveTo);
  const sourceRank = (price: UsageModelPrice) =>
    source !== undefined && price.source === source ? 1 : 0;
  const contextRank = (price: UsageModelPrice) => {
    if (contextTier) {
      if (price.contextTier === contextTier) return 2;
      return price.contextTier === "" ? 0 : -1;
    }
    // Historical clients did not upload the request tier. Use the short row
    // as an explicit estimate, never a long-context price by accident.
    if (price.contextTier === "short") return 1;
    return price.contextTier === "" ? 0 : -1;
  };
  const exact = prices
    .filter(
      (price) =>
        price.matchKind === "exact" &&
        price.modelPattern === name &&
        inWindow(price) &&
        contextRank(price) >= 0 &&
        price.processingTier === processingTier &&
        (price.source === null || price.source === source),
    )
    .sort((a, b) => contextRank(b) - contextRank(a) || sourceRank(b) - sourceRank(a));
  if (exact.length > 0) return exact[0];
  const prefixed = prices
    .filter(
      (price) =>
        price.matchKind === "prefix" &&
        name.startsWith(price.modelPattern) &&
        inWindow(price) &&
        contextRank(price) >= 0 &&
        price.processingTier === processingTier &&
        (price.source === null || price.source === source),
    )
    .sort(
      (a, b) =>
        b.modelPattern.length - a.modelPattern.length ||
        contextRank(b) - contextRank(a) ||
        sourceRank(b) - sourceRank(a) ||
        b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
    );
  return prefixed[0] ?? null;
}

/* Display-layer FX rates (static, hand-maintained; display only — USD
   storage and cost math are unaffected). */
export const USAGE_FX_AS_OF = "2026-08-08";
export const USAGE_DISPLAY_CURRENCIES = {
  usd: { rate: 1, symbol: "$", label: "USD" },
  cny: { rate: 7.16, symbol: "¥", label: "CNY" },
} as const;
export type UsageDisplayCurrency = keyof typeof USAGE_DISPLAY_CURRENCIES;

/* Cost for one token combo. micros = tokens x per-MTok USD (units cancel).
   Any category with tokens but no rate downgrades the result to partial. */
export function estimateCostMicros(
  tokens: UsageTokenBreakdown,
  price: UsageModelPrice | null,
  contextTier?: string,
): UsagePriceEstimate {
  const totalTokens =
    tokens.inputTokens +
    tokens.cacheWriteInputTokens +
    tokens.cacheReadInputTokens +
    tokens.outputTokens +
    tokens.reasoningOutputTokens;
  if (!price) {
    return {
      micros: 0,
      status: "unpriced",
      version: null,
      pricedTokens: 0,
      unpricedTokens: totalTokens,
      assumedTokens: 0,
      assumptions: [],
    };
  }
  const cacheWrite5m = Math.max(0, tokens.cacheWrite5mInputTokens ?? 0);
  const cacheWrite1h = Math.max(0, tokens.cacheWrite1hInputTokens ?? 0);
  const unclassifiedCacheWrite = Math.max(
    0,
    tokens.cacheWriteInputTokens - cacheWrite5m - cacheWrite1h,
  );
  const legs: Array<[number, number | null]> = [
    [tokens.inputTokens, price.inputPerMtok],
    [unclassifiedCacheWrite, price.cacheWritePerMtok ?? price.inputPerMtok],
    [
      cacheWrite5m,
      price.cacheWrite5mPerMtok ?? price.cacheWritePerMtok ?? price.inputPerMtok,
    ],
    [
      cacheWrite1h,
      price.cacheWrite1hPerMtok ?? price.cacheWritePerMtok ?? price.inputPerMtok,
    ],
    [tokens.cacheReadInputTokens, price.cacheReadPerMtok],
    [tokens.outputTokens, price.outputPerMtok],
    [tokens.reasoningOutputTokens, price.reasoningPerMtok ?? price.outputPerMtok],
  ];
  let micros = 0;
  let partial = false;
  let pricedTokens = 0;
  let unpricedTokens = 0;
  const assumptions: string[] = [];
  let assumedTokens = 0;
  if (!contextTier && price.contextTier === "short") {
    assumptions.push("short-context");
    assumedTokens += totalTokens;
  }
  if (
    unclassifiedCacheWrite > 0 &&
    price.cacheWrite5mPerMtok !== null &&
    price.cacheWrite1hPerMtok !== null &&
    price.cacheWrite5mPerMtok !== price.cacheWrite1hPerMtok
  ) {
    assumptions.push("cache-write-ttl");
    assumedTokens += unclassifiedCacheWrite;
  }
  for (const [count, perMtok] of legs) {
    if (count <= 0) continue;
    if (perMtok === null) {
      partial = true;
      unpricedTokens += count;
      continue;
    }
    micros += count * perMtok;
    pricedTokens += count;
  }
  return {
    micros,
    status: partial ? "partial" : "priced",
    version: price.version,
    pricedTokens,
    unpricedTokens,
    assumedTokens: Math.min(totalTokens, assumedTokens),
    assumptions,
  };
}

/* Aggregate helper: price one (model, tokens) row and fold it into the
   priced/unpriced/partial roster. */
export interface PricingLedger {
  micros: number;
  pricedTokens: number;
  unpricedTokens: number;
  assumedTokens: number;
  versions: Set<string>;
  unpricedModels: Set<string>;
  partialModels: Set<string>;
}

export function createPricingLedger(): PricingLedger {
  return {
    micros: 0,
    pricedTokens: 0,
    unpricedTokens: 0,
    assumedTokens: 0,
    versions: new Set(),
    unpricedModels: new Set(),
    partialModels: new Set(),
  };
}

export function priceIntoLedger(
  ledger: PricingLedger,
  prices: readonly UsageModelPrice[],
  model: string,
  tokens: UsageTokenBreakdown,
  at: Date,
  source?: string,
  contextTier?: string,
  processingTier = "standard",
): UsagePriceEstimate {
  const estimate = estimateCostMicros(
    tokens,
    matchModelPrice(prices, model, at, source, contextTier, processingTier),
    contextTier,
  );
  ledger.micros += estimate.micros;
  ledger.pricedTokens += estimate.pricedTokens;
  ledger.unpricedTokens += estimate.unpricedTokens;
  ledger.assumedTokens += estimate.assumedTokens;
  if (estimate.version) ledger.versions.add(estimate.version);
  if (estimate.status === "unpriced") ledger.unpricedModels.add(model);
  if (estimate.status === "partial") ledger.partialModels.add(model);
  return estimate;
}
