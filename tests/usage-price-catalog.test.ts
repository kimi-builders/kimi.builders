import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "../app/api/public/usage-pricing/v1/catalog/route";
import {
  USAGE_PRICE_CATALOG,
  USAGE_PRICE_CATALOG_ETAG,
} from "../src/lib/usage/price-catalog";
import {
  estimateCostMicros,
  loadModelPrices,
  matchModelPrice,
} from "../src/lib/usage/pricing";

test("public pricing catalog exposes a cacheable versioned contract", async () => {
  const response = await GET(new NextRequest("https://kimi.builders/api/public/usage-pricing/v1/catalog"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), USAGE_PRICE_CATALOG_ETAG);
  assert.match(response.headers.get("cache-control") || "", /s-maxage=3600/);
  const body = await response.json();
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.matcherVersion, 1);
  assert.equal(body.catalogVersion, USAGE_PRICE_CATALOG.catalogVersion);
  assert.equal(body.entries.length, USAGE_PRICE_CATALOG.entries.length);
});

test("canonical catalog is synchronized with the current Usage release", () => {
  assert.equal(USAGE_PRICE_CATALOG.revision, 7);
  assert.equal(USAGE_PRICE_CATALOG.catalogVersion, "2026-10-08");
  assert.equal(USAGE_PRICE_CATALOG.publishedAt, "2026-10-08T00:00:00.000Z");
  assert.equal(USAGE_PRICE_CATALOG.entries.length, 167);
  assert.equal(
    USAGE_PRICE_CATALOG.integrity.digest,
    "ecf9647ec7bc992ba98b5b3926614e0330c1edb6d3dfe4a298a60db9f2b4e09a",
  );
});

test("MiMo V2.6 keeps Pro, Flash, UltraSpeed and explicit Batch tariffs separate", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  for (const [model, tier, expected] of [
    ["mimo-v2.6-pro", "standard", [0.435, 0.0036, 0.87]],
    ["mimo-v2.6-flash", "standard", [0.14, 0.0028, 0.28]],
    ["mimo-v2.6-pro-ultraspeed", "standard", [4.35, 0.036, 8.7]],
    ["mimo-v2.6-pro", "batch", [0.2175, 0.0018, 0.435]],
    ["mimo-v2.6-flash", "batch", [0.07, 0.0014, 0.14]],
  ] as const) {
    const price = matchModelPrice(prices, `xiaomi/${model}`, at, "codex", undefined, tier);
    assert.deepEqual([price?.inputPerMtok, price?.cacheReadPerMtok, price?.outputPerMtok], expected);
    assert.equal(price?.cacheWritePerMtok, 0);
    assert.equal(price?.source, null);
    assert.equal(price?.pricingSourceUrl, "https://mimo.mi.com/docs/pricing");
    assert.equal(estimateCostMicros({
      inputTokens: 0, cacheWriteInputTokens: 1_000_000, cacheReadInputTokens: 0,
      outputTokens: 0, reasoningOutputTokens: 0,
    }, price).micros, 0);
  }
  assert.equal(matchModelPrice(prices, "mimo-v2.6-pro-ultraspeed", at, undefined, undefined, "batch"), null);
  assert.equal(matchModelPrice(prices, "mimo-v2.6-pro", new Date("2026-09-21T23:59:59.999Z")), null);
  assert.equal(matchModelPrice(prices, "mimo-v2.6-pro-ultraspeed-custom", at), null);
});

test("MiMo V2.5 preserves historical pricing and the announced retirement boundary", async () => {
  const prices = await loadModelPrices();
  const historical = matchModelPrice(prices, "mimo-v2.5-pro", new Date("2026-10-07T23:59:59.999Z"));
  assert.equal(historical?.cacheReadPerMtok, 0.003625);
  assert.equal(historical?.cacheWritePerMtok, null);
  const current = matchModelPrice(prices, "mimo-v2.5-pro", new Date("2026-10-08T00:00:00.000Z"));
  assert.equal(current?.cacheReadPerMtok, 0.0036);
  assert.equal(current?.cacheWritePerMtok, 0);
  for (const model of ["mimo-v2.5", "mimo-v2.5-pro"]) {
    assert.ok(matchModelPrice(prices, model, new Date("2026-10-21T01:59:59.999Z")));
    assert.equal(matchModelPrice(prices, model, new Date("2026-10-21T02:00:00.000Z")), null);
  }
});

test("StepFun estimates disclose original CNY rates and the fixed display FX", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  for (const [model, input, read, output] of [
    ["step-5-preview", 7, 0.35, 20],
    ["step-3.7-flash", 1.35, 0.27, 8.1],
    ["step-3.5-flash", 0.7, 0.14, 2.1],
    ["step-3.5-flash-2603", 0.7, 0.14, 2.1],
    ["step-1o-turbo-vision", 2.5, 0.5, 8],
  ] as const) {
    const price = matchModelPrice(prices, `stepfun/${model}`, at, "opencode");
    assert.ok(price, model);
    assert.ok(Math.abs(price.inputPerMtok * 7.16 - input) < 1e-10);
    assert.ok(Math.abs((price.cacheReadPerMtok ?? 0) * 7.16 - read) < 1e-10);
    assert.ok(Math.abs(price.outputPerMtok * 7.16 - output) < 1e-10);
    assert.equal(price.cacheWritePerMtok, price.inputPerMtok);
    assert.equal(price.source, null);
    assert.equal(price.provisional, true);
    assert.match(price.pricingNote?.zh ?? "", /官方人民币价.*固定显示汇率.*2026-08-08/);
    assert.match(price.pricingNote?.en ?? "", /Official CNY rates.*not an official USD quote/);
    assert.equal(price.pricingSourceUrl, "https://platform.stepfun.com/docs/zh/guides/pricing/details");
    const estimate = estimateCostMicros({
      inputTokens: 1_000_000, cacheWriteInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000, reasoningOutputTokens: 1_000_000,
    }, price);
    assert.equal(estimate.status, "priced");
    assert.ok(Math.abs(estimate.micros - ((input * 2 + read + output * 2) / 7.16) * 1_000_000) < 0.00001);
    assert.ok(estimate.assumptions.includes("provisional-price"));
    assert.equal(estimate.assumedTokens, 5_000_000);
    assert.equal(matchModelPrice(prices, model, new Date("2026-10-07T23:59:59.999Z")), null);
  }
});

test("StepFun previews are exact limited-free IDs, not a catch-all for older or non-token services", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  for (const model of ["stepaudio-3-realtime-preview", "stepaudio-3-chat-preview"]) {
    const price = matchModelPrice(prices, model, at);
    assert.equal(price?.provisional, true);
    assert.match(price?.pricingNote?.en ?? "", /limited-time free.*exact preview ID/);
    assert.deepEqual([price?.inputPerMtok, price?.cacheReadPerMtok, price?.outputPerMtok], [0, 0, 0]);
    const estimate = estimateCostMicros({
      inputTokens: 1_000_000, cacheWriteInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000, reasoningOutputTokens: 1_000_000,
    }, price);
    assert.equal(estimate.status, "priced");
    assert.equal(estimate.micros, 0);
  }
  for (const model of [
    "step-2", "step-3.5-flash-custom", "stepaudio-2.5-chat", "stepaudio-3-chat",
    "stepaudio-3-tts", "stepaudio-3-asr-max", "stepaudio-3-gen-preview", "step-2x-large",
  ]) assert.equal(matchModelPrice(prices, model, at), null, model);
});

test("previous catalog revision ETags cannot mask the MiMo and StepFun update", async () => {
  const response = await GET(new NextRequest(
    "https://kimi.builders/api/public/usage-pricing/v1/catalog",
    { headers: { "If-None-Match": '"sha256-68422f74682967c3f0e09a0bae9a77e1c8779270c9a6e2b1758d094441a7e8ec"' } },
  ));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 7);
});

test("public pricing catalog honors If-None-Match", async () => {
  const response = await GET(new NextRequest(
    "https://kimi.builders/api/public/usage-pricing/v1/catalog",
    { headers: { "If-None-Match": USAGE_PRICE_CATALOG_ETAG } },
  ));
  assert.equal(response.status, 304);
  assert.equal(await response.text(), "");
});

test("site pricing uses the canonical catalog and processing tier", async () => {
  const prices = await loadModelPrices();
  assert.equal(prices.length, USAGE_PRICE_CATALOG.entries.length);
  const at = new Date("2026-08-19T12:00:00.000Z");
  assert.equal(
    matchModelPrice(prices, "deepseek-v4-pro", at, undefined, undefined, "peak")?.inputPerMtok,
    1.32,
  );
  assert.equal(
    matchModelPrice(prices, "deepseek-v4-pro", at, undefined, undefined, "off-peak")?.inputPerMtok,
    0.66,
  );
  assert.equal(
    matchModelPrice(prices, "Claude Opus 4.8", at)?.modelPattern,
    "claude-opus-4-8",
  );
});

test("canonical catalog keeps Codex auto-review priced after the revision boundary", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-08-20T12:00:00.000Z");
  const matched = matchModelPrice(
    prices,
    "codex-auto-review",
    at,
    "codex",
    undefined,
    "",
  );
  assert.equal(matched?.inputPerMtok, 2.5);
  assert.equal(matched?.cacheReadPerMtok, 0.25);
  assert.equal(matched?.outputPerMtok, 15);
  assert.equal(matched?.effectiveTo, null);
  assert.equal(
    matchModelPrice(prices, "codex-auto-review", at, "claude-code"),
    null,
  );
});

test("canonical catalog exposes the provisional Kimi K2.8 Preview estimate", async () => {
  const prices = await loadModelPrices();
  const matched = matchModelPrice(
    prices,
    "kimi-k2.8-preview",
    new Date("2026-09-12T12:00:00.000Z"),
    "kimi-code",
  );
  assert.deepEqual(
    [matched?.inputPerMtok, matched?.cacheReadPerMtok, matched?.cacheWritePerMtok, matched?.outputPerMtok],
    [1.9, 0.38, null, 8],
  );
  assert.equal(matched?.provisional, true);
  const estimate = estimateCostMicros({
    inputTokens: 0,
    cacheWriteInputTokens: 1_000_000,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  }, matched);
  assert.equal(estimate.micros, 1_900_000);
});

test("canonical catalog covers the 2026-09-06 provider additions and windows", async () => {
  const prices = await loadModelPrices();
  const current = new Date("2026-09-05T12:00:00.000Z");

  const astra = matchModelPrice(prices, "gpt-6-astra", current, "codex");
  assert.deepEqual(
    [astra?.inputPerMtok, astra?.cacheReadPerMtok, astra?.cacheWritePerMtok, astra?.outputPerMtok],
    [10, 1, 12.5, 50],
  );
  const astraLong = matchModelPrice(prices, "gpt-6-astra", current, "codex", "long");
  assert.deepEqual(
    [astraLong?.inputPerMtok, astraLong?.cacheReadPerMtok, astraLong?.outputPerMtok],
    [20, 2, 75],
  );
  const sol = matchModelPrice(prices, "gpt-5.6-sol", current, "codex", "short");
  assert.deepEqual(
    [sol?.inputPerMtok, sol?.cacheReadPerMtok, sol?.cacheWritePerMtok, sol?.outputPerMtok],
    [4, 0.4, 5, 20],
  );
  const fable = matchModelPrice(prices, "claude-fable-5-1", current, "claude-code");
  assert.deepEqual(
    [fable?.inputPerMtok, fable?.cacheReadPerMtok, fable?.cacheWritePerMtok, fable?.outputPerMtok],
    [10, 0.25, 12.5, 50],
  );
  const grokLong = matchModelPrice(prices, "grok-4.5", current, "grok", "long");
  assert.deepEqual(
    [grokLong?.inputPerMtok, grokLong?.cacheReadPerMtok, grokLong?.outputPerMtok],
    [4, 0.6, 12],
  );

  const geminiPromotion = matchModelPrice(
    prices,
    "gemini-3.8-flash",
    new Date("2026-09-03T12:00:00.000Z"),
    "antigravity",
  );
  assert.deepEqual(
    [geminiPromotion?.inputPerMtok, geminiPromotion?.cacheReadPerMtok, geminiPromotion?.outputPerMtok],
    [0.75, 0.075, 3.75],
  );
  const geminiStandard = matchModelPrice(
    prices,
    "gemini-3.8-flash",
    new Date("2027-01-01T00:00:00.000Z"),
    "antigravity",
  );
  assert.deepEqual(
    [geminiStandard?.inputPerMtok, geminiStandard?.cacheReadPerMtok, geminiStandard?.outputPerMtok],
    [1.5, 0.15, 7.5],
  );
});

test("historical OpenCode-only prices do not leak into other Agent sources", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-09-05T12:00:00.000Z");
  for (const [model, expectedInput] of [
    ["muse-spark-1.3", 1.25],
    ["deepseek-v4-flash-vision-exp", 0.14],
    ["glm-5.3-flash", 0.15],
  ] as const) {
    const matched = matchModelPrice(prices, model, at, "opencode");
    assert.equal(matched?.modelPattern, model);
    assert.equal(matched?.inputPerMtok, expectedInput);
    assert.equal(matched?.source, "opencode");
    assert.equal(matchModelPrice(prices, model, at, "codex"), null);
  }
});

test("current OpenAI models have separate short and long context prices", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  for (const [model, tier, expected] of [
    ["gpt-6.1-sol", "short", [2, 0.1, 2.5, 10]],
    ["gpt-6.1-sol", "long", [4, 0.2, 5, 15]],
    ["gpt-6-sol", "short", [2, 0.2, 2.5, 10]],
    ["gpt-6-sol", "long", [4, 0.4, 5, 15]],
    ["gpt-6-luna", "short", [0.1, 0.01, 0.125, 0.5]],
    ["gpt-6-luna", "long", [0.2, 0.02, 0.25, 0.75]],
  ] as const) {
    const matched = matchModelPrice(prices, `openai/${model}`, at, "codex", tier);
    assert.equal(matched?.modelPattern, model);
    assert.deepEqual(
      [matched?.inputPerMtok, matched?.cacheReadPerMtok, matched?.cacheWritePerMtok, matched?.outputPerMtok],
      expected,
    );
  }
  assert.equal(
    matchModelPrice(prices, "gpt-6.1-sol-2026-09-29", at, "codex")?.modelPattern,
    "gpt-6.1-sol",
  );
  const estimate = estimateCostMicros({
    inputTokens: 1_000_000, cacheWriteInputTokens: 0, cacheReadInputTokens: 0,
    outputTokens: 0, reasoningOutputTokens: 0,
  }, matchModelPrice(prices, "gpt-6-luna", at));
  assert.equal(estimate.micros, 100_000);
  assert.deepEqual(estimate.assumptions, ["short-context"]);
});

test("Sonnet cache-read reduction preserves historical rates across Agent tools", async () => {
  const prices = await loadModelPrices();
  const before = new Date("2026-10-06T23:59:59.999Z");
  const after = new Date("2026-10-07T00:00:00.000Z");
  assert.equal(matchModelPrice(prices, "Claude Sonnet 5.5", before)?.cacheReadPerMtok, 0.2);
  const matched = matchModelPrice(prices, "claude-sonnet-5-5", after, "claude-code");
  assert.deepEqual(
    [matched?.inputPerMtok, matched?.cacheReadPerMtok, matched?.cacheWrite5mPerMtok, matched?.cacheWrite1hPerMtok, matched?.outputPerMtok],
    [2, 0.1, 2.5, 4, 10],
  );
  const current = new Date("2026-10-08T12:00:00.000Z");
  assert.equal(matchModelPrice(prices, "claude-sonnet-5-5", current, "opencode")?.cacheReadPerMtok, 0.1);
  assert.equal(matchModelPrice(prices, "claude-sonnet-5-5", current, "claude-code")?.cacheReadPerMtok, 0.1);
});

test("Claude 5.5 rates include Haiku context tiers and cache-write TTLs", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  for (const [model, tier, expected] of [
    ["claude-opus-5-5", undefined, [4, 0.2, 5, 8, 20]],
    ["claude-haiku-5-5", "short", [0.1, 0.01, 0.125, 0.2, 0.5]],
    ["claude-haiku-5-5", "long", [0.5, 0.05, 0.625, 1, 2.5]],
  ] as const) {
    const matched = matchModelPrice(prices, model, at, "claude-code", tier);
    assert.deepEqual(
      [matched?.inputPerMtok, matched?.cacheReadPerMtok, matched?.cacheWrite5mPerMtok, matched?.cacheWrite1hPerMtok, matched?.outputPerMtok],
      expected,
    );
    assert.equal(matched?.modelPattern, model);
  }
});

test("DeepSeek Flash API aliases adopt the new rates without overwriting old buckets", async () => {
  const prices = await loadModelPrices();
  const before = new Date("2026-09-09T23:59:59.999Z");
  const after = new Date("2026-09-10T00:00:00.000Z");
  assert.equal(matchModelPrice(prices, "deepseek-v4-flash", before)?.inputPerMtok, 0.44);
  assert.equal(matchModelPrice(prices, "deepseek-v4-flash", before, undefined, undefined, "off-peak")?.inputPerMtok, 0.22);
  for (const model of ["deepseek-flash", "deepseek-v4.1-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]) {
    const peak = matchModelPrice(prices, model, after, "claude-code", undefined, "peak");
    const offPeak = matchModelPrice(prices, model, after, "claude-code", undefined, "off-peak");
    assert.deepEqual([peak?.inputPerMtok, peak?.cacheReadPerMtok, peak?.outputPerMtok], [0.3, 0.006, 1.2]);
    assert.deepEqual([offPeak?.inputPerMtok, offPeak?.cacheReadPerMtok, offPeak?.outputPerMtok], [0.15, 0.003, 0.6]);
    assert.equal(matchModelPrice(prices, model, after)?.inputPerMtok, 0.3);
  }
  const current = new Date("2026-10-08T12:00:00.000Z");
  assert.equal(matchModelPrice(prices, "deepseek-v4-flash", current, "opencode")?.inputPerMtok, 0.3);
  assert.equal(matchModelPrice(prices, "deepseek-v4-flash-vision-exp", current, "opencode")?.inputPerMtok, 0.14);
  assert.equal(matchModelPrice(prices, "deepseek-v4-pro", current)?.inputPerMtok, 1.32);
});

test("Kimi highspeed and TTL pricing no longer inherit the base Code rate", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  const highspeed = matchModelPrice(prices, "kimi-k2.7-code-highspeed", at, "kimi-code");
  assert.equal(highspeed?.modelPattern, "kimi-k2.7-code-highspeed");
  assert.deepEqual([highspeed?.inputPerMtok, highspeed?.cacheReadPerMtok, highspeed?.outputPerMtok], [1.9, 0.38, 8]);
  assert.equal(matchModelPrice(prices, "kimi-k2.7-code", at)?.inputPerMtok, 0.95);
  for (const model of ["kimi-k3", "kimi-k2.8-preview"]) {
    const matched = matchModelPrice(prices, model, at);
    assert.deepEqual([matched?.cacheWritePerMtok, matched?.cacheWrite5mPerMtok, matched?.cacheWrite1hPerMtok], [3, 3, 6]);
    const estimate = estimateCostMicros({
      inputTokens: 0, cacheWriteInputTokens: 1_000_000, cacheWrite1hInputTokens: 1_000_000,
      cacheReadInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0,
    }, matched);
    assert.equal(estimate.micros, 6_000_000);
    assert.equal(estimate.assumptions.includes("provisional-price"), model === "kimi-k2.8-preview");
    const unknownTtl = estimateCostMicros({
      inputTokens: 0, cacheWriteInputTokens: 1_000_000,
      cacheReadInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0,
    }, matched);
    assert.equal(unknownTtl.micros, 3_000_000);
    assert.ok(unknownTtl.assumptions.includes("cache-write-ttl"));
  }
});

test("current Grok GLM and MiniMax variants select their own rate rows", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  for (const [model, tier, processingTier, expected] of [
    ["grok-4.7", "short", "standard", [2, 0.5, 6]],
    ["grok-4.7", "long", "standard", [4, 1, 12]],
    ["glm-5.3-flash", undefined, "standard", [0.15, 0.03, 0.5]],
    ["glm-5.3-flashx", undefined, "standard", [0.37, 0.075, 1.25]],
    ["minimax-m3", "short", "standard", [0.3, 0.06, 1.2]],
    ["minimax-m3", "long", "standard", [0.6, 0.12, 2.4]],
    ["minimax-m3", "short", "priority", [0.45, 0.09, 1.8]],
    ["minimax-m3", "long", "priority", [0.9, 0.18, 3.6]],
    ["minimax-m2.7-highspeed", undefined, "standard", [0.6, 0.06, 2.4]],
    ["minimax-m2.5-highspeed", undefined, "standard", [0.6, 0.03, 2.4]],
  ] as const) {
    const matched = matchModelPrice(prices, model, at, "claude-code", tier, processingTier);
    assert.equal(matched?.modelPattern, model);
    assert.deepEqual([matched?.inputPerMtok, matched?.cacheReadPerMtok, matched?.outputPerMtok], expected);
  }
  assert.equal(matchModelPrice(prices, "minimax-m2.5", at)?.cacheReadPerMtok, 0.03);
  assert.equal(matchModelPrice(prices, "minimax-m2.5", new Date("2026-10-07T23:59:59.999Z"))?.cacheReadPerMtok, 0.06);
});

test("Qwen Flash leaves unverified cache reads unpriced without inferring a provider from an Agent tool", async () => {
  const prices = await loadModelPrices();
  const at = new Date("2026-10-08T12:00:00.000Z");
  const global = matchModelPrice(prices, "qwen3.8-flash", at, "claude-code");
  const opencode = matchModelPrice(prices, "qwen3.8-flash", at, "opencode");
  assert.deepEqual([global?.inputPerMtok, global?.cacheReadPerMtok, global?.cacheWritePerMtok, global?.outputPerMtok], [0.113, null, 0.14125, 0.382]);
  assert.deepEqual(opencode, global);
  const estimate = estimateCostMicros({
    inputTokens: 0, cacheWriteInputTokens: 0, cacheReadInputTokens: 1_000_000,
    outputTokens: 0, reasoningOutputTokens: 0,
  }, global);
  assert.equal(estimate.status, "partial");
  assert.equal(estimate.micros, 0);
  assert.equal(estimate.unpricedTokens, 1_000_000);
});

test("catalog windows do not overlap for the same model source and pricing tier", () => {
  const windows = new Map<string, typeof USAGE_PRICE_CATALOG.entries>();
  for (const entry of USAGE_PRICE_CATALOG.entries) {
    const key = JSON.stringify([entry.pattern, entry.match, entry.source, entry.contextTier, entry.processingTier]);
    const group = windows.get(key) ?? [];
    group.push(entry);
    windows.set(key, group);
  }
  for (const [key, group] of windows) {
    group.sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom));
    for (let i = 1; i < group.length; i++) {
      assert.ok(group[i - 1].effectiveTo, `Unbounded historical window: ${key}`);
      assert.ok(Date.parse(group[i - 1].effectiveTo!) <= Date.parse(group[i].effectiveFrom), `Overlapping windows: ${key}`);
    }
  }
});

test("old catalog ETags receive the new revision instead of a false 304", async () => {
  const response = await GET(new NextRequest(
    "https://kimi.builders/api/public/usage-pricing/v1/catalog",
    { headers: { "If-None-Match": '"sha256-c9f864827d769beba80d5a7b668b1f777680d258e2dee54d118fbc6939038b6d"' } },
  ));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), USAGE_PRICE_CATALOG_ETAG);
  const body = await response.json();
  assert.equal(body.revision, 7);
});
