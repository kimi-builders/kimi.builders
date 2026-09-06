import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import { consumeUsageRateLimitResult } from "../src/lib/usage/rate-limit";

process.env.USAGE_KEY_PEPPER = "test-only-usage-rate-pepper-long-enough";

test("usage limiter returns the fixed window's remaining retry delay", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) {
        return [[{ attempts: 61, retry_after: 17 }]];
      }
      return [{}];
    },
  } as unknown as Pool;

  const result = await consumeUsageRateLimitResult(
    {
      scope: "usage-ingest",
      identity: "key:7",
      limit: 60,
      windowSeconds: 60,
    },
    db,
  );
  assert.deepEqual(result, { allowed: false, retryAfterSeconds: 17 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params[0], 60);
});

test("usage limiter clamps a stale retry delay to at least one second", async () => {
  const db = {
    async query(sql: string) {
      return sql.startsWith("SELECT")
        ? [[{ attempts: 61, retry_after: 0 }]]
        : [{}];
    },
  } as unknown as Pool;
  const result = await consumeUsageRateLimitResult(
    {
      scope: "usage-ingest",
      identity: "key:7",
      limit: 60,
      windowSeconds: 60,
    },
    db,
  );
  assert.equal(result.retryAfterSeconds, 1);
});
