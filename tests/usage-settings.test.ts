import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import { getUsageSettings } from "../src/lib/usage/settings";

type SettingsRow = {
  upload_project: number;
  upload_device_label: number;
  upload_quota: number;
  show_on_leaderboard: number;
  retention_days: number;
};

type QueryCall = { sql: string; params: unknown[] };

function settingsRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    upload_project: 0,
    upload_device_label: 0,
    upload_quota: 0,
    show_on_leaderboard: 0,
    retention_days: 365,
    ...overrides,
  };
}

function mockDb(selectResults: SettingsRow[][]): { db: Pool; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const pendingSelects = [...selectResults];
  const db = {
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      if (/^\s*SELECT\b/.test(sql)) return [pendingSelects.shift() ?? []];
      return [{ affectedRows: 1 }];
    },
  } as unknown as Pool;
  return { db, calls };
}

test("getUsageSettings reads an existing row with one SELECT", async () => {
  const { db, calls } = mockDb([
    [settingsRow({ upload_project: 1, show_on_leaderboard: 1, retention_days: 90 })],
  ]);

  const settings = await getUsageSettings(7, db);

  assert.deepEqual(settings, {
    uploadProject: true,
    uploadDeviceLabel: false,
    uploadQuotaSnapshots: false,
    showOnLeaderboard: true,
    retentionDays: 90,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^\s*SELECT\b/);
  assert.deepEqual(calls[0].params, [7]);
});

test("getUsageSettings initializes a missing row and reads it back", async () => {
  const { db, calls } = mockDb([[], [settingsRow()]]);

  const settings = await getUsageSettings(11, db);

  assert.deepEqual(settings, {
    uploadProject: false,
    uploadDeviceLabel: false,
    uploadQuotaSnapshots: false,
    showOnLeaderboard: false,
    retentionDays: 365,
  });
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /^\s*SELECT\b/);
  assert.match(calls[1].sql, /INSERT IGNORE INTO usage_settings/);
  assert.match(calls[2].sql, /^\s*SELECT\b/);
  assert.deepEqual(calls.map((call) => call.params), [[11], [11], [11]]);
});

test("getUsageSettings returns the winning row when initialization races with an update", async () => {
  const winningRow = settingsRow({
    upload_device_label: 1,
    upload_quota: 1,
    show_on_leaderboard: 1,
    retention_days: 180,
  });
  const { db, calls } = mockDb([[], [winningRow]]);

  const settings = await getUsageSettings(23, db);

  assert.deepEqual(settings, {
    uploadProject: false,
    uploadDeviceLabel: true,
    uploadQuotaSnapshots: true,
    showOnLeaderboard: true,
    retentionDays: 180,
  });
  assert.equal(calls.length, 3);
  assert.match(calls[1].sql, /INSERT IGNORE INTO usage_settings/);
});
