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
  assert.equal(USAGE_PRICE_CATALOG.revision, 5);
  assert.equal(USAGE_PRICE_CATALOG.catalogVersion, "2026-09-14");
  assert.equal(USAGE_PRICE_CATALOG.publishedAt, "2026-09-14T00:00:00.000Z");
  assert.equal(USAGE_PRICE_CATALOG.entries.length, 115);
  assert.equal(
    USAGE_PRICE_CATALOG.integrity.digest,
    "c9f864827d769beba80d5a7b668b1f777680d258e2dee54d118fbc6939038b6d",
  );
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

test("OpenCode-only prices do not leak into other Agent sources", async () => {
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
