import assert from "node:assert/strict";
import test from "node:test";
import {
  mockUsageShareSnapshot,
  normalizeUsageShareRange,
  USAGE_SHARE_RANGES,
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
    ["hours", "hours", "days", "heatmap", "heatmap", "heatmap"],
  );
  assert.equal(today.main.cells.length, 24);
  assert.equal(hours.main.cells.length, 24);
  assert.equal(week.main.cells.length, 7);
  assert.equal(month.main.cells.length, 5 * 7);
  assert.equal(quarter.main.cells.length, 12 * 7);
  assert.equal(all.main.cells.length, 12 * 7);
  assert.match(month.main.headline, /^5 周/);
  assert.match(quarter.main.headline, /^12 周/);
});

test("share snapshots contain only public identity and aggregate facts", () => {
  const snapshot = mockUsageShareSnapshot("90d");
  assert.deepEqual(Object.keys(snapshot.user).sort(), ["handle", "initials", "name"]);
  assert.ok(snapshot.totalTokens > 0);
  assert.ok(snapshot.lifetimeTokens >= snapshot.totalTokens);
  assert.ok(snapshot.costMicros > 0);
  assert.ok(snapshot.toolCount > 0);
});
