import test from "node:test";
import assert from "node:assert/strict";
import { observedTokenTotal } from "../src/lib/usage-contract";
import { constantTimeHashEqual, usageHmac } from "../src/lib/usage/crypto";
import { validateUsageIngest, UsageRequestError } from "../src/lib/usage/validation";

process.env.USAGE_KEY_PEPPER = "test-only-usage-pepper-that-is-long-enough";

const settings = {
  uploadProject: false,
  uploadDeviceLabel: false,
  uploadQuotaSnapshots: false,
  showOnLeaderboard: false,
  retentionDays: 365,
};

function payload() {
  return {
    protocolVersion: 2,
    client: {
      surface: "cli",
      surfaceVersion: "0.1.0",
      parserVersion: "kimi-v0.1.0",
      platform: "darwin",
      syncId: "f74e775d-8d85-4b0d-b24a-a5d42e728b7b",
      batchIndex: 0,
      batchCount: 1,
    },
    buckets: [
      {
        source: "kimi-code",
        model: "kimi-code/k3",
        bucketStart: "2026-08-01T10:00:00.000Z",
        inputTokens: 10,
        cacheWriteInputTokens: 3,
        cacheReadInputTokens: 4,
        outputTokens: 2,
        reasoningOutputTokens: 1,
        requestCount: 1,
        measurement: "exact",
      },
    ],
    sessions: [
      {
        source: "kimi-code",
        sessionHash: "a".repeat(64),
        firstMessageAt: "2026-08-01T10:01:00.000Z",
        lastMessageAt: "2026-08-01T10:02:00.000Z",
        durationSeconds: 60,
        activeSeconds: 30,
        messageCount: 2,
        userMessageCount: 1,
        userPromptHours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    ],
  };
}

test("v2 contract keeps cache categories disjoint", () => {
  assert.equal(
    observedTokenTotal({
      inputTokens: 10,
      cacheWriteInputTokens: 3,
      cacheReadInputTokens: 4,
      outputTokens: 2,
      reasoningOutputTokens: 1,
    }),
    20,
  );
  const parsed = validateUsageIngest(payload(), settings);
  assert.equal(parsed.buckets[0].cacheWriteInputTokens, 3);
  assert.equal(parsed.buckets[0].cacheReadInputTokens, 4);
});

test("v2 contract accepts local Dashboard initiated syncs", () => {
  const value = payload();
  value.client.surface = "local-dashboard";
  assert.equal(validateUsageIngest(value, settings).client.surface, "local-dashboard");
});

test("v2 contract preserves factual device, model, effort, and Agent version metadata", () => {
  const value = payload() as ReturnType<typeof payload> & {
    client: ReturnType<typeof payload>["client"] & {
      device: {
        terminal: { name: string; version: string; confidence: "detected" };
        os: { name: string; version: string; architecture: string };
      };
      agentVersions: Record<string, string>;
    };
  };
  value.client.device = {
    terminal: {
      name: "Warp",
      version: "v0.2026.07.29.09.05.stable_02",
      confidence: "detected",
    },
    os: { name: "macOS", version: "26.5.2", architecture: "arm64" },
  };
  value.client.agentVersions = { "kimi-code": "1.44.0", codex: "0.146.1" };
  Object.assign(value.buckets[0], {
    modelCanonical: "kimi-k3",
    modelProvider: "moonshot",
    reasoningEffort: "HIGH",
    agentVersion: "1.44.0",
    contextTier: "short",
    processingTier: "standard",
    cacheWrite5mInputTokens: 1,
    cacheWrite1hInputTokens: 2,
  });
  Object.assign(value.sessions[0], { agentVersion: "1.44.0" });

  const parsed = validateUsageIngest(value, settings);
  assert.deepEqual(parsed.client.device, value.client.device);
  assert.deepEqual(parsed.client.agentVersions, value.client.agentVersions);
  assert.equal(parsed.buckets[0].model, "kimi-code/k3");
  assert.equal(parsed.buckets[0].modelCanonical, "kimi-k3");
  assert.equal(parsed.buckets[0].reasoningEffort, "high");
  assert.equal(parsed.buckets[0].agentVersion, "1.44.0");
  assert.equal(parsed.buckets[0].contextTier, "short");
  assert.equal(parsed.buckets[0].processingTier, "standard");
  assert.equal(parsed.buckets[0].cacheWrite5mInputTokens, 1);
  assert.equal(parsed.buckets[0].cacheWrite1hInputTokens, 2);
  assert.equal(parsed.sessions[0].agentVersion, "1.44.0");
});

test("v2 contract accepts exact calendar-hour session activity", () => {
  const value = payload();
  const rawSession = value.sessions[0] as typeof value.sessions[0] & {
    activityHours: Array<{
      hourStart: string;
      activeSeconds: number;
      userMessageCount: number;
    }>;
  };
  rawSession.activityHours = [
    {
      hourStart: "2026-08-01T10:00:00.000Z",
      activeSeconds: 30,
      userMessageCount: 1,
    },
  ];
  const parsed = validateUsageIngest(value, settings);
  assert.deepEqual(parsed.sessions[0].activityHours, rawSession.activityHours);
});

test("v2 contract accepts complete v3 range-clippable session facts", () => {
  const value = payload();
  const rawSession = value.sessions[0] as typeof value.sessions[0] & {
    activityHours: Array<{
      hourStart: string;
      activeSeconds: number;
      engagedSeconds: number;
      messageCount: number;
      userMessageCount: number;
    }>;
  };
  rawSession.activityHours = [{
    hourStart: "2026-08-01T10:00:00.000Z",
    activeSeconds: 30,
    engagedSeconds: 60,
    messageCount: 2,
    userMessageCount: 1,
  }];
  const parsed = validateUsageIngest(value, settings);
  assert.deepEqual(parsed.sessions[0].activityHours, rawSession.activityHours);
});

test("v2 contract rejects inconsistent calendar-hour session totals", () => {
  const value = payload();
  const rawSession = value.sessions[0] as typeof value.sessions[0] & {
    activityHours: Array<{
      hourStart: string;
      activeSeconds: number;
      userMessageCount: number;
    }>;
  };
  rawSession.activityHours = [
    {
      hourStart: "2026-08-01T10:00:00.000Z",
      activeSeconds: 29,
      userMessageCount: 1,
    },
  ];
  assert.throws(
    () => validateUsageIngest(value, settings),
    (error) => error instanceof UsageRequestError && error.code === "invalid_payload",
  );
});

test("project fields are rejected when project upload is disabled", () => {
  const value = payload();
  value.buckets[0] = { ...value.buckets[0], project: "private-repo" } as typeof value.buckets[0];
  assert.throws(
    () => validateUsageIngest(value, settings),
    (error) => error instanceof UsageRequestError && error.code === "project_upload_disabled",
  );
});

test("usage credentials are compared as fixed-length HMAC digests", () => {
  const first = usageHmac(`kbu_${"a".repeat(43)}`);
  const same = usageHmac(`kbu_${"a".repeat(43)}`);
  const other = usageHmac(`kbu_${"b".repeat(43)}`);
  assert.equal(constantTimeHashEqual(first, same), true);
  assert.equal(constantTimeHashEqual(first, other), false);
});
