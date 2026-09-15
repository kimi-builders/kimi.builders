import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import {
  aggregateUsageLeaderboardCosts,
  buildUsageLeaderboardCostQuery,
  buildUsageLeaderboardDimensionQuery,
  buildUsageLeaderboardQuery,
  displayUsageLeaderboardRank,
  getUsageLeaderboard,
  normalizeUsageLeaderboardPeriod,
  usageLeaderboardCutoff,
  usageLeaderboardRank,
  USAGE_LEADERBOARD_LIMIT,
  type UsageLeaderboardCostRow,
} from "../src/lib/usage/leaderboard";
import type { UsageModelPrice } from "../src/lib/usage/pricing";
import {
  getUsageSettings,
  parseUsageSettings,
  updateUsageSettings,
} from "../src/lib/usage/settings";

interface FakeCall {
  sql: string;
  params: unknown[];
}

const NOW = new Date("2026-08-18T12:00:00.000Z");

/* The privacy red line shared by every board/detail query: project
   names, devices, hourly times, agent versions, session identifiers,
   and the price table itself never appear in the statements (source /
   model appear only in the dimension boards' and cost detail's
   WHERE/GROUP BY — the board's own function, asserted per test). */
const PRIVACY_FORBIDDEN = [
  "project_label",
  "project_hash",
  "device_id",
  "HOUR(",
  "agent_version",
  "session",
  "usage_model_prices",
];

test("leaderboard cutoff is exactly the period length before now", () => {
  assert.equal(usageLeaderboardCutoff("24h", NOW), "2026-08-17 12:00:00.000");
  assert.equal(usageLeaderboardCutoff("7d", NOW), "2026-08-11 12:00:00.000");
  assert.equal(usageLeaderboardCutoff("30d", NOW), "2026-07-19 12:00:00.000");
});

test("period normalization only accepts 24h/7d/30d and defaults to 7d", () => {
  assert.equal(normalizeUsageLeaderboardPeriod("24h"), "24h");
  assert.equal(normalizeUsageLeaderboardPeriod("7d"), "7d");
  assert.equal(normalizeUsageLeaderboardPeriod("30d"), "30d");
  assert.equal(normalizeUsageLeaderboardPeriod("1y"), "7d");
  assert.equal(normalizeUsageLeaderboardPeriod(undefined), "7d");
  assert.equal(normalizeUsageLeaderboardPeriod(["30d"]), "7d");
});

test("leaderboard query only includes opt-in users and aggregate outputs", () => {
  const { sql, params } = buildUsageLeaderboardQuery("7d", NOW);
  /* Deny by default: WHERE pins show_on_leaderboard = 1 first; the
     period lower bound rides a param. */
  assert.match(sql, /WHERE s\.show_on_leaderboard = 1/);
  assert.match(sql, /b\.bucket_start >= \?/);
  assert.deepEqual(params, ["2026-08-11 12:00:00.000"]);
  /* Aggregates only: the five token SUMs + UTC active days; identity
     limited to handle/name/avatar (s.user_id is an internal join key,
     never rendered). */
  assert.match(sql, /SUM\(b\.input_tokens \+ b\.cache_write_input_tokens \+ b\.cache_read_input_tokens\s*\+ b\.output_tokens \+ b\.reasoning_output_tokens\)/);
  assert.match(sql, /COUNT\(DISTINCT DATE\(b\.bucket_start\)\)/);
  assert.match(sql, /u\.handle, u\.name, u\.avatar_url/);
  /* Privacy boundary: project/device/model/tool/hour detail columns
     never appear in the statement. */
  for (const col of [
    ...PRIVACY_FORBIDDEN,
    "model",
    "source",
    "cost_micros",
  ]) {
    assert.ok(!sql.includes(col), `unexpected privacy detail in leaderboard SQL: ${col}`);
  }
});

test("leaderboard query honors the 30d boundary and caps the limit", () => {
  const { sql, params } = buildUsageLeaderboardQuery("30d", NOW, { limit: 5000 });
  assert.deepEqual(params, ["2026-07-19 12:00:00.000"]);
  assert.match(sql, new RegExp(`LIMIT ${USAGE_LEADERBOARD_LIMIT}`));
  const fallback = buildUsageLeaderboardQuery("7d", NOW, { limit: Number.NaN });
  assert.match(fallback.sql, /LIMIT 1/);
});

test("limit 0 lifts the LIMIT clause for full-population ranking", () => {
  const { sql } = buildUsageLeaderboardQuery("7d", NOW, { limit: 0 });
  assert.ok(!sql.includes("LIMIT"));
  assert.match(sql, /WHERE s\.show_on_leaderboard = 1/);
});

test("dimension boards filter by source / canonical model and keep the gate", () => {
  const bySource = buildUsageLeaderboardQuery("24h", NOW, { source: "kimi-code" });
  assert.match(bySource.sql, /WHERE s\.show_on_leaderboard = 1/);
  assert.match(bySource.sql, /AND b\.source = \?/);
  assert.match(bySource.sql, new RegExp(`LIMIT ${USAGE_LEADERBOARD_LIMIT}`));
  assert.deepEqual(bySource.params, ["2026-08-17 12:00:00.000", "kimi-code"]);

  const byModel = buildUsageLeaderboardQuery("7d", NOW, { model: "kimi-k3" });
  assert.match(byModel.sql, /WHERE s\.show_on_leaderboard = 1/);
  assert.match(byModel.sql, /AND COALESCE\(NULLIF\(b\.model_canonical, ''\), b\.model\) = \?/);
  assert.deepEqual(byModel.params, ["2026-08-11 12:00:00.000", "kimi-k3"]);

  /* Dimension boards introduce no detail columns either (source/model
     serve only as equality filters). */
  for (const sql of [bySource.sql, byModel.sql]) {
    for (const col of [...PRIVACY_FORBIDDEN, "cost_micros"]) {
      assert.ok(!sql.includes(col), `unexpected privacy detail in dimension SQL: ${col}`);
    }
  }
  assert.ok(!bySource.sql.includes("model"), "source board must not reference model");
  assert.ok(!byModel.sql.includes("b.source"), "model board must not reference source");
});

test("dimension option queries rank candidates by period token weight", () => {
  const src = buildUsageLeaderboardDimensionQuery("source", "30d", NOW);
  assert.match(src.sql, /SELECT b\.source AS k,/);
  assert.match(src.sql, /WHERE s\.show_on_leaderboard = 1/);
  assert.match(src.sql, /GROUP BY k/);
  assert.match(src.sql, /ORDER BY w DESC, k ASC/);
  assert.match(src.sql, /LIMIT 10/);
  assert.deepEqual(src.params, ["2026-07-19 12:00:00.000"]);

  const mdl = buildUsageLeaderboardDimensionQuery("model", "7d", NOW, 5);
  assert.match(mdl.sql, /SELECT COALESCE\(NULLIF\(b\.model_canonical, ''\), b\.model\) AS k,/);
  assert.match(mdl.sql, /LIMIT 5/);

  for (const sql of [src.sql, mdl.sql]) {
    for (const col of [...PRIVACY_FORBIDDEN, "cost_micros"]) {
      assert.ok(!sql.includes(col), `unexpected privacy detail in dimension options SQL: ${col}`);
    }
  }
});

test("cost query is user-scoped, day-granular and free of detail columns", () => {
  const { sql, params } = buildUsageLeaderboardCostQuery([7, 42], "7d", NOW);
  /* userIds come from the board query; the cost statement still
     re-applies the opt-in gate independently and expands ids literally
     after integer validation. */
  assert.match(
    sql,
    /JOIN usage_settings s\s+ON s\.user_id = b\.user_id AND s\.show_on_leaderboard = 1/,
  );
  assert.match(sql, /b\.user_id IN \(7,42\)/);
  assert.match(sql, /b\.bucket_start >= \?/);
  assert.match(sql, /SUM\(COALESCE\(b\.cost_micros, 0\)\) AS stored_cost_micros/);
  /* Day grain exists only to match price effective windows; no hourly
     detail. */
  assert.match(sql, /DATE\(b\.bucket_start\) AS day/);
  assert.deepEqual(params, ["2026-08-11 12:00:00.000"]);
  for (const col of PRIVACY_FORBIDDEN) {
    assert.ok(!sql.includes(col), `unexpected privacy detail in cost SQL: ${col}`);
  }
});

test("cost query validates the candidate ids", () => {
  assert.throws(() => buildUsageLeaderboardCostQuery([], "7d", NOW));
  assert.throws(() => buildUsageLeaderboardCostQuery([0], "7d", NOW));
  assert.throws(() => buildUsageLeaderboardCostQuery([1.5], "7d", NOW));
  assert.throws(() => buildUsageLeaderboardCostQuery([Number.NaN], "7d", NOW));
});

const PRICE: UsageModelPrice = {
  modelPattern: "kimi-k3",
  matchKind: "prefix",
  source: null,
  contextTier: "",
  processingTier: "standard",
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
  inputPerMtok: 1,
  cacheWritePerMtok: null,
  cacheWrite5mPerMtok: null,
  cacheWrite1hPerMtok: null,
  cacheReadPerMtok: 0.5,
  outputPerMtok: 2,
  reasoningPerMtok: null,
  version: "2026-08",
  pricingSourceUrl: "",
  verifiedAt: null,
  pricingBasis: "standard-api",
};

function costRow(over: Partial<UsageLeaderboardCostRow>): UsageLeaderboardCostRow {
  return {
    user_id: 7,
    source: "kimi-code",
    model: "kimi-k3",
    model_canonical: "",
    model_provider: "",
    context_tier: "",
    measurement: "exact",
    day: "2026-08-18",
    input_tokens: 0,
    cache_write_input_tokens: 0,
    cache_write_5m_input_tokens: 0,
    cache_write_1h_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    stored_cost_micros: 0,
    ...over,
  };
}

test("cost aggregation follows the dashboard: stored facts + versioned price estimate", () => {
  const rows: UsageLeaderboardCostRow[] = [
    /* Priced: 1M input x $1 + 2M cache_read x $0.5 + 0.5M output x $2
       = $3, plus stored $0.25 -> 3_250_000 micros. */
    costRow({
      input_tokens: 1_000_000,
      cache_read_input_tokens: 2_000_000,
      output_tokens: 500_000,
      stored_cost_micros: 250_000,
    }),
    /* Legacy rows count stored facts only, no estimation. */
    costRow({ measurement: "legacy", input_tokens: 5_000_000, stored_cost_micros: 100_000 }),
    /* No price hit: tokens still counted, no cost. */
    costRow({ model: "other-x", input_tokens: 9_000_000 }),
    /* Before the effective window (effective 2026-08-01, row on 07-20):
       no estimation, stored facts only. */
    costRow({ day: "2026-07-20", input_tokens: 4_000_000, stored_cost_micros: 50_000 }),
    /* Another user accumulates independently: 1M input x $1 = $1. */
    costRow({ user_id: 8, input_tokens: 1_000_000 }),
  ];
  const micros = aggregateUsageLeaderboardCosts(rows, [PRICE]);
  assert.equal(micros.size, 2);
  assert.equal(micros.get(7), 3_400_000);
  assert.equal(micros.get(8), 1_000_000);
});

test("cost aggregation repairs stale kimi-for-coding canonicals at the rollout boundary", () => {
  const prices: UsageModelPrice[] = [
    {
      ...PRICE,
      modelPattern: "kimi-k2.7-code",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      inputPerMtok: 0.95,
      version: "k2.7",
    },
    {
      ...PRICE,
      modelPattern: "kimi-k2.8-preview",
      effectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
      inputPerMtok: 1.9,
      version: "k2.8-preview",
    },
  ];
  const rows = [
    costRow({
      model: "kimi-code/kimi-for-coding",
      model_canonical: "kimi-k2.7-code",
      day: "2026-09-10",
      input_tokens: 1_000_000,
    }),
    costRow({
      model: "kimi-code/kimi-for-coding",
      model_canonical: "kimi-k2.7-code",
      day: "2026-09-11",
      input_tokens: 1_000_000,
    }),
  ];
  assert.equal(aggregateUsageLeaderboardCosts(rows, prices).get(7), 2_850_000);
});

test("rank uses a deterministic total order: metric desc, tiebreaks, handle asc", () => {
  const entries = [
    { userId: 1, handle: "ada", totalTokens: 1000, activeDays: 3 },
    { userId: 2, handle: "bob", totalTokens: 1000, activeDays: 5 },
    { userId: 3, handle: "cyd", totalTokens: 2000, activeDays: 1 },
  ];
  /* No shared ranks: token ties break by active days. */
  assert.equal(usageLeaderboardRank(entries, 3, "tokens"), 1);
  assert.equal(usageLeaderboardRank(entries, 2, "tokens"), 2);
  assert.equal(usageLeaderboardRank(entries, 1, "tokens"), 3);
  /* Active days order independently. */
  assert.equal(usageLeaderboardRank(entries, 2, "days"), 1);
  assert.equal(usageLeaderboardRank(entries, 1, "days"), 2);
  assert.equal(usageLeaderboardRank(entries, 3, "days"), 3);
  /* Cost definition: ties break by token totals. */
  const pool = entries.map((entry) => ({
    ...entry,
    costMicros: entry.userId === 1 ? 500 : 900,
  }));
  assert.equal(usageLeaderboardRank(pool, 3, "cost"), 1);
  assert.equal(usageLeaderboardRank(pool, 2, "cost"), 2);
  assert.equal(usageLeaderboardRank(pool, 1, "cost"), 3);
  /* Off-board is null (callers show "—"). */
  assert.equal(usageLeaderboardRank(entries, 99, "tokens"), null);
});

test("rank display truncates beyond the board limit", () => {
  assert.equal(displayUsageLeaderboardRank(1), "1");
  assert.equal(displayUsageLeaderboardRank(USAGE_LEADERBOARD_LIMIT), "50");
  assert.equal(displayUsageLeaderboardRank(USAGE_LEADERBOARD_LIMIT + 1), "50+");
  assert.equal(displayUsageLeaderboardRank(5000), "50+");
  assert.equal(displayUsageLeaderboardRank(null), "—");
  assert.equal(displayUsageLeaderboardRank(11, 10), "10+");
});

test("getUsageLeaderboard ranks rows in order and coerces numbers", async () => {
  const calls: FakeCall[] = [];
  const db = {
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      return [
        [
          { user_id: 7, handle: "ada", name: "Ada", avatar_url: "https://x/a.png", total_tokens: "1200", active_days: "5" },
          { user_id: 8, handle: "bob", name: "", avatar_url: "", total_tokens: 300, active_days: 2 },
        ],
      ];
    },
  } as unknown as Pool;
  const rows = await getUsageLeaderboard("7d", { now: NOW, db });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /show_on_leaderboard = 1/);
  assert.deepEqual(rows, [
    { rank: 1, userId: 7, handle: "ada", name: "Ada", avatarUrl: "https://x/a.png", totalTokens: 1200, activeDays: 5 },
    { rank: 2, userId: 8, handle: "bob", name: "", avatarUrl: "", totalTokens: 300, activeDays: 2 },
  ]);
});

test("parseUsageSettings accepts the leaderboard switch, default off, rejects non-boolean", () => {
  const base = { retentionDays: 365 };
  assert.deepEqual(parseUsageSettings(base), {
    uploadProject: false,
    uploadDeviceLabel: false,
    uploadQuotaSnapshots: false,
    showOnLeaderboard: false,
    retentionDays: 365,
  });
  assert.equal(parseUsageSettings({ ...base, showOnLeaderboard: true })?.showOnLeaderboard, true);
  assert.equal(parseUsageSettings({ ...base, showOnLeaderboard: "yes" }), null);
});

test("settings read maps show_on_leaderboard from the SELECT-first hot path", async () => {
  const calls: FakeCall[] = [];
  const db = {
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) {
        return [
          [
            {
              upload_project: 0,
              upload_device_label: 0,
              upload_quota: 0,
              show_on_leaderboard: 1,
              retention_days: 90,
            },
          ],
        ];
      }
      return [{}];
    },
  } as unknown as Pool;
  const settings = await getUsageSettings(7, db);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /show_on_leaderboard/);
  assert.equal(settings.showOnLeaderboard, true);
  assert.equal(settings.retentionDays, 90);
});

test("settings write persists show_on_leaderboard as 1/0", async () => {
  const calls: FakeCall[] = [];
  const db = {
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      return [{}];
    },
  } as unknown as Pool;
  await updateUsageSettings(
    7,
    {
      uploadProject: false,
      uploadDeviceLabel: false,
      uploadQuotaSnapshots: false,
      showOnLeaderboard: true,
      retentionDays: 365,
    },
    db,
  );
  assert.match(calls[0].sql, /show_on_leaderboard = VALUES\(show_on_leaderboard\)/);
  /* Param order: user_id, upload_project, upload_device_label,
     upload_quota, show_on_leaderboard, retention_days. */
  assert.deepEqual(calls[0].params, [7, 0, 0, 0, 1, 365]);
});
