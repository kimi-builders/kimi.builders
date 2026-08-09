import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import { applyUsageRetention, usageRetentionCutoff } from "../src/lib/usage/retention";

interface FakeCall {
  sql: string;
  params: unknown[];
}

/* 最小假 DB:settings 查询返回固定行,DELETE 按脚本依次返回 affectedRows(默认 0) */
function fakeDb(options: {
  settings: Record<string, unknown>[];
  bucketResults?: number[];
  sessionResults?: number[];
}) {
  const calls: FakeCall[] = [];
  const bucketResults = [...(options.bucketResults ?? [])];
  const sessionResults = [...(options.sessionResults ?? [])];
  const db = {
    calls,
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) return [options.settings];
      if (sql.includes("usage_buckets")) {
        return [{ affectedRows: bucketResults.shift() ?? 0 }];
      }
      return [{ affectedRows: sessionResults.shift() ?? 0 }];
    },
  };
  return db as unknown as Pool & { calls: FakeCall[] };
}

const NOW = new Date("2026-08-16T00:00:00.000Z");

test("retention cutoff is exactly retentionDays before now", () => {
  assert.equal(
    usageRetentionCutoff(30, NOW).toISOString(),
    "2026-07-17T00:00:00.000Z",
  );
  assert.equal(
    usageRetentionCutoff(365, NOW).toISOString(),
    "2025-08-16T00:00:00.000Z",
  );
});

test("retention deletes rows older than the per-user cutoff in both tables", async () => {
  const db = fakeDb({
    settings: [
      { user_id: 1, retention_days: 30 },
      { user_id: 2, retention_days: 365 },
    ],
  });
  await applyUsageRetention(db, NOW);
  const deletes = db.calls.filter((c) => c.sql.startsWith("DELETE"));
  assert.equal(deletes.length, 4);
  const cutoffOf = (userId: number, table: string) =>
    deletes.find((c) => c.params[0] === userId && c.sql.includes(table))?.params[1];
  assert.equal(cutoffOf(1, "usage_buckets"), "2026-07-17 00:00:00.000");
  assert.equal(cutoffOf(1, "usage_sessions"), "2026-07-17 00:00:00.000");
  assert.equal(cutoffOf(2, "usage_buckets"), "2025-08-16 00:00:00.000");
  assert.equal(cutoffOf(2, "usage_sessions"), "2025-08-16 00:00:00.000");
});

test("users without a retention row are left untouched", async () => {
  const db = fakeDb({ settings: [{ user_id: 1, retention_days: 30 }] });
  await applyUsageRetention(db, NOW);
  const deletes = db.calls.filter((c) => c.sql.startsWith("DELETE"));
  assert.ok(deletes.length > 0);
  assert.ok(deletes.every((c) => c.params[0] === 1));
});

test("retention reports per-table counts and affected users, batched", async () => {
  const db = fakeDb({
    settings: [
      { user_id: 1, retention_days: 30 },
      { user_id: 2, retention_days: 30 },
    ],
    /* 用户 1 的 buckets 删满一批再来一批;sessions 无过期;用户 2 只有 sessions 过期 */
    bucketResults: [5000, 5000, 1200],
    sessionResults: [0, 7],
  });
  const stats = await applyUsageRetention(db, NOW);
  assert.equal(stats.bucketsDeleted, 11200);
  assert.equal(stats.sessionsDeleted, 7);
  assert.equal(stats.users, 2);
});

test("retention is idempotent: a second run deletes nothing", async () => {
  const db = fakeDb({
    settings: [{ user_id: 1, retention_days: 30 }],
    bucketResults: [42],
    sessionResults: [3],
  });
  const first = await applyUsageRetention(db, NOW);
  assert.deepEqual(first, { users: 1, bucketsDeleted: 42, sessionsDeleted: 3 });
  const second = await applyUsageRetention(db, NOW);
  assert.deepEqual(second, { users: 0, bucketsDeleted: 0, sessionsDeleted: 0 });
});
