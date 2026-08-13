import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import {
  ANALYTICS_RETENTION_SQL,
  ANALYTICS_TOP_LIMIT,
  analyticsCutoff,
  applyAnalyticsRetention,
  buildAnalyticsEventTotalsQuery,
  buildAnalyticsPageViewsQuery,
  buildAnalyticsTopTargetsQuery,
  buildFeaturedClickQuery,
  buildPosterDownloadsQuery,
  getAnalyticsInsights,
  normalizeAnalyticsPeriod,
} from "../src/lib/analytics";

const NOW = new Date("2026-09-03T12:34:56.789Z");

test("analytics periods normalize and produce parameterized UTC boundaries", () => {
  assert.equal(normalizeAnalyticsPeriod("7d"), "7d");
  assert.equal(normalizeAnalyticsPeriod("30d"), "30d");
  assert.equal(normalizeAnalyticsPeriod("anything"), "7d");
  assert.equal(analyticsCutoff("7d", NOW), "2026-08-27 12:34:56.789");
  assert.equal(analyticsCutoff("30d", NOW), "2026-08-04 12:34:56.789");
  for (const query of [
    buildAnalyticsEventTotalsQuery("7d", NOW),
    buildFeaturedClickQuery("7d", NOW),
    buildPosterDownloadsQuery("7d", NOW),
    buildAnalyticsPageViewsQuery("7d", NOW),
  ]) {
    assert.match(query.sql, /created_at >= \?/);
    assert.equal(query.params.at(-1), "2026-08-27 12:34:56.789");
  }
});

test("analytics insight SQL only selects aggregates and anonymous event dimensions", () => {
  const sql = [
    buildAnalyticsEventTotalsQuery("7d", NOW).sql,
    buildFeaturedClickQuery("7d", NOW).sql,
    buildPosterDownloadsQuery("7d", NOW).sql,
    buildAnalyticsTopTargetsQuery("work_view", "7d", NOW).sql,
    buildAnalyticsTopTargetsQuery("profile_view", "7d", NOW).sql,
    buildAnalyticsPageViewsQuery("7d", NOW).sql,
  ].join("\n");
  assert.match(sql, /COUNT\(\*\)/);
  assert.match(sql, /COUNT\(DISTINCT viewer\)/);
  for (const forbidden of ["user_id", "referrer", "user_agent", "ip_address", "url"]) {
    assert.ok(!sql.toLowerCase().includes(forbidden), forbidden);
  }
});

test("analytics top target query groups deterministically and clamps LIMIT", () => {
  const high = buildAnalyticsTopTargetsQuery("work_view", "30d", NOW, 999);
  assert.match(high.sql, /WHERE event = \? AND created_at >= \?/);
  assert.match(high.sql, /GROUP BY target_id/);
  assert.match(high.sql, new RegExp(`LIMIT ${ANALYTICS_TOP_LIMIT}$`));
  assert.deepEqual(high.params, ["work_view", "2026-08-04 12:34:56.789"]);
  assert.match(buildAnalyticsTopTargetsQuery("profile_view", "7d", NOW, -5).sql, /LIMIT 1$/);
});

test("page comparison query pins the explicit view-event whitelist", () => {
  const query = buildAnalyticsPageViewsQuery("7d", NOW);
  assert.match(query.sql, /event IN \(/);
  for (const event of [
    "home_view",
    "leaderboard_view",
    "awesome_view",
    "works_view",
    "usage_view",
    "post_view",
    "work_view",
    "profile_view",
    "profile_tab_view",
  ]) {
    assert.ok(query.params.includes(event), event);
  }
  for (const event of ["featured_click", "poster_download", "join_click"]) {
    assert.ok(!query.params.includes(event), event);
  }
});

test("getAnalyticsInsights maps six aggregate result sets without caching", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const results = [
    [{ event: "home_view", total: "5", unique_viewers: "3" }],
    [{ position: "home", target_kind: "post", target_id: "7", total: "4", unique_viewers: 2 }],
    [{ surface: "usage", total: 3, unique_viewers: 2 }],
    [{ target_id: "9", total: 8, unique_viewers: 5 }],
    [{ target_id: "ada", total: 6, unique_viewers: 4 }],
    [{ event: "home_view", total: 5, unique_viewers: 3 }],
  ];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return [results[calls.length - 1]];
    },
  } as unknown as Pool;
  const insights = await getAnalyticsInsights("7d", { now: NOW, db });
  assert.equal(calls.length, 6);
  assert.deepEqual(insights.eventTotals, [{ key: "home_view", total: 5, uniqueViewers: 3 }]);
  assert.deepEqual(insights.featuredClicks[0], {
    key: "post:7",
    position: "home",
    targetKind: "post",
    targetId: "7",
    total: 4,
    uniqueViewers: 2,
  });
  assert.deepEqual(insights.posterDownloads[0], { key: "usage", total: 3, uniqueViewers: 2 });
  assert.deepEqual(insights.topWorks[0], { key: "9", total: 8, uniqueViewers: 5 });
  assert.deepEqual(insights.topProfiles[0], { key: "ada", total: 6, uniqueViewers: 4 });
  assert.deepEqual(insights.pageViews[0], { key: "home_view", total: 5, uniqueViewers: 3 });
});

test("analytics retention deletes only rows older than 90 days", async () => {
  assert.match(ANALYTICS_RETENTION_SQL, /created_at < UTC_TIMESTAMP\(\) - INTERVAL 90 DAY/);
  const calls: string[] = [];
  const db = {
    async query(sql: string) {
      calls.push(sql);
      return [{ affectedRows: 12 }];
    },
  } as unknown as Pool;
  assert.deepEqual(await applyAnalyticsRetention(db), { deleted: 12 });
  assert.deepEqual(calls, [ANALYTICS_RETENTION_SQL]);
});
