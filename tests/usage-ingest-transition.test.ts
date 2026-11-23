import assert from "node:assert/strict";
import test from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type { UsageBucketV2 } from "../src/lib/usage-contract";
import { projectLabelHash } from "../src/lib/usage/crypto";
import {
  canonicalBucketModel,
  prepareBucketMetadataTransition,
} from "../src/lib/usage/ingest";

const principal = {
  keyId: 3,
  userId: 1,
  deviceId: 2,
  devicePublicId: "udv_test",
  scopes: new Set<string>(),
};

function bucket(inputTokens: number, extra: Partial<UsageBucketV2> = {}): UsageBucketV2 {
  return {
    source: "codex",
    model: "gpt-5.6-sol",
    bucketStart: "2026-08-01T10:00:00.000Z",
    inputTokens,
    cacheWriteInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    requestCount: 1,
    measurement: "exact",
    ...extra,
  };
}

function existing(inputTokens: number, metadata = false, pricingMetadata = false) {
  return {
    source: "codex",
    model: "gpt-5.6-sol",
    model_provider: metadata ? "openai" : "",
    reasoning_effort: metadata ? "high" : "",
    agent_version: metadata ? "0.146.1" : "",
    context_tier: pricingMetadata ? "short" : "",
    processing_tier: pricingMetadata ? "standard" : "",
    project_hash: projectLabelHash(undefined).toString("hex").toUpperCase(),
    bucket_start: new Date("2026-08-01T10:00:00.000Z"),
    input_tokens: inputTokens,
    cache_write_input_tokens: 0,
    cache_write_5m_input_tokens: 0,
    cache_write_1h_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };
}

function connection(rows: ReturnType<typeof existing>[]) {
  const sql: string[] = [];
  return {
    sql,
    value: {
      async query(statement: string) {
        sql.push(statement);
        return statement.startsWith("SELECT") ? [rows] : [{}];
      },
    } as unknown as PoolConnection,
  };
}

test("server canonicalization owns the dated kimi-for-coding rollout", () => {
  const identity = {
    source: "kimi-code",
    model: "kimi-code/kimi-for-coding",
    modelCanonical: "kimi-k2.7-code",
  } satisfies Partial<UsageBucketV2>;
  assert.equal(
    canonicalBucketModel(bucket(100, {
      ...identity,
      bucketStart: "2026-09-10T23:59:59.999Z",
    })),
    "kimi-k2.7-code",
  );
  assert.equal(
    canonicalBucketModel(bucket(100, {
      ...identity,
      bucketStart: "2026-09-11T00:00:00.000Z",
    })),
    "kimi-k2.8-preview",
  );
});

test("metadata upgrade replaces an old unsplit bucket only at equal-or-larger total", async () => {
  const db = connection([existing(100)]);
  const incoming = [
    bucket(60, { reasoningEffort: "high", agentVersion: "0.146.1" }),
    bucket(40),
  ];
  const planned = await prepareBucketMetadataTransition(db.value, principal, incoming);
  assert.deepEqual(planned.accepted, incoming);
  assert.equal(planned.protectedCount, 0);
  assert.equal(db.sql.some((statement) => statement.startsWith("DELETE")), true);
});

test("metadata upgrade protects a larger old bucket instead of double-counting it", async () => {
  const db = connection([existing(120)]);
  const incoming = [
    bucket(60, { reasoningEffort: "high", agentVersion: "0.146.1" }),
    bucket(40),
  ];
  const planned = await prepareBucketMetadataTransition(db.value, principal, incoming);
  assert.deepEqual(planned.accepted, []);
  assert.equal(planned.protectedCount, 2);
  assert.equal(db.sql.some((statement) => statement.startsWith("DELETE")), false);
});

test("already-segmented server data bypasses the one-time transition", async () => {
  const db = connection([existing(60, true)]);
  const incoming = [bucket(60, { reasoningEffort: "high", agentVersion: "0.146.1" })];
  const planned = await prepareBucketMetadataTransition(db.value, principal, incoming);
  assert.deepEqual(planned.accepted, incoming);
  assert.equal(planned.protectedCount, 0);
  assert.equal(db.sql.some((statement) => statement.startsWith("DELETE")), false);
});

test("pricing metadata replaces a request-metadata-only aggregate", async () => {
  const db = connection([existing(100, true, false)]);
  const incoming = [bucket(100, {
    reasoningEffort: "high",
    agentVersion: "0.146.1",
    contextTier: "short",
    processingTier: "standard",
  })];
  const planned = await prepareBucketMetadataTransition(db.value, principal, incoming);
  assert.deepEqual(planned.accepted, incoming);
  assert.equal(planned.protectedCount, 0);
  assert.equal(db.sql.some((statement) => statement.startsWith("DELETE")), true);
});

test("GPT-6.2 prompt-length splits cannot coexist with a former single-tier row or erase another variant", async () => {
  const model = "gpt-6.2-astra";
  const old = { ...existing(100), model, processing_tier: "standard" };
  const incoming = [bucket(60, { model, processingTier: "standard", contextTier: "short" }),
    bucket(40, { model, processingTier: "standard", contextTier: "long" })];
  const ok = connection([old]);
  assert.deepEqual((await prepareBucketMetadataTransition(ok.value, principal, incoming)).accepted, incoming);
  assert.ok(ok.sql.some(s => s.startsWith("DELETE")));
  for (const other of [{ input_tokens: 101 }, { reasoning_effort: "high" }]) {
    const db = connection([{ ...old, ...other }]);
    assert.equal((await prepareBucketMetadataTransition(db.value, principal, incoming)).protectedCount, 2);
    assert.ok(!db.sql.some(s => s.startsWith("DELETE")));
  }
  const split = connection([{ ...old, context_tier: "long" }]);
  assert.equal((await prepareBucketMetadataTransition(split.value, principal, [bucket(100, { model })])).protectedCount, 1);
  assert.ok(!split.sql.some(s => s.startsWith("DELETE")));
  const formerFast = connection([{ ...old, input_tokens: 60 }, { ...old, input_tokens: 40, processing_tier: "" }]);
  const upgraded = [incoming[0], { ...incoming[1], processingTier: "priority" as const }];
  assert.deepEqual((await prepareBucketMetadataTransition(formerFast.value, principal, upgraded)).accepted, upgraded);
  assert.ok(formerFast.sql.some(s => s.startsWith("DELETE")));
});

test("OpenCode context upgrades protect old totals and ignore later unsplit replays", async () => {
  for (const model of ["openai/gpt-6.2-astra", "gpt-6.2-sol", "gpt-5.6-sol", "gpt-6-astra"]) {
    const source = "opencode";
    const old = { ...existing(100), source, model, model_provider: "openai" };
    const base = { source, model, modelProvider: "openai" } as const;
    const split = [
      bucket(60, { ...base, contextTier: "short" }),
      bucket(40, { ...base, contextTier: "long" }),
    ];
    for (const incomplete of [[split[0]], [split[0], bucket(50, base)]]) {
      const db = connection([old]);
      const result = await prepareBucketMetadataTransition(db.value, principal, incomplete);
      assert.equal(result.protectedCount, incomplete.length);
      assert.deepEqual(result.accepted, []);
      assert.ok(!db.sql.some(s => s.startsWith("DELETE")));
    }
    const db = connection([old]);
    assert.deepEqual((await prepareBucketMetadataTransition(db.value, principal, split)).accepted, split);
    assert.ok(db.sql.some(s => s.startsWith("DELETE")));
    const replay = connection([{ ...old, input_tokens: 60, context_tier: "short" }]);
    assert.equal((await prepareBucketMetadataTransition(replay.value, principal, [bucket(100, base)])).protectedCount, 1);
    assert.ok(!replay.sql.some(s => s.startsWith("DELETE")));
  }
});

test("first sync cannot store both an unsplit total and its context breakdown", async () => {
  const model = "gpt-6.2-sol";
  const separate = bucket(5, { model: "other" });
  const mixed = [bucket(100, { model }), bucket(100, { model, contextTier: "short" })];
  const db = connection([]);
  const result = await prepareBucketMetadataTransition(db.value, principal, [...mixed, separate]);
  assert.deepEqual(result, { accepted: [separate], protectedCount: 2 });
});

test("a bare legacy replay cannot replace a priced tier while awaiting a context upgrade", async () => {
  const model = "gpt-6.2-astra";
  const plain = bucket(100, { model });
  const priority = { ...existing(100), model, processing_tier: "priority" };
  const db = connection([priority]);
  assert.deepEqual(await prepareBucketMetadataTransition(db.value, principal, [plain]),
    { accepted: [], protectedCount: 1 });
  assert.ok(!db.sql.some(s => s.startsWith("DELETE")));
  const hasBoth = connection([priority, { ...existing(20), model }]);
  const update = bucket(25, { model });
  assert.deepEqual(await prepareBucketMetadataTransition(hasBoth.value, principal, [update]),
    { accepted: [update], protectedCount: 0 });
  assert.ok(!hasBoth.sql.some(s => s.startsWith("DELETE")));
});
