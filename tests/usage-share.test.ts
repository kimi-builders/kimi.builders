import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShareStackedCells,
  buildShareWeeks,
  mockUsageShareSnapshot,
  normalizeUsageShareRange,
  shareFlowFromTotals,
  shareTopTools,
  USAGE_SHARE_RANGES,
  weeklyStreak,
} from "../src/lib/usage/share";

test("share ranges accept only the six public presets", () => {
  for (const range of USAGE_SHARE_RANGES) {
    assert.equal(normalizeUsageShareRange(range), range);
  }
  assert.equal(normalizeUsageShareRange("custom"), "30d");
  assert.equal(normalizeUsageShareRange(undefined), "30d");
});

test("share snapshots keep one shell while adapting the activity story", () => {
  const today = mockUsageShareSnapshot("today");
  const hours = mockUsageShareSnapshot("24h");
  const week = mockUsageShareSnapshot("7d");
  const month = mockUsageShareSnapshot("30d");
  const quarter = mockUsageShareSnapshot("90d");
  const all = mockUsageShareSnapshot("all");

  assert.deepEqual(
    [today.main.kind, hours.main.kind, week.main.kind, month.main.kind, quarter.main.kind, all.main.kind],
    ["hours", "hours", "weekheat", "stacked", "calendar", "calendar"],
  );
  assert.equal(today.main.cells.length, 24);
  assert.equal(hours.main.cells.length, 24);
  assert.equal(week.main.cells.length, 7);
  assert.equal(month.main.cells.length, 30);
  /* 贡献图跨度:90D = 13 个自然周(3 个月),ALL = 26 周(半年封顶)。 */
  assert.equal(quarter.main.cells.length, 13 * 7);
  assert.equal(all.main.cells.length, 26 * 7);
  assert.match(month.main.eyebrow, /30 天/);
  assert.match(quarter.main.headline, /^12 周/);
});

test("share snapshots contain only public identity and aggregate facts", () => {
  const snapshot = mockUsageShareSnapshot("90d");
  assert.deepEqual(Object.keys(snapshot.user).sort(), ["handle", "initials", "name"]);
  assert.ok(snapshot.totalTokens > 0);
  assert.ok(snapshot.lifetimeTokens >= snapshot.totalTokens || snapshot.range === "all");
  assert.ok(snapshot.costMicros > 0);
  assert.ok(snapshot.toolCount > 0);
});

test("flow aggregates four mutually-exclusive token classes", () => {
  const flow = shareFlowFromTotals({
    inputTokens: 100,
    cacheWriteInputTokens: 30,
    cacheReadInputTokens: 800,
    outputTokens: 10,
    reasoningOutputTokens: 40,
  });
  assert.deepEqual(flow, {
    inputTokens: 130,
    cacheReadTokens: 800,
    outputTokens: 10,
    reasoningTokens: 40,
  });
  const snapshot = mockUsageShareSnapshot("90d");
  const flowTotal =
    snapshot.flow.inputTokens +
    snapshot.flow.cacheReadTokens +
    snapshot.flow.outputTokens +
    snapshot.flow.reasoningTokens;
  assert.ok(Math.abs(flowTotal - snapshot.totalTokens) <= 4);
  assert.ok(snapshot.leverage !== null);
  assert.ok(Math.abs(snapshot.leverage - snapshot.totalTokens / snapshot.flow.inputTokens) < 1e-9);
});

test("weekly sequence anchors natural Mondays and ends at the current week", () => {
  const today = "2026-08-09"; // 周日,当周周一 2026-08-03
  const days = [
    { day: "2026-08-04", tokens: 10 },
    { day: "2026-08-06", tokens: 5 },
    { day: "2026-07-28", tokens: 7 }, // 上一自然周(周一 07-27)
    { day: "2026-05-10", tokens: 99 }, // 超出 12 周窗口(周一 05-04 < W-12),不计入
  ];
  const weeks = buildShareWeeks(days, today);
  assert.equal(weeks.length, 12);
  assert.equal(weeks.at(-1)?.key, "2026-08-03");
  assert.equal(weeks.at(-1)?.tokens, 15);
  assert.equal(weeks.at(-2)?.key, "2026-07-27");
  assert.equal(weeks.at(-2)?.tokens, 7);
  assert.equal(weeks[0].key, "2026-05-18");
  assert.equal(weeks[0].tokens, 0);
  assert.equal(weeks.reduce((sum, week) => sum + week.tokens, 0), 22);
});

test("weekly streak counts consecutive active natural weeks", () => {
  const today = "2026-08-09";
  const days = [
    { day: "2026-08-05", tokens: 3 },
    { day: "2026-07-29", tokens: 2 },
    { day: "2026-07-22", tokens: 1 },
    { day: "2026-06-01", tokens: 9 }, // 孤立的更早一周
  ];
  const streak = weeklyStreak(days, today);
  assert.equal(streak.current, 3);
  assert.equal(streak.longest, 3);
  assert.equal(weeklyStreak([], today).current, 0);
  assert.equal(weeklyStreak([{ day: "2026-06-01", tokens: 9 }], today).current, 0);
  assert.equal(weeklyStreak([{ day: "2026-06-01", tokens: 9 }], today).longest, 1);
});

test("top tools drop the __other__ bucket, sort by tokens and cap at five", () => {
  const rows = [
    { key: "codex", tokens: 50, share: 0.05 },
    { key: "__other__", tokens: 900, share: 0.9 },
    { key: "kimi-code", tokens: 400, share: 0.4 },
    { key: "claude-code", tokens: 200, share: 0.2 },
    { key: "gemini-cli", tokens: 100, share: 0.1 },
    { key: "opencode", tokens: 80, share: 0.08 },
    { key: "cursor", tokens: 20, share: 0.02 },
    { key: "cline", tokens: 0, share: 0 },
  ];
  const tools = shareTopTools(rows);
  assert.deepEqual(
    tools.map((tool) => tool.id),
    ["kimi-code", "claude-code", "gemini-cli", "opencode", "codex"],
  );
  assert.equal(tools[0].label, "Kimi Code");
  assert.equal(tools.length, 5);
  const snapshot = mockUsageShareSnapshot("30d");
  assert.ok(snapshot.topTools.length > 0 && snapshot.topTools.length <= 5);
  assert.notEqual(snapshot.topTools[0].id, "__other__");
});

test("stacked cells split each day into input / cache / output / reasoning", () => {
  const today = "2026-08-09";
  const cells = buildShareStackedCells(
    [
      {
        day: "2026-08-09",
        tokens: 100,
        inputTokens: 20,
        cacheReadTokens: 70,
        outputTokens: 6,
        reasoningOutputTokens: 4,
      },
    ],
    today,
  );
  assert.equal(cells.length, 30);
  const last = cells.at(-1);
  assert.equal(last?.key, today);
  assert.equal(last?.inputTokens, 20);
  assert.equal(last?.cacheTokens, 70);
  assert.equal(last?.outputTokens, 6);
  assert.equal(last?.reasoningTokens, 4);
  assert.equal(cells[0].tokens, 0);
  assert.equal(cells[0].cacheTokens, 0);
  assert.equal(cells[0].reasoningTokens, 0);
  /* 堆叠四段之和 = 当日总量(mock 快照逐格自洽) */
  const month = mockUsageShareSnapshot("30d");
  for (const cell of month.main.cells) {
    if (cell.tokens <= 0) continue;
    const parts =
      (cell.inputTokens ?? 0) + (cell.cacheTokens ?? 0) + (cell.outputTokens ?? 0) + (cell.reasoningTokens ?? 0);
    assert.ok(Math.abs(parts - cell.tokens) <= 4, `${cell.key}: ${parts} vs ${cell.tokens}`);
  }
});

test("poster copy follows the export locale: zh may mix, en stays pure English", () => {
  const cjk = /[一-鿿]/;
  for (const range of USAGE_SHARE_RANGES) {
    const zhSnap = mockUsageShareSnapshot(range, true);
    const enSnap = mockUsageShareSnapshot(range, false);
    assert.equal(zhSnap.zh, true, range);
    assert.equal(enSnap.zh, false, range);
    assert.match(zhSnap.main.headline, cjk, `${range} zh headline`);
    assert.match(zhSnap.main.eyebrow, cjk, `${range} zh eyebrow`);
    assert.doesNotMatch(enSnap.main.headline, cjk, `${range} en headline`);
    assert.doesNotMatch(enSnap.main.eyebrow, cjk, `${range} en eyebrow`);
    assert.doesNotMatch(enSnap.main.subline, cjk, `${range} en subline`);
    assert.doesNotMatch(enSnap.peakLabel, cjk, `${range} en peakLabel`);
  }
});

test("share snapshots carry reliable top-model facts", () => {
  const snapshot = mockUsageShareSnapshot("30d");
  assert.ok(snapshot.topModelTokens > 0);
  assert.ok(snapshot.topModelShare > 0 && snapshot.topModelShare <= 1);
});

test("share snapshots expose the poster target url", () => {
  const snapshot = mockUsageShareSnapshot("30d");
  assert.match(snapshot.siteUrl, /^https:\/\/kimi\.builders\//);
  /* mock 以公开成员身份出图:指向个人主页用量 tab */
  assert.match(snapshot.siteUrl, /\/u\/[\w-]+\?tab=usage$/);
});

test("7d weekheat carries a 7×24 grid and hours cells carry stack parts", () => {
  const week = mockUsageShareSnapshot("7d");
  assert.equal(week.main.kind, "weekheat");
  assert.equal(week.main.heat?.length, 7);
  assert.equal(week.main.heat?.[0]?.length, 24);
  const today = mockUsageShareSnapshot("today");
  const cell = today.main.cells.find((item) => item.tokens > 0);
  assert.ok(cell);
  const parts =
    (cell.inputTokens ?? 0) + (cell.cacheTokens ?? 0) + (cell.outputTokens ?? 0) + (cell.reasoningTokens ?? 0);
  assert.ok(Math.abs(parts - cell.tokens) <= 4);
});

test("mock snapshots carry the new share facts for every range", () => {
  for (const range of USAGE_SHARE_RANGES) {
    const snapshot = mockUsageShareSnapshot(range);
    assert.equal(snapshot.weeks.length, 12, range);
    assert.ok(snapshot.streakWeeks.current > 0, range);
    assert.ok(snapshot.sessions > 0, range);
    assert.match(snapshot.span.from, /^\d{4}-\d{2}$/, range);
    assert.match(snapshot.span.to, /^\d{4}-\d{2}$/, range);
    assert.equal(snapshot.topTools.length, 5, range);
    assert.ok(snapshot.flow.cacheReadTokens > snapshot.flow.outputTokens, range);
  }
  const all = mockUsageShareSnapshot("all");
  assert.equal(all.totalTokens, all.lifetimeTokens);
});
