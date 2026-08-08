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
  effectiveFrom: Date;
  effectiveTo: Date | null;
  inputPerMtok: number;
  cacheWritePerMtok: number | null;
  cacheReadPerMtok: number | null;
  outputPerMtok: number;
  reasoningPerMtok: number | null;
  version: string;
}

export interface UsageTokenBreakdown {
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export type UsagePriceStatus = "priced" | "partial" | "unpriced";

export interface UsagePriceEstimate {
  /* 微美元。unpriced 时恒为 0 —— 调用方必须连同 status 一起展示,
     不得把 0 当作「免费」。 */
  micros: number;
  status: UsagePriceStatus;
  version: string | null;
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
    `SELECT model_pattern, match_kind, source, effective_from, effective_to,
            input_per_mtok, cache_write_per_mtok, cache_read_per_mtok,
            output_per_mtok, reasoning_per_mtok, version
     FROM usage_model_prices`,
  );
  return rows.map((row) => ({
    modelPattern: String(row.model_pattern),
    matchKind: row.match_kind === "exact" ? "exact" : "prefix",
    source: row.source === null ? null : String(row.source),
    effectiveFrom: new Date(row.effective_from as string),
    effectiveTo: row.effective_to === null ? null : new Date(row.effective_to as string),
    inputPerMtok: Number(row.input_per_mtok),
    cacheWritePerMtok: rate(row.cache_write_per_mtok),
    cacheReadPerMtok: rate(row.cache_read_per_mtok),
    outputPerMtok: Number(row.output_per_mtok),
    reasoningPerMtok: rate(row.reasoning_per_mtok),
    version: String(row.version),
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
): UsageModelPrice | null {
  const name = model.trim();
  if (!name) return null;
  const slash = name.lastIndexOf("/");
  const candidates =
    slash > 0 && slash < name.length - 1 ? [name, name.slice(slash + 1)] : [name];
  for (const candidate of candidates) {
    const hit = matchExactOrPrefix(prices, candidate, at, source);
    if (hit) return hit;
  }
  return null;
}

function matchExactOrPrefix(
  prices: readonly UsageModelPrice[],
  name: string,
  at: Date,
  source?: string,
): UsageModelPrice | null {
  const inWindow = (price: UsageModelPrice) =>
    price.effectiveFrom <= at && (price.effectiveTo === null || at < price.effectiveTo);
  const sourceRank = (price: UsageModelPrice) =>
    source !== undefined && price.source === source ? 1 : 0;
  const exact = prices
    .filter(
      (price) =>
        price.matchKind === "exact" &&
        price.modelPattern === name &&
        inWindow(price) &&
        (price.source === null || price.source === source),
    )
    .sort((a, b) => sourceRank(b) - sourceRank(a));
  if (exact.length > 0) return exact[0];
  const prefixed = prices
    .filter(
      (price) =>
        price.matchKind === "prefix" &&
        name.startsWith(price.modelPattern) &&
        inWindow(price) &&
        (price.source === null || price.source === source),
    )
    .sort(
      (a, b) =>
        b.modelPattern.length - a.modelPattern.length ||
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
): UsagePriceEstimate {
  if (!price) return { micros: 0, status: "unpriced", version: null };
  const legs: Array<[number, number | null]> = [
    [tokens.inputTokens, price.inputPerMtok],
    [tokens.cacheWriteInputTokens, price.cacheWritePerMtok ?? price.inputPerMtok],
    [tokens.cacheReadInputTokens, price.cacheReadPerMtok],
    [tokens.outputTokens, price.outputPerMtok],
    [tokens.reasoningOutputTokens, price.reasoningPerMtok ?? price.outputPerMtok],
  ];
  let micros = 0;
  let partial = false;
  for (const [count, perMtok] of legs) {
    if (count <= 0) continue;
    if (perMtok === null) {
      partial = true;
      continue;
    }
    micros += count * perMtok;
  }
  return {
    micros,
    status: partial ? "partial" : "priced",
    version: price.version,
  };
}

/* 聚合辅助:把一条 (model, tokens) 行估费并累计到 priced/unpriced/partial 名册。 */
export interface PricingLedger {
  micros: number;
  versions: Set<string>;
  unpricedModels: Set<string>;
  partialModels: Set<string>;
}

export function createPricingLedger(): PricingLedger {
  return {
    micros: 0,
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
): void {
  const estimate = estimateCostMicros(tokens, matchModelPrice(prices, model, at, source));
  ledger.micros += estimate.micros;
  if (estimate.version) ledger.versions.add(estimate.version);
  if (estimate.status === "unpriced") ledger.unpricedModels.add(model);
  if (estimate.status === "partial") ledger.partialModels.add(model);
}
