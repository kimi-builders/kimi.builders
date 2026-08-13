import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  profileUsageQueryPlan,
  type ProfileUsageTab,
} from "../src/lib/usage/social";

const visibleMatrix: Array<
  [ProfileUsageTab, { heatmap: boolean; topDimensions: boolean }]
> = [
  ["posts", { heatmap: false, topDimensions: false }],
  ["comments", { heatmap: false, topDimensions: false }],
  ["works", { heatmap: false, topDimensions: false }],
  ["usage", { heatmap: true, topDimensions: false }],
  ["tools", { heatmap: false, topDimensions: false }],
  ["prefs", { heatmap: true, topDimensions: true }],
];

test("profile usage query plan follows the rendered dependency matrix", () => {
  for (const [tab, expected] of visibleMatrix) {
    assert.deepEqual(profileUsageQueryPlan(tab, true), expected, tab);
  }
});

test("private usage never schedules optional profile usage queries", () => {
  for (const [tab] of visibleMatrix) {
    assert.deepEqual(
      profileUsageQueryPlan(tab, false),
      { heatmap: false, topDimensions: false },
      tab,
    );
  }
});

test("profile page applies the plan while retaining shared daily and snapshot queries", () => {
  const page = readFileSync(
    new URL("../app/(app)/u/[handle]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /usageQueryPlan\.heatmap\s+\? getSocialUsageHeatmap/);
  assert.match(page, /usageQueryPlan\.topDimensions\s+\? getSocialTopDimensions/);
  assert.match(page, /usageVisible \? getSocialDailyActivity/);
  assert.match(page, /usageVisible && ownerSettings\s+\? getUsageShareSnapshot/);
});
