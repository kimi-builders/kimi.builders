import assert from "node:assert/strict";
import test from "node:test";
import type { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  getPublicTokenTotals,
  getSocialDailyActivity,
  getSocialUsageHeatmap,
  heatmapGridFromRows,
  isUsagePublic,
  socialDailyActivityQuery,
  socialHeatmapQuery,
  socialOptInQuery,
  socialTokenTotalsQuery,
} from "../src/lib/usage/social";

/* 注:作品徽章已改声明制(20260822_work_claims),原 badgeTokensOf 移除;
   新徽章逻辑 claimBadgeOf 的用例见 tests/work-claims.test.ts。 */

interface FakeCall {
  sql: string;
  params: unknown[];
}

/* 最小假 DB(同 usage-retention.test.ts):记录调用,统一返回固定行 */
function fakeDb(rows: Record<string, unknown>[]) {
  const calls: FakeCall[] = [];
  const db = {
    calls,
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      return [rows];
    },
  };
  return db as unknown as Pool & { calls: FakeCall[] };
}

test("opt-in query reads the shared show_on_leaderboard switch", () => {
  const { sql, args } = socialOptInQuery(42);
  assert.match(sql, /FROM usage_settings/);
  assert.match(sql, /show_on_leaderboard/);
  assert.deepEqual(args, [42]);
});

test("isUsagePublic is deny-by-default: missing row or 0 both mean private", async () => {
  assert.equal(await isUsagePublic(1, fakeDb([{ show_on_leaderboard: 1 }])), true);
  assert.equal(await isUsagePublic(1, fakeDb([{ show_on_leaderboard: 0 }])), false);
  /* 没有 usage_settings 行 = 走列默认 0 = 不公开 */
  assert.equal(await isUsagePublic(1, fakeDb([])), false);
});

test("heatmap query aggregates weekday x local hour over all-time buckets", () => {
  const { sql, args } = socialHeatmapQuery(7, 480);
  /* WEEKDAY() 周一=0,与看板 JS 侧 (getUTCDay()+6)%7 同口径;tz 夹取后内联 */
  assert.match(sql, /WEEKDAY\(DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\)\) AS wd/);
  assert.match(sql, /HOUR\(DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\)\) AS hr/);
  assert.match(sql, /FROM usage_buckets/);
  assert.match(sql, /GROUP BY wd, hr/);
  /* token 总量 = 输入+缓存写+缓存读+输出+推理,无其他维度 */
  assert.match(
    sql,
    /SUM\(input_tokens \+ cache_write_input_tokens \+ cache_read_input_tokens\s+\+ output_tokens \+ reasoning_output_tokens\) AS tokens/,
  );
  assert.deepEqual(args, [7]);
});

test("heatmap query clamps tz offset like the dashboard filters", () => {
  assert.match(socialHeatmapQuery(1, 480).sql, /INTERVAL 480 MINUTE/);
  assert.match(socialHeatmapQuery(1, 100000).sql, /INTERVAL 840 MINUTE/);
  assert.match(socialHeatmapQuery(1, -100000).sql, /INTERVAL -720 MINUTE/);
  assert.match(socialHeatmapQuery(1, Number.NaN).sql, /INTERVAL 0 MINUTE/);
});

test("heatmapGridFromRows fills a 7x24 grid and drops out-of-range rows", () => {
  const rows = [
    { wd: 0, hr: 9, tokens: 100 },
    { wd: 0, hr: 9, tokens: 50 },
    { wd: 6, hr: 23, tokens: 7 },
    { wd: 7, hr: 0, tokens: 999 },
    { wd: 0, hr: 24, tokens: 999 },
  ] as RowDataPacket[];
  const grid = heatmapGridFromRows(rows);
  assert.equal(grid.length, 7);
  assert.equal(grid[0].length, 24);
  assert.equal(grid[0][9], 150);
  assert.equal(grid[6][23], 7);
  assert.equal(
    grid.flat().reduce((s, n) => s + n, 0),
    157,
  );
});

test("getSocialUsageHeatmap runs the aggregate query and maps rows", async () => {
  const db = fakeDb([{ wd: 2, hr: 14, tokens: 123 }]);
  const grid = await getSocialUsageHeatmap(9, 0, db);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [9]);
  assert.equal(grid[2][14], 123);
});

test("token totals query gates on show_on_leaderboard = 1 in the JOIN itself", () => {
  const q = socialTokenTotalsQuery([3, 1, 3])!;
  /* 门禁钉在 SQL 里:未 opt-in 的作者根本不会出现在结果集 */
  assert.match(q.sql, /JOIN usage_settings s\s+ON s\.user_id = b\.user_id AND s\.show_on_leaderboard = 1/);
  assert.match(q.sql, /FROM usage_buckets b/);
  assert.match(q.sql, /WHERE b\.user_id IN \(\?\)/);
  assert.match(q.sql, /GROUP BY b\.user_id/);
  /* 只 SUM token 总量,无周期/项目/设备等任何其他维度 */
  assert.equal(q.sql.includes("bucket_start"), false);
  /* 入参去重 */
  assert.deepEqual(q.args, [[3, 1]]);
});

test("token totals query returns null for an empty or invalid id set", () => {
  assert.equal(socialTokenTotalsQuery([]), null);
  assert.equal(socialTokenTotalsQuery([null, 0, -1, Number.NaN]), null);
});

test("getPublicTokenTotals maps only opted-in authors; others are absent", async () => {
  const db = fakeDb([{ user_id: 5, total_tokens: 123456 }]);
  const totals = await getPublicTokenTotals([5, 6], db);
  assert.equal(totals.get(5), 123456);
  /* 未 opt-in 的作者不在结果里 —— 调用方拿不到数字,只能不显示 */
  assert.equal(totals.has(6), false);
  const empty = await getPublicTokenTotals([], db);
  assert.equal(empty.size, 0);
});

test("daily activity query aggregates tokens per local calendar day over 371 days", () => {
  const { sql, args } = socialDailyActivityQuery(7, 480);
  /* 日粒度 = DATE(本地桶时间);tz 夹取后内联,与分时热图同约定 */
  assert.match(sql, /DATE\(DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\)\) AS day/);
  /* 窗口 = 本地今天往前 370 天(含今天共 371 天 = 53 周) */
  assert.match(
    sql,
    /AND DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\) >= DATE_SUB\(DATE\(DATE_ADD\(UTC_TIMESTAMP\(\), INTERVAL 480 MINUTE\)\), INTERVAL 370 DAY\)/,
  );
  assert.match(sql, /FROM usage_buckets/);
  assert.match(sql, /GROUP BY day/);
  /* 只 SUM tokens,无其他维度 */
  assert.match(
    sql,
    /SUM\(input_tokens \+ cache_write_input_tokens \+ cache_read_input_tokens\s+\+ output_tokens \+ reasoning_output_tokens\) AS tokens/,
  );
  assert.deepEqual(args, [7]);
});

test("daily activity query clamps tz offset like the dashboard filters", () => {
  assert.match(socialDailyActivityQuery(1, 480).sql, /INTERVAL 480 MINUTE/);
  assert.match(socialDailyActivityQuery(1, 100000).sql, /INTERVAL 840 MINUTE/);
  assert.match(socialDailyActivityQuery(1, -100000).sql, /INTERVAL -720 MINUTE/);
  assert.match(socialDailyActivityQuery(1, Number.NaN).sql, /INTERVAL 0 MINUTE/);
});

test("getSocialDailyActivity maps rows to a YYYY-MM-DD -> tokens record", async () => {
  /* mysql2 下 DATE() 可能落 string 也可能落 Date(池端 timezone:'Z' → UTC 零点) */
  const db = fakeDb([
    { day: "2026-08-09", tokens: 321 },
    { day: new Date(Date.UTC(2026, 7, 8)), tokens: "654" },
    { day: null, tokens: 999 },
  ]);
  const days = await getSocialDailyActivity(9, 480, db);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [9]);
  assert.deepEqual(days, { "2026-08-09": 321, "2026-08-08": 654 });
});
