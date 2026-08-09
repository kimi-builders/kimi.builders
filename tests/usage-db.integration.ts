import assert from "node:assert/strict";
import type { ResultSetHeader } from "mysql2";
import { getPool } from "../src/lib/db";
import { authenticateUsageRequest } from "../src/lib/usage/auth";
import {
  createDeviceAuthorization,
  decideDeviceAuthorization,
  exchangeDeviceCode,
  revokeUsageDevice,
} from "../src/lib/usage/device";
import { ingestUsage } from "../src/lib/usage/ingest";
import { getUsageDashboard } from "../src/lib/usage/query";
import { getUsageSettings } from "../src/lib/usage/settings";
import { updateUsageSettings } from "../src/lib/usage/settings";
import { validateUsageIngest } from "../src/lib/usage/validation";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run usage DB integration outside an isolated kbu-mysql database");
}
process.env.USAGE_KEY_PEPPER = "integration-only-usage-pepper-at-least-32-characters";

async function main() {
  const pool = getPool();
  const handle = `phase1_${Date.now()}`;
  const [userResult] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (handle, name) VALUES (?, 'Usage integration')",
    [handle],
  );
  const userId = userResult.insertId;

  try {
  const authorization = await createDeviceAuthorization({
    clientName: "integration collector",
    deviceName: "integration device",
    platform: "darwin",
    surface: "cli",
  });
  assert.equal(authorization.expiresIn, 600);
  assert.equal(
    await decideDeviceAuthorization({
      userId,
      userCode: authorization.userCode,
      action: "approve",
      settings: {
        uploadProject: false,
        uploadDeviceLabel: false,
        uploadQuotaSnapshots: false,
        retentionDays: 365,
      },
    }),
    "approved",
  );
  const token = await exchangeDeviceCode(authorization.deviceCode);
  assert.equal(token.status, "approved");
  if (token.status !== "approved") throw new Error("device token not delivered");
  assert.match(token.apiKey, /^kbu_/);
  assert.equal((await exchangeDeviceCode(authorization.deviceCode)).status, "expired_token");

  const request = new Request("https://kimi.builders/api/usage/ingest", {
    headers: { Authorization: `Bearer ${token.apiKey}` },
  });
  const principal = await authenticateUsageRequest(request, "ingest");
  assert.ok(principal);
  const now = new Date();
  now.setUTCMinutes(now.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
  const first = new Date(now.getTime() + 60_000);
  const last = new Date(now.getTime() + 120_000);
  const payload = validateUsageIngest(
    {
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
          bucketStart: now.toISOString(),
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
          sessionHash: "b".repeat(64),
          firstMessageAt: first.toISOString(),
          lastMessageAt: last.toISOString(),
          durationSeconds: 60,
          activeSeconds: 30,
          messageCount: 2,
          userMessageCount: 1,
          userPromptHours: Array.from({ length: 24 }, (_, hour) =>
            hour === first.getUTCHours() ? 1 : 0,
          ),
        },
      ],
    },
    await getUsageSettings(userId),
  );
  await ingestUsage(principal, payload);
  await ingestUsage(principal, payload);
  const smallerResult = await ingestUsage(principal, {
    ...payload,
    buckets: payload.buckets.map((bucket) => ({
      ...bucket,
      inputTokens: 1,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 1,
      reasoningOutputTokens: 0,
    })),
  });
  assert.equal(smallerResult.buckets, 0);
  assert.equal(smallerResult.protectedBuckets, 1);
  const dashboard = await getUsageDashboard(userId, 7);
  assert.equal(dashboard.totals.totalTokens, 20);
  assert.equal(dashboard.totals.sessions, 1);
  assert.equal(dashboard.totals.activeSeconds, 30);

  await updateUsageSettings(userId, {
    uploadProject: true,
    uploadDeviceLabel: false,
    uploadQuotaSnapshots: false,
    retentionDays: 365,
  });
  await ingestUsage(principal, {
    ...payload,
    buckets: payload.buckets.map((bucket) => ({ ...bucket, project: "private-project" })),
    sessions: payload.sessions.map((session) => ({ ...session, project: "private-project" })),
  });
  await updateUsageSettings(userId, {
    uploadProject: false,
    uploadDeviceLabel: false,
    uploadQuotaSnapshots: false,
    retentionDays: 365,
  });
  await ingestUsage(principal, payload);
  const [privacyRows] = await pool.query<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(*) AS count, MAX(project_label) AS project_label
     FROM usage_buckets WHERE user_id = ? AND device_id = ?`,
    [userId, principal.deviceId],
  );
  assert.equal(Number(privacyRows[0].count), 1);
  assert.equal(privacyRows[0].project_label, null);
  const [privacySessions] = await pool.query<import("mysql2").RowDataPacket[]>(
    `SELECT COUNT(*) AS count, MAX(project_label) AS project_label,
            HEX(MAX(project_hash)) AS project_hash
     FROM usage_sessions WHERE user_id = ? AND device_id = ?`,
    [userId, principal.deviceId],
  );
  assert.equal(Number(privacySessions[0].count), 1);
  assert.equal(privacySessions[0].project_label, null);
  assert.equal(
    String(privacySessions[0].project_hash).toLowerCase(),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal((await getUsageDashboard(userId, 7)).totals.totalTokens, 20);

  assert.equal(await revokeUsageDevice(userId, token.deviceId, false), true);
  assert.equal(await authenticateUsageRequest(request, "ingest"), null);
  } finally {
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    await pool.end();
  }
}

main()
  .then(() => console.log("usage DB integration: passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
