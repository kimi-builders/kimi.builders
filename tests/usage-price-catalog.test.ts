import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "../app/api/public/usage-pricing/v1/catalog/route";
import {
  USAGE_PRICE_CATALOG,
  USAGE_PRICE_CATALOG_ETAG,
} from "../src/lib/usage/price-catalog";
import { loadModelPrices, matchModelPrice } from "../src/lib/usage/pricing";

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
