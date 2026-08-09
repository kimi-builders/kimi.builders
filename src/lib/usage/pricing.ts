/* 服务端版本化价格表(Phase 2)。
   价格只存在于服务端 usage_model_prices 表;Collector 永远不内置价格。
   匹配规则:exact 优先于 prefix;prefix 取最长命中;同长度时 source 限定行优先于通用行;
   生效窗口 [effective_from, effective_to) 按 bucket 发生时间取价,不用今日价格回算历史。
   费率回退链:cacheWrite NULL → input 价(Moonshot/OpenAI 不单收 cache 写);
   reasoning NULL → output 价(OpenAI/Moonshot 把 reasoning 计入 output 计费);
   cacheRead NULL → 该类目未定价,token 照常统计但不计入估费(模型标记 partial)。 */
import type { RowDataPacket } from "mysql2";
import type mysql from "mysql2/promise";
import { getPool } from "../db";

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
  /* 微美元。unpriced 时恒为 0 —— 调用方必须连同 status 一起展示,
     不得把 0 当作「免费」。 */
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
  const pool = db ?? getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT model_pattern, match_kind, source, context_tier, processing_tier,
            effective_from, effective_to, input_per_mtok, cache_write_per_mtok,
            cache_write_5m_per_mtok, cache_write_1h_per_mtok,
            cache_read_per_mtok, output_per_mtok, reasoning_per_mtok, version,
            pricing_source_url, verified_at, pricing_basis
     FROM usage_model_prices`,
  );
  return rows.map((row) => ({
    modelPattern: String(row.model_pattern),
    matchKind: row.match_kind === "exact" ? "exact" : "prefix",
    source: row.source === null ? null : String(row.source),
    contextTier: String(row.context_tier ?? ""),
    processingTier: String(row.processing_tier ?? "standard"),
    effectiveFrom: new Date(row.effective_from as string),
    effectiveTo: row.effective_to === null ? null : new Date(row.effective_to as string),
    inputPerMtok: Number(row.input_per_mtok),
    cacheWritePerMtok: rate(row.cache_write_per_mtok),
    cacheWrite5mPerMtok: rate(row.cache_write_5m_per_mtok),
    cacheWrite1hPerMtok: rate(row.cache_write_1h_per_mtok),
    cacheReadPerMtok: rate(row.cache_read_per_mtok),
    outputPerMtok: Number(row.output_per_mtok),
    reasoningPerMtok: rate(row.reasoning_per_mtok),
    version: String(row.version),
    pricingSourceUrl: String(row.pricing_source_url ?? ""),
    verifiedAt:
      row.verified_at === null || row.verified_at === undefined
        ? null
        : new Date(row.verified_at as string).toISOString().slice(0, 10),
    pricingBasis: String(row.pricing_basis ?? "standard-api"),
  }));
}

/* 在 at 时刻生效的行里挑最优:exact > 最长 prefix > source 限定 > 最新 effective_from。
   归一化:先按原样匹配;未命中再试最后一个 / 之后的形式
   (如 openrouter/moonshotai/kimi-k3 → kimi-k3;供应商前缀形态多见于聚合渠道)。 */
export function matchModelPrice(
  prices: readonly UsageModelPrice[],
  model: string,
  at: Date,
  source?: string,
  contextTier?: string,
): UsageModelPrice | null {
  const name = model.trim();
  if (!name) return null;
  const slash = name.lastIndexOf("/");
  const candidates =
    slash > 0 && slash < name.length - 1 ? [name, name.slice(slash + 1)] : [name];
  for (const candidate of candidates) {
    const hit = matchExactOrPrefix(prices, candidate, at, source, contextTier);
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

/* 展示层汇率(静态,手工维护;只影响展示,不改美元存储与估费口径)。 */
export const USAGE_FX_AS_OF = "2026-08-08";
export const USAGE_DISPLAY_CURRENCIES = {
  usd: { rate: 1, symbol: "$", label: "USD" },
  cny: { rate: 7.16, symbol: "¥", label: "CNY" },
} as const;
export type UsageDisplayCurrency = keyof typeof USAGE_DISPLAY_CURRENCIES;

/* 单条 token 组合的估费。micros = tokens × 每 MTok 美元价(单位恰好抵消)。
   任何一个「有 token 但无费率」的类目都会把结果降级为 partial。 */
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

/* 聚合辅助:把一条 (model, tokens) 行估费并累计到 priced/unpriced/partial 名册。 */
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
): UsagePriceEstimate {
  const estimate = estimateCostMicros(
    tokens,
    matchModelPrice(prices, model, at, source, contextTier),
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
