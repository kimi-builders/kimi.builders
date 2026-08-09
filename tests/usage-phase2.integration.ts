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
import { exportUsageData } from "../src/lib/usage/export";
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
function clientMeta(extra: Record<string, unknown> = {}) {
  syncCounter += 1;
  return {
    surface: "cli",
    surfaceVersion: "0.2.0",
    parserVersion: "multi-v0.2.0",
    platform: "darwin",
    syncId: `00000000-0000-4000-8000-${String(syncCounter).padStart(12, "0")}`,
    batchIndex: 0,
    batchCount: 1,
    ...extra,
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
  const priceMigration = [
    "../db/migrations/20260809_usage_phase2.sql",
    "../db/migrations/20260809_usage_prices_v2.sql",
    "../db/migrations/20260810_usage_prices_v3.sql",
    "../db/migrations/20260811_usage_prices_v4.sql",
  ]
    .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
    .join("\n;\n");
  const statementsOf = (sql: string) => sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  // Fresh schema already has the query indexes. Drop and replay the upgrade
  // migration once so both new installs and existing databases are covered.
  await pool.query("DROP INDEX idx_usage_bucket_project_time ON usage_buckets");
  await pool.query("DROP INDEX idx_usage_session_user_overlap ON usage_sessions");
  await pool.query("DROP INDEX idx_usage_session_agent_overlap ON usage_sessions");
  const queryIndexMigration = readFileSync(
    new URL("../db/migrations/20260814_usage_query_indexes.sql", import.meta.url),
    "utf8",
  );
  for (const statement of statementsOf(queryIndexMigration)) await pool.query(statement);
  const [queryIndexes] = await pool.query<RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.statistics
     WHERE TABLE_SCHEMA = DATABASE()
       AND INDEX_NAME IN (
         'idx_usage_bucket_project_time',
         'idx_usage_session_user_overlap',
         'idx_usage_session_agent_overlap'
       )
     GROUP BY INDEX_NAME`,
  );
  assert.equal(queryIndexes.length, 3);
  const statements = statementsOf(priceMigration);
  assert.ok(statements.length >= 2);
  for (let round = 0; round < 2; round += 1) {
    for (const statement of statements) await pool.query(statement);
  }
  // Fresh integration schemas already include the v5 columns. Execute the
  // migration's idempotent price-data section twice to verify provenance and
  // long-context seed stability without re-running ALTER TABLE.
  const costFactsMigration = readFileSync(
    new URL("../db/migrations/20260813_usage_cost_facts.sql", import.meta.url),
    "utf8",
  );
  const priceDataStart = costFactsMigration.indexOf("UPDATE usage_model_prices");
  assert.ok(priceDataStart > 0);
  const costFactStatements = statementsOf(costFactsMigration.slice(priceDataStart));
  for (let round = 0; round < 2; round += 1) {
    for (const statement of costFactStatements) await pool.query(statement);
  }
  const [priceCount] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count,
            SUM(pricing_source_url <> '' AND verified_at IS NOT NULL) AS verified_count
       FROM usage_model_prices`,
  );
  assert.equal(Number(priceCount[0].count), 47); // v1–v4 42 + GPT-5.6 long-context 5
  assert.equal(Number(priceCount[0].verified_count), 47);
  const [correctedPrices] = await pool.query<RowDataPacket[]>(
    `SELECT model_pattern, input_per_mtok, cache_read_per_mtok, output_per_mtok
       FROM usage_model_prices
      WHERE model_pattern IN ('gpt-5.5-pro', 'gpt-5.4', 'gemini-3-flash-preview')`,
  );
  const priceByModel = new Map(correctedPrices.map((row) => [String(row.model_pattern), row]));
  assert.equal(Number(priceByModel.get("gpt-5.5-pro")?.output_per_mtok), 180);
  assert.equal(Number(priceByModel.get("gpt-5.4")?.cache_read_per_mtok), 0.25);
  assert.equal(Number(priceByModel.get("gemini-3-flash-preview")?.input_per_mtok), 0.5);
  assert.equal(Number(priceByModel.get("gemini-3-flash-preview")?.output_per_mtok), 3);

  const [codexPrices] = await pool.query<RowDataPacket[]>(
    `SELECT model_pattern, source, effective_from, effective_to,
            input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok
       FROM usage_model_prices
      WHERE version = '2026-08-11'
      ORDER BY model_pattern, effective_from`,
  );
  assert.equal(codexPrices.length, 6);
  const sol = codexPrices.find((row) => row.model_pattern === "gpt-5.6");
  assert.equal(Number(sol?.input_per_mtok), 5);
  assert.equal(Number(sol?.cache_write_per_mtok), 6.25);
  assert.equal(Number(sol?.cache_read_per_mtok), 0.5);
  assert.equal(Number(sol?.output_per_mtok), 30);
  const autoReview = codexPrices.find((row) => row.model_pattern === "codex-auto-review");
  assert.equal(autoReview?.source, "codex");
  assert.equal(Number(autoReview?.input_per_mtok), 2.5);
  assert.equal(Number(autoReview?.cache_read_per_mtok), 0.25);
  assert.equal(Number(autoReview?.output_per_mtok), 15);
  const [longContextPrices] = await pool.query<RowDataPacket[]>(
    `SELECT model_pattern, input_per_mtok, cache_read_per_mtok, output_per_mtok,
            pricing_source_url, verified_at
       FROM usage_model_prices
      WHERE version = '2026-08-13' AND context_tier = 'long'`,
  );
  assert.equal(longContextPrices.length, 5);
  const longSol = longContextPrices.find((row) => row.model_pattern === "gpt-5.6");
  assert.equal(Number(longSol?.input_per_mtok), 10);
  assert.equal(Number(longSol?.cache_read_per_mtok), 1);
  assert.equal(Number(longSol?.output_per_mtok), 45);
  assert.match(String(longSol?.pricing_source_url), /developers\.openai\.com/);

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

    // —— 设备事实可信度:后续 CLI fallback 不覆盖 Warp;Agent 版本增量合并 ——
    await ingestUsage(
      deviceA.principal,
      validateUsageIngest({
        protocolVersion: 2,
        client: clientMeta({
          device: {
            terminal: {
              name: "Warp",
              version: "v0.2026.07.29.09.05.stable_02",
              confidence: "detected",
            },
            os: { name: "macOS", version: "26.5.2", architecture: "arm64" },
          },
          agentVersions: { codex: "0.146.1" },
        }),
        buckets: [],
        sessions: [],
      }, settings),
    );
    await ingestUsage(
      deviceA.principal,
      validateUsageIngest({
        protocolVersion: 2,
        client: clientMeta({
          device: {
            terminal: { name: "CLI", confidence: "fallback" },
            os: { name: "macOS", version: "26.5.2", architecture: "arm64" },
          },
          agentVersions: { "kimi-code": "1.44.0" },
        }),
        buckets: [],
        sessions: [],
      }, settings),
    );
    const [deviceFacts] = await pool.query<RowDataPacket[]>(
      `SELECT terminal_name, terminal_version, terminal_confidence, agent_versions
         FROM usage_devices WHERE id = ?`,
      [deviceA.principal.deviceId],
    );
    assert.equal(deviceFacts[0].terminal_name, "Warp");
    assert.equal(deviceFacts[0].terminal_version, "v0.2026.07.29.09.05.stable_02");
    assert.equal(deviceFacts[0].terminal_confidence, "detected");
    const agentVersions = typeof deviceFacts[0].agent_versions === "string"
      ? JSON.parse(deviceFacts[0].agent_versions)
      : deviceFacts[0].agent_versions;
    assert.deepEqual(agentVersions, { codex: "0.146.1", "kimi-code": "1.44.0" });

    // —— 一致性:parser 产物 = 服务端聚合 ——
    const overview = await getUsageOverview(userId, filters());
    const expected = FIXTURE.expected;
    assert.equal(overview.meta.diagnostics.statements, 15);
    assert.ok(overview.meta.diagnostics.rowsFetched > 0);
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
    assert.equal(overview.lifetimeTokens, expected.total);
    assert.equal(overview.records.total, 3); // 同日 × 3 来源/模型
    assert.equal(overview.totals.activeDevices, 1);
    const gridTotal = (grid: number[][]) => grid.flat().reduce((sum, value) => sum + value, 0);
    assert.equal(gridTotal(overview.heatmap.inputTokens), expected.input);
    assert.equal(gridTotal(overview.heatmap.cacheWriteInputTokens), expected.cacheWrite);
    assert.equal(gridTotal(overview.heatmap.cacheReadInputTokens), expected.cacheRead);
    assert.equal(gridTotal(overview.heatmap.outputTokens), expected.output);
    assert.equal(gridTotal(overview.heatmap.reasoningOutputTokens), expected.reasoning);
    assert.equal(
      overview.weekly.trend.reduce((sum, row) => sum + row.totalTokens, 0),
      expected.total,
    );
    assert.ok(overview.meta.pricingMatches.some((row) => row.model === "gpt-5-codex"));

    // kimi-code/k3 在摄入时被归一为 canonical kimi-k3,命中 v1 前缀行(3.00/15.00/缓存读 0.30):
    // 150×3 + 20×3(写回退 input)+ 40×0.3 + 15×15 = 747 micros
    assert.ok(!overview.meta.unpricedModels.includes("kimi-code/k3"));
    assert.ok(overview.meta.pricingVersions.includes("2026-08-08"));
    const kimiMatch = overview.meta.pricingMatches.find(
      (row) => row.model === "kimi-code/k3",
    );
    assert.equal(kimiMatch?.modelCanonical, "kimi-k3");
    assert.equal(kimiMatch?.matchedPattern, "kimi-k3");
    // claude-opus-4: 300×5 + 105×6.25 + 50×0.5 + 30×25 = 2931.25 micros
    // gpt-5-codex: 700×1.25 + 200×0.125 + 80×10 + 40×10 = 2100 micros
    assert.ok(Math.abs(overview.totals.costMicros - (5031.25 + 747)) < 1);

    // —— 新 Collector 精确小时活动:跨日 active/prompt 必须落到各自日期,不能挤在首日 ——
    const exactSessionHash = "d".repeat(64);
    await ingestUsage(
      deviceA.principal,
      validateUsageIngest(
        {
          protocolVersion: 2,
          client: clientMeta(),
          buckets: [],
          sessions: [
            {
              source: "codex",
              sessionHash: exactSessionHash,
              firstMessageAt: "2026-08-01T23:58:00.000Z",
              lastMessageAt: "2026-08-02T00:01:00.000Z",
              durationSeconds: 180,
              activeSeconds: 120,
              messageCount: 3,
              userMessageCount: 1,
              userPromptHours: Array.from({ length: 24 }, (_, hour) =>
                hour === 23 ? 1 : 0,
              ),
              activityHours: [
                {
                  hourStart: "2026-08-01T23:00:00.000Z",
                  activeSeconds: 60,
                  userMessageCount: 1,
                },
                {
                  hourStart: "2026-08-02T00:00:00.000Z",
                  activeSeconds: 60,
                  userMessageCount: 0,
                },
              ],
            },
          ],
        },
        settings,
      ),
    );
    const exactHeatmap = await getUsageOverview(userId, filters());
    // 2026-08-01 = 周六(index 5),2026-08-02 = 周日(index 6)
    assert.equal(exactHeatmap.heatmap.activeSeconds[5][23] - overview.heatmap.activeSeconds[5][23], 60);
    assert.equal(exactHeatmap.heatmap.activeSeconds[6][0] - overview.heatmap.activeSeconds[6][0], 60);
    assert.equal(exactHeatmap.heatmap.prompts[5][23] - overview.heatmap.prompts[5][23], 1);
    assert.equal(exactHeatmap.heatmap.prompts[6][0] - overview.heatmap.prompts[6][0], 0);
    const activeOn = (value: typeof exactHeatmap, day: string) =>
      value.trend.find((row) => row.day === day)?.activeSeconds ?? 0;
    assert.equal(activeOn(exactHeatmap, "2026-08-01") - activeOn(overview, "2026-08-01"), 60);
    assert.equal(activeOn(exactHeatmap, "2026-08-02") - activeOn(overview, "2026-08-02"), 60);
    await pool.query(
      "DELETE FROM usage_sessions WHERE user_id = ? AND session_hash = UNHEX(?)",
      [userId, exactSessionHash],
    );

    // v3 hourly facts clip every session metric, even when first_message_at
    // is outside the selected day.
    const clippedSessionHash = "e".repeat(64);
    await ingestUsage(
      deviceA.principal,
      validateUsageIngest({
        protocolVersion: 2,
        client: clientMeta(),
        buckets: [],
        sessions: [{
          source: "copilot-cli",
          agentVersion: "v3-range-test",
          sessionHash: clippedSessionHash,
          firstMessageAt: "2026-08-01T23:58:00.000Z",
          lastMessageAt: "2026-08-02T00:02:00.000Z",
          durationSeconds: 240,
          activeSeconds: 120,
          messageCount: 4,
          userMessageCount: 2,
          userPromptHours: Array.from({ length: 24 }, (_, hour) => hour === 0 || hour === 23 ? 1 : 0),
          activityHours: [
            {
              hourStart: "2026-08-01T23:00:00.000Z",
              activeSeconds: 60,
              engagedSeconds: 120,
              messageCount: 2,
              userMessageCount: 1,
            },
            {
              hourStart: "2026-08-02T00:00:00.000Z",
              activeSeconds: 60,
              engagedSeconds: 120,
              messageCount: 2,
              userMessageCount: 1,
            },
          ],
        }],
      }, settings),
    );
    const clipped = await getUsageOverview(
      userId,
      parseUsageFilters(
        { from: "2026-08-02", to: "2026-08-02", sources: "copilot-cli", agentVersions: "v3-range-test" },
        { uploadProject: true, tzOffsetMinutes: 0, now: new Date("2026-08-08T12:00:00Z") },
      ),
    );
    assert.equal(clipped.totals.sessions, 1);
    assert.equal(clipped.totals.activeSeconds, 60);
    assert.equal(clipped.totals.durationSeconds, 120);
    assert.equal(clipped.totals.messages, 2);
    assert.equal(clipped.totals.userMessages, 1);
    await pool.query(
      "DELETE FROM usage_sessions WHERE user_id = ? AND session_hash = UNHEX(?)",
      [userId, clippedSessionHash],
    );

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
    assert.equal(projectOff.meta.diagnostics.statements, 14);

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
    assert.equal(publicB.bucketCount, 1);
    assert.equal(publicB.sessionCount, 0);
    const publicA = devices.find((device) => device.id === deviceA.deviceId);
    assert.ok(publicA);
    assert.ok(publicA.bucketCount > 0);
    assert.ok(publicA.sessionCount > 0);
    const privateExport = await exportUsageData(userId);
    assert.equal(privateExport.version, 3);
    assert.equal(privateExport.truncated, false);
    assert.equal(privateExport.counts.buckets.total, privateExport.buckets.length);
    assert.equal(privateExport.counts.sessions.total, privateExport.sessions.length);
    assert.equal(privateExport.counts.buckets.exported, privateExport.buckets.length);
    assert.equal(privateExport.limits.buckets, 100_000);
    const byDevice = await getUsageOverview(userId, filters({ devices: publicB.id }));
    assert.equal(byDevice.totals.totalTokens, 1000);
    assert.equal(byDevice.lifetimeTokens, 1000);
    assert.equal(byDevice.totals.activeDevices, 1);
    const combo = await getUsageOverview(
      userId,
      filters({ sources: "codex", devices: publicB.id }),
    );
    assert.equal(combo.totals.totalTokens, 1000);

    // —— 用户隔离 ——
    const bystander = await getUsageOverview(otherUserId, filters());
    assert.equal(bystander.totals.totalTokens, 0);
    assert.equal(bystander.lifetimeTokens, 0);
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
    for (const start of ["2026-08-31 23:30:00", "2026-09-01 00:00:00"]) {
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
        { from: "2026-08-10", to: "2026-10-20" },
        { uploadProject: true, tzOffsetMinutes: 0, now: new Date("2026-11-01T00:00:00Z") },
      ),
    );
    // 两个体验价桶 + 两个标准价桶 = $10；每条事实独立命中价格窗口。
    assert.ok(Math.abs(windowed.totals.costMicros - 10_000_000) < 1);
    assert.equal(windowed.totals.totalTokens, 4_000_000);
    assert.equal(windowed.meta.pricedTokens, 4_000_000);
    assert.equal(windowed.meta.unpricedTokens, 0);
    assert.equal(windowed.meta.pricingCoverage, 1);
    assert.equal(
      windowed.trend.reduce((sum, row) => sum + row.totalTokens, 0),
      windowed.totals.totalTokens,
    );
    assert.equal(
      windowed.trend.reduce((sum, row) => sum + row.costMicros, 0),
      windowed.totals.costMicros,
    );
    for (const distribution of [
      windowed.distributions.source,
      windowed.distributions.model,
      windowed.distributions.project,
      windowed.distributions.device,
    ]) {
      assert.equal(
        distribution.rows.reduce((sum, row) => sum + row.tokens, 0),
        windowed.totals.totalTokens,
      );
      assert.equal(
        distribution.rows.reduce((sum, row) => sum + row.costMicros, 0),
        windowed.totals.costMicros,
      );
    }
    const sameLocalDay = await getUsageOverview(
      userId,
      parseUsageFilters(
        { from: "2026-08-31", to: "2026-08-31", sources: "claude-code" },
        { uploadProject: true, tzOffsetMinutes: -60, now: new Date("2026-11-01T00:00:00Z") },
      ),
    );
    assert.equal(sameLocalDay.records.rows.length, 1);
    assert.equal(sameLocalDay.records.rows[0].totalTokens, 2_000_000);
    assert.ok(Math.abs(sameLocalDay.records.rows[0].costMicros - 5_000_000) < 1);
    assert.ok(Math.abs(sameLocalDay.totals.costMicros - 5_000_000) < 1);

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
