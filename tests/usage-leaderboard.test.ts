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

/* 所有榜单/明细查询共有的隐私红线:项目名、设备、小时内时段、agent 版本、
   会话标识、价格表本身都不得出现在语句里(source/model 只出现在分维度榜
   与费用明细的 WHERE/GROUP BY 中,属榜单功能本身,逐测试单独断言)。 */
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
  /* 默认 deny:WHERE 先卡 show_on_leaderboard = 1,周期下界走参数 */
  assert.match(sql, /WHERE s\.show_on_leaderboard = 1/);
  assert.match(sql, /b\.bucket_start >= \?/);
  assert.deepEqual(params, ["2026-08-11 12:00:00.000"]);
  /* 只输出聚合:token 五段 SUM + UTC 活跃天数;身份只取 handle/name/avatar
     (s.user_id 是内部 join key,不渲染) */
  assert.match(sql, /SUM\(b\.input_tokens \+ b\.cache_write_input_tokens \+ b\.cache_read_input_tokens\s*\+ b\.output_tokens \+ b\.reasoning_output_tokens\)/);
  assert.match(sql, /COUNT\(DISTINCT DATE\(b\.bucket_start\)\)/);
  assert.match(sql, /u\.handle, u\.name, u\.avatar_url/);
  /* 隐私边界:项目/设备/模型/工具/时段等明细列不得出现在语句里 */
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

  /* 分维度榜同样不得引入项目/设备/时段等明细列(source/model 仅作等值过滤) */
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
  /* userIds 来自榜单查询,费用语句仍独立重做 opt-in 门禁,并校验为整数后字面展开 */
  assert.match(
    sql,
    /JOIN usage_settings s\s+ON s\.user_id = b\.user_id AND s\.show_on_leaderboard = 1/,
  );
  assert.match(sql, /b\.user_id IN \(7,42\)/);
  assert.match(sql, /b\.bucket_start >= \?/);
  assert.match(sql, /SUM\(COALESCE\(b\.cost_micros, 0\)\) AS stored_cost_micros/);
  /* 日粒度只为匹配价格生效窗口,不允许小时内时段 */
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
    /* 定价内:1M input × $1 + 2M cache_read × $0.5 + 0.5M output × $2 = $3,
       加 stored $0.25 → 3_250_000 micros */
    costRow({
      input_tokens: 1_000_000,
      cache_read_input_tokens: 2_000_000,
      output_tokens: 500_000,
      stored_cost_micros: 250_000,
    }),
    /* legacy 行只计 stored 事实,不估算 */
    costRow({ measurement: "legacy", input_tokens: 5_000_000, stored_cost_micros: 100_000 }),
    /* 无价格命中:照常统计 token 但不计费 */
    costRow({ model: "other-x", input_tokens: 9_000_000 }),
    /* 价格生效窗口之前(2026-08-01 生效,行在 07-20):不估算,只计 stored */
    costRow({ day: "2026-07-20", input_tokens: 4_000_000, stored_cost_micros: 50_000 }),
    /* 另一用户独立累计:1M input × $1 = $1 */
    costRow({ user_id: 8, input_tokens: 1_000_000 }),
  ];
  const micros = aggregateUsageLeaderboardCosts(rows, [PRICE]);
  assert.equal(micros.size, 2);
  assert.equal(micros.get(7), 3_400_000);
  assert.equal(micros.get(8), 1_000_000);
});

test("rank uses a deterministic total order: metric desc, tiebreaks, handle asc", () => {
  const entries = [
    { userId: 1, handle: "ada", totalTokens: 1000, activeDays: 3 },
    { userId: 2, handle: "bob", totalTokens: 1000, activeDays: 5 },
    { userId: 3, handle: "cyd", totalTokens: 2000, activeDays: 1 },
  ];
  /* 同分不并列:token 同分按活跃天数再分胜负 */
  assert.equal(usageLeaderboardRank(entries, 3, "tokens"), 1);
  assert.equal(usageLeaderboardRank(entries, 2, "tokens"), 2);
  assert.equal(usageLeaderboardRank(entries, 1, "tokens"), 3);
  /* 活跃天数口径独立排序 */
  assert.equal(usageLeaderboardRank(entries, 2, "days"), 1);
  assert.equal(usageLeaderboardRank(entries, 1, "days"), 2);
  assert.equal(usageLeaderboardRank(entries, 3, "days"), 3);
  /* 费用口径:同分按 token 总量再分胜负 */
  const pool = entries.map((entry) => ({
    ...entry,
    costMicros: entry.userId === 1 ? 500 : 900,
  }));
  assert.equal(usageLeaderboardRank(pool, 3, "cost"), 1);
  assert.equal(usageLeaderboardRank(pool, 2, "cost"), 2);
  assert.equal(usageLeaderboardRank(pool, 1, "cost"), 3);
  /* 不在榜为 null(调用方显示 "—") */
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
  /* 参数顺序:user_id, upload_project, upload_device_label, upload_quota, show_on_leaderboard, retention_days */
  assert.deepEqual(calls[0].params, [7, 0, 0, 0, 1, 365]);
});
