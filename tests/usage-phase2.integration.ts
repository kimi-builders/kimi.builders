/* Phase 2 数据库集成测试。只准在隔离库运行(DATABASE_URL 必须含 kbu-mysql)。
   覆盖:migration 幂等(连续执行两次)、跨仓库一致性 fixture、四维筛选与组合、
   用户隔离、未定价模型 token 保留、价格生效窗口、分页、按设备删除、Phase 1 兼容。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../src/lib/db";
import { authenticateUsageRequest } from "../src/lib/usage/auth";
import {
  createDeviceAuthorization,
  decideDeviceAuthorization,
  deleteUsageForDeviceByPublicId,
  exchangeDeviceCode,
  listUsageDevices,
} from "../src/lib/usage/device";
import { parseUsageFilters } from "../src/lib/usage/filters";
import { ingestUsage } from "../src/lib/usage/ingest";
import { getUsageDashboard, getUsageOverview } from "../src/lib/usage/query";
import { getUsageSettings } from "../src/lib/usage/settings";
import { validateUsageIngest } from "../src/lib/usage/validation";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run usage DB integration outside an isolated kbu-mysql database");
}
process.env.USAGE_KEY_PEPPER = "integration-only-usage-pepper-at-least-32-characters";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/usage-consistency-payload.json", import.meta.url), "utf8"),
) as {
  expected: Record<string, number>;
  buckets: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
};

const SETTINGS_ON = {
  uploadProject: true,
  uploadDeviceLabel: false,
  uploadQuotaSnapshots: false,
  retentionDays: 365,
};

async function provisionDevice(userId: number, name: string) {
  const authorization = await createDeviceAuthorization({
    clientName: "phase2 integration",
    deviceName: name,
    platform: "darwin",
    surface: "cli",
  });
  assert.equal(
    await decideDeviceAuthorization({
      userId,
      userCode: authorization.userCode,
      action: "approve",
      settings: SETTINGS_ON,
    }),
    "approved",
  );
  const token = await exchangeDeviceCode(authorization.deviceCode);
  if (token.status !== "approved") throw new Error("device token not delivered");
  const request = new Request("https://kimi.builders/api/usage/ingest", {
    headers: { Authorization: `Bearer ${token.apiKey}` },
  });
  const principal = await authenticateUsageRequest(request, "ingest");
  assert.ok(principal);
  return { principal, deviceId: token.deviceId };
}

let syncCounter = 0;
function clientMeta() {
  syncCounter += 1;
  return {
    surface: "cli",
    surfaceVersion: "0.2.0",
    parserVersion: "multi-v0.2.0",
    platform: "darwin",
    syncId: `00000000-0000-4000-8000-${String(syncCounter).padStart(12, "0")}`,
    batchIndex: 0,
    batchCount: 1,
  };
}

const RANGE = { from: "2026-07-31", to: "2026-08-02" };
const filters = (extra: Record<string, string> = {}, uploadProject = true) =>
  parseUsageFilters(
    { ...RANGE, ...extra },
    { uploadProject, tzOffsetMinutes: 0, now: new Date("2026-08-08T12:00:00.000Z") },
  );

async function main() {
  const pool = getPool();

  // —— migration 幂等:连续执行两次,价格行不翻倍 ——
  const migration = readFileSync(
    new URL("../db/migrations/20260809_usage_phase2.sql", import.meta.url),
    "utf8",
  );
  const statements = migration
    .split(/;\s*(?:\n|$)/)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  assert.ok(statements.length >= 2);
  for (let round = 0; round < 2; round += 1) {
    for (const statement of statements) await pool.query(statement);
  }
  const [priceCount] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM usage_model_prices",
  );
  assert.equal(Number(priceCount[0].count), 24);

  const handle = `phase2_${Date.now()}`;
  const [userResult] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (handle, name) VALUES (?, 'Phase2 integration')",
    [handle],
  );
  const userId = userResult.insertId;
  const [otherResult] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (handle, name) VALUES (?, 'Phase2 bystander')",
    [`${handle}_other`],
  );
  const otherUserId = otherResult.insertId;

  try {
    // —— 设备 A:摄入跨仓库一致性 fixture(两遍,验证幂等) ——
    const deviceA = await provisionDevice(userId, "integration A");
    const settings = await getUsageSettings(userId);
    const payload = validateUsageIngest(
      {
        protocolVersion: 2,
        client: clientMeta(),
        buckets: FIXTURE.buckets,
        sessions: FIXTURE.sessions,
      },
      settings,
    );
    await ingestUsage(deviceA.principal, payload);
    await ingestUsage(deviceA.principal, payload);

    // —— 一致性:parser 产物 = 服务端聚合 ——
    const overview = await getUsageOverview(userId, filters());
    const expected = FIXTURE.expected;
    assert.equal(overview.totals.inputTokens, expected.input);
    assert.equal(overview.totals.cacheWriteInputTokens, expected.cacheWrite);
    assert.equal(overview.totals.cacheReadInputTokens, expected.cacheRead);
    assert.equal(overview.totals.outputTokens, expected.output);
    assert.equal(overview.totals.reasoningOutputTokens, expected.reasoning);
    assert.equal(overview.totals.totalTokens, expected.total);
    assert.equal(overview.totals.requests, expected.requests);
    assert.equal(overview.totals.sessions, expected.sessions);
    assert.equal(overview.totals.userMessages, expected.userMessages);
    assert.equal(overview.totals.activeSeconds, expected.activeSeconds);
    assert.equal(overview.records.total, 3); // 同日 × 3 来源/模型
    assert.equal(overview.totals.activeDevices, 1);

    // 未定价模型(kimi-code/k3)token 照常统计、费用不计
    assert.ok(overview.meta.unpricedModels.includes("kimi-code/k3"));
    assert.ok(overview.meta.pricingVersions.includes("2026-08-08"));
    // claude-opus-4: 300×5 + 105×6.25 + 50×0.5 + 30×25 = 2931.25 micros
    // gpt-5-codex: 700×1.25 + 200×0.125 + 80×10 + 40×10 = 2100 micros
    assert.ok(Math.abs(overview.totals.costMicros - 5031.25) < 1);

    // —— 来源筛选 ——
    const codexOnly = await getUsageOverview(userId, filters({ sources: "codex" }));
    assert.equal(codexOnly.totals.totalTokens, 1020);
    assert.equal(codexOnly.totals.cacheReadInputTokens, 200);
    assert.equal(codexOnly.totals.reasoningOutputTokens, 40);
    assert.equal(codexOnly.totals.sessions, 1);

    // —— 模型筛选(token 口径;会话指标不按模型拆分) ——
    const byModel = await getUsageOverview(userId, filters({ models: "gpt-5-codex" }));
    assert.equal(byModel.totals.totalTokens, 1020);
    assert.equal(byModel.totals.sessions, 3); // 会话表无 model 列,按设计不被模型筛选

    // —— 项目筛选(开启时) ——
    const byProject = await getUsageOverview(userId, filters({ projects: "demo-app" }));
    assert.equal(byProject.totals.totalTokens, 225 + 485);
    assert.ok(byProject.records.rows.every((row) => row.project === "demo-app"));
    // —— 项目筛选(关闭时强制失效) ——
    const projectOff = await getUsageOverview(
      userId,
      filters({ projects: "demo-app" }, false),
    );
    assert.equal(projectOff.totals.totalTokens, expected.total);

    // —— 设备 B + 设备筛选 + 组合 ——
    const deviceB = await provisionDevice(userId, "integration B");
    const extraBucket = {
      source: "codex",
      model: "gpt-5.2",
      bucketStart: "2026-08-01T12:00:00.000Z",
      project: "demo-api",
      inputTokens: 1000,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      requestCount: 1,
      measurement: "exact",
    };
    await ingestUsage(
      deviceB.principal,
      validateUsageIngest(
        { protocolVersion: 2, client: clientMeta(), buckets: [extraBucket], sessions: [] },
        settings,
      ),
    );
    const devices = await listUsageDevices(userId);
    const publicB = devices.find((device) => device.name === "integration B");
    assert.ok(publicB);
    const byDevice = await getUsageOverview(userId, filters({ devices: publicB.id }));
    assert.equal(byDevice.totals.totalTokens, 1000);
    assert.equal(byDevice.totals.activeDevices, 1);
    const combo = await getUsageOverview(
      userId,
      filters({ sources: "codex", devices: publicB.id }),
    );
    assert.equal(combo.totals.totalTokens, 1000);

    // —— 用户隔离 ——
    const bystander = await getUsageOverview(otherUserId, filters());
    assert.equal(bystander.totals.totalTokens, 0);
    assert.equal(bystander.totals.sessions, 0);
    assert.equal(bystander.records.rows.length, 0);

    // —— 价格生效窗口(直插两行:8/15 体验价 $2、9/15 标准价 $3) ——
    for (const start of ["2026-08-15 00:00:00", "2026-09-15 00:00:00"]) {
      await pool.query(
        `INSERT INTO usage_buckets
           (user_id, device_id, source, model, project_label, project_hash, bucket_start,
            input_tokens, request_count, measurement)
         VALUES (?, ?, 'claude-code', 'claude-sonnet-5-20260101', NULL, UNHEX(SHA2('', 256)), ?,
                 1000000, 1, 'exact')`,
        [userId, deviceA.principal.deviceId, start],
      );
    }
    const windowed = await getUsageOverview(
      userId,
      parseUsageFilters(
        { from: "2026-08-10", to: "2026-09-20" },
        { uploadProject: true, tzOffsetMinutes: 0, now: new Date("2026-10-01T00:00:00Z") },
      ),
    );
    // 1M input × $2 + 1M input × $3 = $5 → 5e6 micros
    assert.ok(Math.abs(windowed.totals.costMicros - 5_000_000) < 1);

    // —— 分页 ——
    const page1 = await getUsageOverview(userId, filters({ ps: "2", page: "1" }));
    const page2 = await getUsageOverview(userId, filters({ ps: "2", page: "2" }));
    assert.equal(page1.records.rows.length, 2);
    assert.equal(page1.records.total, 4); // fixture 3 组 + 设备 B 1 组
    assert.equal(page2.records.rows.length, 2);

    // —— 按设备删除:数据消失、授权保留、统计立即一致 ——
    const deleted = await deleteUsageForDeviceByPublicId(userId, publicB.id);
    assert.ok((deleted ?? 0) > 0);
    const afterDelete = await getUsageOverview(userId, filters({ devices: publicB.id }));
    assert.equal(afterDelete.totals.totalTokens, 0);
    assert.equal((await getUsageOverview(userId, filters())).totals.totalTokens, expected.total);
    assert.ok(listUsageDevices(userId).then((list) => list.some((d) => d.id === publicB.id)));

    // —— Phase 1 兼容包装 ——
    const legacyShape = await getUsageDashboard(userId, 30);
    assert.equal(typeof legacyShape.totals.totalTokens, "number");
    assert.equal(legacyShape.activeDevices, 2);

    // —— 趋势粒度:长跨度按本地周一聚合,总量不变 ——
    const weekly = await getUsageOverview(
      userId,
      parseUsageFilters(
        { from: "2026-06-01", to: "2026-08-02" },
        { uploadProject: true, tzOffsetMinutes: 0, now: new Date("2026-08-08T12:00:00Z") },
      ),
    );
    assert.equal(weekly.trend.length > 0, true);
    for (const row of weekly.trend) {
      assert.equal(new Date(`${row.day}T00:00:00Z`).getUTCDay(), 1); // 周一
    }
    assert.equal(weekly.totals.totalTokens, expected.total);
    // 环比:previous 窗口(3-4 月,无数据)为零
    assert.equal(weekly.previous.totalTokens, 0);
  } finally {
    await pool.query("DELETE FROM users WHERE id IN (?, ?)", [userId, otherUserId]);
    await pool.end();
  }
}

main()
  .then(() => console.log("usage phase2 DB integration: passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
