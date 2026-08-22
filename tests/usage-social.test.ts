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

/* Note: work badges went claim-based; the old badgeTokensOf is gone —
   claimBadgeOf's cases live in tests/work-claims.test.ts. */

interface FakeCall {
  sql: string;
  params: unknown[];
}

/* Minimal fake DB (as in usage-retention.test.ts): records calls,
   returns fixed rows. */
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
  /* No usage_settings row = column default 0 = private. */
  assert.equal(await isUsagePublic(1, fakeDb([])), false);
});

test("heatmap query aggregates weekday x local hour over all-time buckets", () => {
  const { sql, args } = socialHeatmapQuery(7, 480);
  /* WEEKDAY() Monday=0, matching the dashboard's JS (getUTCDay()+6)%7;
     tz clamped then inlined. */
  assert.match(sql, /WEEKDAY\(DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\)\) AS wd/);
  assert.match(sql, /HOUR\(DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\)\) AS hr/);
  assert.match(sql, /FROM usage_buckets/);
  assert.match(sql, /GROUP BY wd, hr/);
  /* Token totals = input + cache write + cache read + output +
     reasoning, no other dimension. */
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
  /* The gate is pinned inside the SQL: authors who never opted in
     simply never appear in the result set. */
  assert.match(q.sql, /JOIN usage_settings s\s+ON s\.user_id = b\.user_id AND s\.show_on_leaderboard = 1/);
  assert.match(q.sql, /FROM usage_buckets b/);
  assert.match(q.sql, /WHERE b\.user_id IN \(\?\)/);
  assert.match(q.sql, /GROUP BY b\.user_id/);
  /* SUMs token totals only — no period/project/device dimension. */
  assert.equal(q.sql.includes("bucket_start"), false);
  /* Inputs deduped. */
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
  /* Non-opted-in authors are absent — callers get no number and can
     only not display. */
  assert.equal(totals.has(6), false);
  const empty = await getPublicTokenTotals([], db);
  assert.equal(empty.size, 0);
});

test("daily activity query aggregates tokens per local calendar day over 371 days", () => {
  const { sql, args } = socialDailyActivityQuery(7, 480);
  /* Day grain = DATE(local bucket time); tz clamped then inlined, the
     same convention as the hourly heatmap. */
  assert.match(sql, /DATE\(DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\)\) AS day/);
  /* Window = local today minus 370 days (371 days incl. today = 53
     weeks). */
  assert.match(
    sql,
    /AND DATE_ADD\(bucket_start, INTERVAL 480 MINUTE\) >= DATE_SUB\(DATE\(DATE_ADD\(UTC_TIMESTAMP\(\), INTERVAL 480 MINUTE\)\), INTERVAL 370 DAY\)/,
  );
  assert.match(sql, /FROM usage_buckets/);
  assert.match(sql, /GROUP BY day/);
  /* SUMs tokens only, no other dimension. */
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
  /* Under mysql2, DATE() may arrive as string or Date (pool timezone:'Z'
     -> UTC midnight). */
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
