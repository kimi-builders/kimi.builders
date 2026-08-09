import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUsageLocalDateTime,
  usageDashboardViewState,
} from "../src/lib/usage/presentation";

test("usage presentation distinguishes first sync, empty range, and ready data", () => {
  assert.equal(
    usageDashboardViewState({ lastSyncAt: null, totalTokens: 0, requests: 0, sessions: 0 }),
    "first-run",
  );
  assert.equal(
    usageDashboardViewState({
      lastSyncAt: "2026-08-09T08:00:00.000Z",
      totalTokens: 0,
      requests: 0,
      sessions: 0,
    }),
    "empty-range",
  );
  assert.equal(
    usageDashboardViewState({
      lastSyncAt: "2026-08-09T08:00:00.000Z",
      totalTokens: 0,
      requests: 0,
      sessions: 1,
    }),
    "ready",
  );
  assert.equal(
    usageDashboardViewState({
      lastSyncAt: "2026-08-09T08:00:00.000Z",
      totalTokens: 42,
      requests: 1,
      sessions: 0,
    }),
    "ready",
  );
});

test("usage local date formatting uses the dashboard offset, not the host timezone", () => {
  const instant = "2026-08-09T08:30:00.000Z";
  assert.match(formatUsageLocalDateTime(instant, "en-US", -420), /08\/09\/2026.*01:30/);
  assert.match(formatUsageLocalDateTime(instant, "en-US", 480), /08\/09\/2026.*16:30/);
});
