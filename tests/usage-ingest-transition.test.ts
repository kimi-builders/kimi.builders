import assert from "node:assert/strict";
import test from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type { UsageBucketV2 } from "../src/lib/usage-contract";
import { projectLabelHash } from "../src/lib/usage/crypto";
import { prepareBucketMetadataTransition } from "../src/lib/usage/ingest";

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
