/* Phase 2 单元测试:价格匹配/估费、筛选解析、CSV 导出防护。无数据库。 */
import assert from "node:assert/strict";
import test from "node:test";

import { csvCell, recordsToCsv, usageCsvFilename } from "../src/lib/usage/export";
import {
  parseUsageFilters,
  usageFiltersToSearch,
  USAGE_EXPORT_MAX_ROWS,
  USAGE_MAX_RANGE_DAYS,
} from "../src/lib/usage/filters";
import {
  estimateCostMicros,
  matchModelPrice,
  type UsageModelPrice,
} from "../src/lib/usage/pricing";

const day = (text: string) => new Date(`${text}T00:00:00.000Z`);

function price(partial: Partial<UsageModelPrice>): UsageModelPrice {
  return {
    modelPattern: "model",
    matchKind: "prefix",
    source: null,
    effectiveFrom: day("2026-01-01"),
    effectiveTo: null,
    inputPerMtok: 1,
    cacheWritePerMtok: null,
    cacheReadPerMtok: null,
    outputPerMtok: 2,
    reasoningPerMtok: null,
    version: "v1",
    ...partial,
  };
}

test("pricing: longest prefix wins, exact beats prefix", () => {
  const prices = [
    price({ modelPattern: "kimi-k2", inputPerMtok: 0.6 }),
    price({ modelPattern: "kimi-k2.7-code", inputPerMtok: 0.95 }),
    price({ modelPattern: "kimi-k2.7-code", matchKind: "exact", inputPerMtok: 9 }),
  ];
  assert.equal(
    matchModelPrice(prices, "kimi-k2.7-code-20260701", day("2026-08-01"))?.inputPerMtok,
    0.95,
  );
  assert.equal(
    matchModelPrice(prices, "kimi-k2.7-code", day("2026-08-01"))?.inputPerMtok,
    9,
  );
  assert.equal(
    matchModelPrice(prices, "kimi-k2.5", day("2026-08-01"))?.inputPerMtok,
    0.6,
  );
});

test("pricing: effective window is respected (历史价格不回算)", () => {
  const prices = [
    price({
      modelPattern: "claude-sonnet-5",
      effectiveFrom: day("2026-06-01"),
      effectiveTo: day("2026-09-01"),
      inputPerMtok: 2,
      version: "intro",
    }),
    price({
      modelPattern: "claude-sonnet-5",
      effectiveFrom: day("2026-09-01"),
      inputPerMtok: 3,
      version: "standard",
    }),
  ];
  assert.equal(
    matchModelPrice(prices, "claude-sonnet-5-x", day("2026-08-15"))?.version,
    "intro",
  );
  assert.equal(
    matchModelPrice(prices, "claude-sonnet-5-x", day("2026-09-15"))?.version,
    "standard",
  );
  // 窗口前无任何价格 → unpriced
  assert.equal(matchModelPrice(prices, "claude-sonnet-5-x", day("2026-01-15")), null);
});

test("pricing: rate fallbacks — cacheWrite→input, reasoning→output, cacheRead 无回退", () => {
  const row = price({ inputPerMtok: 1, outputPerMtok: 2, cacheReadPerMtok: 0.1 });
  const full = estimateCostMicros(
    {
      inputTokens: 1_000_000,
      cacheWriteInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningOutputTokens: 1_000_000,
    },
    row,
  );
  // 1×1 + 1×1(回退 input)+ 1×0.1 + 1×2 + 1×2(回退 output)= 6.1 USD
  assert.equal(full.status, "priced");
  assert.ok(Math.abs(full.micros - 6_100_000) < 1e-6);
  assert.equal(full.pricedTokens, 5_000_000);
  assert.equal(full.unpricedTokens, 0);

  const noCacheRead = estimateCostMicros(
    { ...zeroTokens(), cacheReadInputTokens: 500 },
    price({ cacheReadPerMtok: null }),
  );
  assert.equal(noCacheRead.status, "partial");
  assert.equal(noCacheRead.micros, 0);
  assert.equal(noCacheRead.pricedTokens, 0);
  assert.equal(noCacheRead.unpricedTokens, 500);

  const none = estimateCostMicros({ ...zeroTokens(), inputTokens: 250 }, null);
  assert.equal(none.status, "unpriced");
  assert.equal(none.micros, 0);
  assert.equal(none.pricedTokens, 0);
  assert.equal(none.unpricedTokens, 250);
});

test("pricing: Codex GPT-5.6 variants beat the generic gpt-5 prefix", () => {
  const prices = [
    price({ modelPattern: "gpt-5", inputPerMtok: 1.25, cacheReadPerMtok: 0.125, outputPerMtok: 10 }),
    price({
      modelPattern: "gpt-5.6",
      inputPerMtok: 5,
      cacheWritePerMtok: 6.25,
      cacheReadPerMtok: 0.5,
      outputPerMtok: 30,
      version: "2026-08-11",
    }),
  ];
  const matched = matchModelPrice(prices, "gpt-5.6-sol", day("2026-08-08"), "codex");
  assert.equal(matched?.modelPattern, "gpt-5.6");
  const estimate = estimateCostMicros(
    {
      inputTokens: 261_628,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 12_168_704,
      outputTokens: 42_658,
      reasoningOutputTokens: 17_592,
    },
    matched,
  );
  assert.equal(estimate.micros, 9_199_992);
});

test("pricing: Codex auto-review uses its source-limited gpt-5.4 equivalent", () => {
  const autoReview = price({
    modelPattern: "codex-auto-review",
    matchKind: "exact",
    source: "codex",
    inputPerMtok: 2.5,
    cacheReadPerMtok: 0.25,
    outputPerMtok: 15,
    version: "2026-08-11",
  });
  assert.equal(
    matchModelPrice([autoReview], "codex-auto-review", day("2026-08-08"), "claude-code"),
    null,
  );
  const matched = matchModelPrice(
    [autoReview],
    "codex-auto-review",
    day("2026-08-08"),
    "codex",
  );
  const estimate = estimateCostMicros(
    {
      inputTokens: 672_697,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 8_628_480,
      outputTokens: 3_886,
      reasoningOutputTokens: 855,
    },
    matched,
  );
  assert.equal(estimate.micros, 3_909_977.5);
});

test("pricing: Terra and Luna retain the official July 30 price windows", () => {
  const terraBefore = price({
    modelPattern: "gpt-5.6-terra",
    effectiveFrom: day("2026-07-09"),
    effectiveTo: day("2026-07-30"),
    inputPerMtok: 2.5,
  });
  const terraAfter = price({
    modelPattern: "gpt-5.6-terra",
    effectiveFrom: day("2026-07-30"),
    inputPerMtok: 2,
  });
  assert.equal(
    matchModelPrice([terraBefore, terraAfter], "gpt-5.6-terra", day("2026-07-29"))?.inputPerMtok,
    2.5,
  );
  assert.equal(
    matchModelPrice([terraBefore, terraAfter], "gpt-5.6-terra", day("2026-07-30"))?.inputPerMtok,
    2,
  );
});

function zeroTokens() {
  return {
    inputTokens: 0,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
}

test("filters: 预设/兼容 days/自定义范围/跨度上限", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");
  const opts = { uploadProject: false, tzOffsetMinutes: 480, now };
  assert.equal(parseUsageFilters({}, opts).days, 30);
  assert.equal(parseUsageFilters({ range: "90d" }, opts).days, 90);
  assert.equal(parseUsageFilters({ days: "7" }, opts).days, 7);
  assert.equal(parseUsageFilters({ range: "bogus" }, opts).days, 30);

  const custom = parseUsageFilters({ from: "2026-07-01", to: "2026-07-15" }, opts);
  assert.equal(custom.rangeLabel, "custom");
  assert.equal(custom.days, 15);
  // 本地日界换算 UTC:北京 7/1 00:00 = UTC 6/30 16:00
  assert.equal(custom.from.toISOString(), "2026-06-30T16:00:00.000Z");

  const tooWide = parseUsageFilters({ from: "2024-01-01", to: "2026-01-01" }, opts);
  assert.equal(tooWide.rangeLabel, "30d");
  assert.ok(USAGE_MAX_RANGE_DAYS >= 366);
});

test("filters: 维度解析与隐私门禁", () => {
  const opts = { uploadProject: false, tzOffsetMinutes: 0, now: new Date() };
  const parsed = parseUsageFilters(
    {
      sources: "codex,not-a-source,claude-code",
      models: "kimi-k3, gpt-5.2 ",
      efforts: "high,max,not allowed",
      agentVersions: "0.146.1,2.1.220",
      projects: "demo-app",
      devices: "udv_abc-123,not-a-device",
      metric: "cost",
      page: "3",
      ps: "500",
    },
    opts,
  );
  assert.deepEqual(parsed.sources, ["codex", "claude-code"]);
  assert.deepEqual(parsed.models, ["kimi-k3", "gpt-5.2"]);
  assert.deepEqual(parsed.efforts, ["high", "max"]);
  assert.deepEqual(parsed.agentVersions, ["0.146.1", "2.1.220"]);
  // 项目名上传关闭 → 项目筛选被强制清空,不允许按项目过滤
  assert.equal(parsed.projects, null);
  assert.equal(parsed.projectsEnabled, false);
  assert.deepEqual(parsed.devices, ["udv_abc-123"]);
  assert.equal(parsed.metric, "cost");
  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 100);

  const enabled = parseUsageFilters(
    { projects: "demo-app,evil/path" },
    { ...opts, uploadProject: true },
  );
  assert.deepEqual(enabled.projects, ["demo-app"]);
  assert.equal(enabled.projectsEnabled, true);
});

test("filters: URL 往返一致(刷新/分享可恢复)", () => {
  const opts = { uploadProject: true, tzOffsetMinutes: 0, now: new Date() };
  const first = parseUsageFilters(
    {
      range: "7d",
      sources: "codex",
      models: "gpt-5.2",
      efforts: "high",
      agentVersions: "0.146.1",
      metric: "duration",
      page: "2",
    },
    opts,
  );
  const search = usageFiltersToSearch(first);
  const raw = Object.fromEntries(new URLSearchParams(search));
  const second = parseUsageFilters(raw, opts);
  assert.deepEqual(second.sources, first.sources);
  assert.deepEqual(second.models, first.models);
  assert.deepEqual(second.efforts, first.efforts);
  assert.deepEqual(second.agentVersions, first.agentVersions);
  assert.equal(second.metric, "duration");
  assert.equal(second.page, 2);
  assert.equal(second.days, 7);
});

test("csv: formula injection 与转义", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+cmd"), "'+cmd");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@SUM(1)"), "'@SUM(1)");
  assert.equal(csvCell("\t1"), "'\t1");
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("项目甲"), "项目甲");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell(null), "");
});

test("csv: recordsToCsv 表头/未定价不计费/注入防护落行", () => {
  const csv = recordsToCsv([
    {
      day: "2026-08-01",
      time: null,
      source: "kimi-code",
      model: "kimi-code/k3",
      modelCanonical: "kimi-k3",
      modelDisplayName: "Kimi K3",
      modelProvider: "moonshot",
      reasoningEffort: "high",
      agentVersion: "1.44.0",
      project: "=evil",
      deviceId: "udv_test",
      deviceName: "mbp",
      deviceDetail: "Warp v1 · macOS 26.5.2 · Collector v0.3.3",
      inputTokens: 100,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 5,
      reasoningOutputTokens: 0,
      totalTokens: 105,
      requests: 1,
      costMicros: 0,
      priceStatus: "unpriced",
    },
  ]);
  const lines = csv.split("\r\n");
  assert.ok(lines[0].startsWith("﻿date,source,model"));
  const cells = lines[1].split(",");
  assert.equal(cells[7], "'=evil");
  assert.equal(cells[17], ""); // 未定价 → 费用留空,不是 0
  assert.equal(cells[18], "unpriced");
});

test("filters: today/24h/粒度推导", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");
  const opts = { uploadProject: false, tzOffsetMinutes: 480, now };
  const today = parseUsageFilters({ range: "today" }, opts);
  assert.equal(today.days, 1);
  assert.equal(today.granularity, "hour");
  assert.equal(today.from.toISOString(), "2026-08-07T16:00:00.000Z"); // 北京 8/8 00:00
  assert.equal(today.to.toISOString(), now.toISOString());

  const rolling = parseUsageFilters({ range: "24h" }, opts);
  assert.equal(rolling.granularity, "hour");
  assert.equal(rolling.from.toISOString(), "2026-08-07T12:00:00.000Z");

  assert.equal(parseUsageFilters({ range: "7d" }, opts).granularity, "day");
  assert.equal(parseUsageFilters({ range: "30d" }, opts).granularity, "day");
  assert.equal(parseUsageFilters({ range: "90d" }, opts).granularity, "week");
  assert.equal(
    parseUsageFilters({ from: "2026-06-01", to: "2026-08-08" }, opts).granularity,
    "week",
  );
  assert.equal(
    parseUsageFilters({ from: "2026-08-07", to: "2026-08-08" }, opts).granularity,
    "hour",
  );
});

test("csv: 文件名安全", () => {
  const filters = parseUsageFilters(
    { range: "7d" },
    { uploadProject: false, tzOffsetMinutes: 0, now: new Date("2026-08-08T00:00:00Z") },
  );
  assert.match(usageCsvFilename(filters), /^kimi-builders-usage-\d{8}-\d{8}\.csv$/);
  assert.ok(USAGE_EXPORT_MAX_ROWS <= 50_000);
});
