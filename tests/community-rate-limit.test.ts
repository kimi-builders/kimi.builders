import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "mysql2/promise";
import {
  buildCommunityRateConsumeSql,
  buildCommunityRateSelectSql,
  COMMUNITY_RATE_LIMITS,
  COMMUNITY_RATE_WINDOW_SECONDS,
  communityRateDecision,
  communityRateIdentityHash,
  communityRateScope,
  consumeCommunityRateLimit,
} from "../src/lib/rate-limit";

process.env.USAGE_KEY_PEPPER = "test-only-community-rate-pepper-long-enough";

interface FakeCall {
  sql: string;
  params: unknown[];
}

/* Minimal fake DB: the INSERT only records params; SELECTs return
   scripted count rows in order (default empty set). */
function fakeDb(options: { selectRows?: Record<string, unknown>[][] } = {}) {
  const calls: FakeCall[] = [];
  const selectRows = [...(options.selectRows ?? [])];
  const db = {
    calls,
    async query(sql: string, params: unknown[]): Promise<unknown[]> {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) return [selectRows.shift() ?? []];
      return [{}];
    },
  };
  return db as unknown as Pool & { calls: FakeCall[] };
}

test("limits follow the P1-5 contract: 10 posts / 30 comments / 120 votes / 30 uploads per hour (+ ai_summon 20, 20260816; + work 10, 20260822)", () => {
  assert.deepEqual(COMMUNITY_RATE_LIMITS, {
    post: 10,
    comment: 30,
    vote: 120,
    upload: 30,
    ai_summon: 20,
    work: 10,
  });
  assert.equal(COMMUNITY_RATE_WINDOW_SECONDS, 3600);
});

test("scope keys are per-action, so the same user gets independent counters", () => {
  assert.equal(communityRateScope("post"), "community:post");
  assert.equal(communityRateScope("comment"), "community:comment");
  assert.equal(communityRateScope("vote"), "community:vote");
  const user = 42;
  const postHash = communityRateIdentityHash(user, "post");
  assert.ok(postHash.equals(communityRateIdentityHash(user, "post")));
  assert.ok(!postHash.equals(communityRateIdentityHash(user, "vote")));
  assert.ok(!postHash.equals(communityRateIdentityHash(user + 1, "post")));
});

test("consume SQL is a fixed-window upsert: expired windows reset to 1", () => {
  const sql = buildCommunityRateConsumeSql();
  assert.match(sql, /INSERT INTO usage_rate_limits/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE/);
  /* The expiry condition and reset branch live in DB expressions; the
     two IFs each take one windowSeconds param. */
  assert.equal((sql.match(/TIMESTAMPADD\(SECOND, -\?, UTC_TIMESTAMP\(3\)\)/g) ?? []).length, 2);
  const select = buildCommunityRateSelectSql();
  assert.match(select, /TIMESTAMPDIFF\(SECOND, UTC_TIMESTAMP\(3\), TIMESTAMPADD\(SECOND, \?, window_start\)\) AS retry_after/);
});

test("decision: allowed at the limit boundary, rejected above it", () => {
  const base = { limit: 10, windowSeconds: 3600 };
  assert.deepEqual(
    communityRateDecision({ ...base, attempts: 10, retryAfter: 1800 }),
    { allowed: true, retryAfterSeconds: 1800 },
  );
  assert.deepEqual(
    communityRateDecision({ ...base, attempts: 11, retryAfter: 1800 }),
    { allowed: false, retryAfterSeconds: 1800 },
  );
});

test("decision: retryAfter is clamped into [1, windowSeconds]", () => {
  const base = { limit: 10, windowSeconds: 3600, attempts: 11 };
  /* TIMESTAMPDIFF truncates to whole seconds: a nearly-expired window
     computes 0 and a just-expired one negative — keep at least 1 second. */
  assert.equal(communityRateDecision({ ...base, retryAfter: 0 }).retryAfterSeconds, 1);
  assert.equal(communityRateDecision({ ...base, retryAfter: -3 }).retryAfterSeconds, 1);
  assert.equal(
    communityRateDecision({ ...base, retryAfter: 9999 }).retryAfterSeconds,
    3600,
  );
});

test("over-limit consume rejects with the window's remaining seconds", async () => {
  const db = fakeDb({ selectRows: [[{ attempts: 31, retry_after: 2400 }]] });
  const res = await consumeCommunityRateLimit(7, "comment", db);
  assert.deepEqual(res, { allowed: false, retryAfterSeconds: 2400 });
  /* The INSERT counts first, the SELECT decides after; scope and
     identity_hash land in both statements' params. */
  const [insert, select] = db.calls;
  assert.ok(insert.sql.startsWith("INSERT"));
  assert.deepEqual(insert.params[0], "community:comment");
  assert.deepEqual(insert.params.slice(2), [3600, 3600]);
  assert.ok(select.sql.startsWith("SELECT"));
  assert.deepEqual(select.params[1], "community:comment");
  assert.ok((insert.params[1] as Buffer).equals(select.params[2] as Buffer));
});

test("expired window: upsert resets the row, the fresh window allows again", async () => {
  /* After expiry the upsert has reset attempts to 1 and window_start to
     now. */
  const db = fakeDb({ selectRows: [[{ attempts: 1, retry_after: 3600 }]] });
  const res = await consumeCommunityRateLimit(7, "post", db);
  assert.deepEqual(res, { allowed: true, retryAfterSeconds: 3600 });
});

test("different actions consume against different scopes (independent counters)", async () => {
  const db = fakeDb({
    selectRows: [
      [{ attempts: 121, retry_after: 3000 }],
      [{ attempts: 1, retry_after: 3599 }],
    ],
  });
  const vote = await consumeCommunityRateLimit(7, "vote", db);
  const post = await consumeCommunityRateLimit(7, "post", db);
  assert.equal(vote.allowed, false); /* vote 爆了 */
  assert.equal(post.allowed, true); /* post 计数独立,不受影响 */
  const scopes = db.calls.map((c) => c.params).flat().filter((p) => typeof p === "string");
  assert.ok(scopes.includes("community:vote"));
  assert.ok(scopes.includes("community:post"));
});

test("missing row after upsert is treated as limited (fail-closed)", async () => {
  const db = fakeDb({ selectRows: [[]] });
  const res = await consumeCommunityRateLimit(7, "post", db);
  assert.deepEqual(res, { allowed: false, retryAfterSeconds: 3600 });
});
