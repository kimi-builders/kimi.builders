import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import {
  buildUsageLeaderboardQuery,
  getUsageLeaderboard,
  normalizeUsageLeaderboardPeriod,
  usageLeaderboardCutoff,
  USAGE_LEADERBOARD_LIMIT,
} from "../src/lib/usage/leaderboard";
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

test("leaderboard cutoff is exactly the period length before now", () => {
  assert.equal(usageLeaderboardCutoff("7d", NOW), "2026-08-11 12:00:00.000");
  assert.equal(usageLeaderboardCutoff("30d", NOW), "2026-07-19 12:00:00.000");
});

test("period normalization only accepts 7d/30d and defaults to 7d", () => {
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
  /* 只输出聚合:token 五段 SUM + UTC 活跃天数;身份只取 handle/name/avatar */
  assert.match(sql, /SUM\(b\.input_tokens \+ b\.cache_write_input_tokens \+ b\.cache_read_input_tokens\s*\+ b\.output_tokens \+ b\.reasoning_output_tokens\)/);
  assert.match(sql, /COUNT\(DISTINCT DATE\(b\.bucket_start\)\)/);
  assert.match(sql, /u\.handle, u\.name, u\.avatar_url/);
  /* 隐私边界:项目/设备/模型/工具/时段等明细列不得出现在语句里 */
  for (const col of [
    "project_label",
    "project_hash",
    "device_id",
    "model",
    "source",
    "HOUR(",
    "agent_version",
    "session",
    "cost_micros",
  ]) {
    assert.ok(!sql.includes(col), `unexpected privacy detail in leaderboard SQL: ${col}`);
  }
});

test("leaderboard query honors the 30d boundary and caps the limit", () => {
  const { sql, params } = buildUsageLeaderboardQuery("30d", NOW, 5000);
  assert.deepEqual(params, ["2026-07-19 12:00:00.000"]);
  assert.match(sql, new RegExp(`LIMIT ${USAGE_LEADERBOARD_LIMIT}`));
  const fallback = buildUsageLeaderboardQuery("7d", NOW, Number.NaN);
  assert.match(fallback.sql, /LIMIT 1/);
});

test("getUsageLeaderboard ranks rows in order and coerces numbers", async () => {
  const calls: FakeCall[] = [];
  const db = {
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      return [
        [
          { handle: "ada", name: "Ada", avatar_url: "https://x/a.png", total_tokens: "1200", active_days: "5" },
          { handle: "bob", name: "", avatar_url: "", total_tokens: 300, active_days: 2 },
        ],
      ];
    },
  } as unknown as Pool;
  const rows = await getUsageLeaderboard("7d", { now: NOW, db });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /show_on_leaderboard = 1/);
  assert.deepEqual(rows, [
    { rank: 1, handle: "ada", name: "Ada", avatarUrl: "https://x/a.png", totalTokens: 1200, activeDays: 5 },
    { rank: 2, handle: "bob", name: "", avatarUrl: "", totalTokens: 300, activeDays: 2 },
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

test("settings read keeps INSERT IGNORE and maps show_on_leaderboard", async () => {
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
  assert.match(calls[0].sql, /INSERT IGNORE INTO usage_settings/);
  assert.match(calls[1].sql, /show_on_leaderboard/);
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
