import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import { applyUsageRetention, usageRetentionCutoff } from "../src/lib/usage/retention";

interface FakeCall {
  sql: string;
  params: unknown[];
}

/* Minimal fake DB: the settings query returns fixed rows; DELETEs route
   by table and return scripted affectedRows in order (default 0). */
function fakeDb(options: {
  settings: Record<string, unknown>[];
  bucketResults?: number[];
  sessionResults?: number[];
  rateLimitResults?: number[];
  deviceCodeResults?: number[];
}) {
  const calls: FakeCall[] = [];
  const bucketResults = [...(options.bucketResults ?? [])];
  const sessionResults = [...(options.sessionResults ?? [])];
  const rateLimitResults = [...(options.rateLimitResults ?? [])];
  const deviceCodeResults = [...(options.deviceCodeResults ?? [])];
  const db = {
    calls,
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) return [options.settings];
      if (sql.includes("usage_rate_limits")) {
        return [{ affectedRows: rateLimitResults.shift() ?? 0 }];
      }
      if (sql.includes("usage_device_codes")) {
        return [{ affectedRows: deviceCodeResults.shift() ?? 0 }];
      }
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
  /* 4 per-user DELETEs + 2 global ones. */
  assert.equal(deletes.length, 6);
  const cutoffOf = (userId: number, table: string) =>
    deletes.find((c) => c.params[0] === userId && c.sql.includes(table))?.params[1];
  assert.equal(cutoffOf(1, "usage_buckets"), "2026-07-17 00:00:00.000");
  assert.equal(cutoffOf(1, "usage_sessions"), "2026-07-17 00:00:00.000");
  assert.equal(cutoffOf(2, "usage_buckets"), "2025-08-16 00:00:00.000");
  assert.equal(cutoffOf(2, "usage_sessions"), "2025-08-16 00:00:00.000");
});

test("global cleanup keeps 7-day-old rate-limit rows and terminal device codes bounded (P1-7)", async () => {
  const db = fakeDb({ settings: [], rateLimitResults: [80], deviceCodeResults: [5] });
  const stats = await applyUsageRetention(db, NOW);
  assert.equal(stats.rateLimitsDeleted, 80);
  assert.equal(stats.deviceCodesDeleted, 5);
  const rateLimits = db.calls.find((c) => c.sql.includes("DELETE FROM usage_rate_limits"));
  assert.ok(rateLimits);
  /* All scopes cleared together with no scope condition; the cutoff =
     window_start 7 days ago. */
  assert.equal(rateLimits.sql.includes("scope ="), false);
  assert.equal(rateLimits.params[0], "2026-08-09 00:00:00.000");
  const codes = db.calls.find((c) => c.sql.includes("DELETE FROM usage_device_codes"));
  assert.ok(codes);
  assert.match(codes.sql, /status IN \('expired', 'denied', 'delivered'\)/);
  assert.match(codes.sql, /created_at < \?/);
  assert.equal(codes.params[0], "2026-08-09 00:00:00.000");
});

test("users without a retention row are left untouched", async () => {
  const db = fakeDb({ settings: [{ user_id: 1, retention_days: 30 }] });
  await applyUsageRetention(db, NOW);
  const deletes = db.calls.filter((c) => c.sql.startsWith("DELETE"));
  assert.ok(deletes.length > 0);
  /* Per-user DELETEs lead with user_id; the two global ones lead with a
     date string — asserted separately. */
  const perUser = deletes.filter((c) =>
    c.sql.includes("user_id = ?") || c.sql.includes("user_id"));
  assert.ok(perUser.length > 0);
  assert.ok(perUser.every((c) => c.params[0] === 1));
});

test("retention reports per-table counts and affected users, batched", async () => {
  const db = fakeDb({
    settings: [
      { user_id: 1, retention_days: 30 },
      { user_id: 2, retention_days: 30 },
    ],
    /* User 1's buckets fill a batch and repeat; their sessions never
       expire; user 2 has only expiring sessions. */
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
  assert.deepEqual(first, {
    users: 1,
    bucketsDeleted: 42,
    sessionsDeleted: 3,
    rateLimitsDeleted: 0,
    deviceCodesDeleted: 0,
  });
  const second = await applyUsageRetention(db, NOW);
  assert.deepEqual(second, {
    users: 0,
    bucketsDeleted: 0,
    sessionsDeleted: 0,
    rateLimitsDeleted: 0,
    deviceCodesDeleted: 0,
  });
});
