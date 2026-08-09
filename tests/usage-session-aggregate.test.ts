import assert from "node:assert/strict";
import test from "node:test";
import { parseUsageFilters } from "../src/lib/usage/filters";
import {
  aggregateUsageSessionRows,
  createEmptyUsageHeatmap,
} from "../src/lib/usage/session-aggregate";
import type { UsageTrendDay } from "../src/lib/usage/query-types";

test("session aggregation clips v3 facts and places them in the local heatmap", () => {
  const filters = parseUsageFilters(
    { from: "2026-08-01", to: "2026-08-01" },
    { uploadProject: false, tzOffsetMinutes: 480, now: new Date("2026-08-08T00:00:00Z") },
  );
  const target = {
    sessions: 0,
    messages: 0,
    userMessages: 0,
    activeSeconds: 0,
    durationSeconds: 0,
  };
  const heatmap = createEmptyUsageHeatmap();
  const days = new Map<string, UsageTrendDay>();
  const ensureDay = (day: string) => {
    const existing = days.get(day);
    if (existing) return existing;
    const value: UsageTrendDay = {
      day,
      inputTokens: 0,
      cacheWriteInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      requests: 0,
      sessions: 0,
      activeSeconds: 0,
      costMicros: 0,
    };
    days.set(day, value);
    return value;
  };

  const devices = aggregateUsageSessionRows(
    [{
      device_id: 7,
      first_message_at: "2026-07-20T00:00:00Z",
      last_message_at: "2026-08-02T01:00:00Z",
      active_seconds: 999,
      duration_seconds: 999,
      message_count: 999,
      user_message_count: 999,
      user_prompt_hours: {
        version: 3,
        hours: [
          {
            hourStart: "2026-08-01T01:00:00Z",
            activeSeconds: 120,
            engagedSeconds: 180,
            messageCount: 4,
            userMessageCount: 2,
          },
          {
            hourStart: "2026-08-02T01:00:00Z",
            activeSeconds: 600,
            engagedSeconds: 600,
            messageCount: 10,
            userMessageCount: 5,
          },
        ],
      },
    }] as never,
    filters,
    target,
    { ensureDay, heatmap },
  );

  assert.deepEqual([...devices], ["7"]);
  assert.deepEqual(target, {
    sessions: 1,
    messages: 4,
    userMessages: 2,
    activeSeconds: 120,
    durationSeconds: 180,
  });
  assert.equal(days.get("2026-08-01 09:00")?.sessions, 1);
  assert.equal(days.get("2026-08-01 09:00")?.activeSeconds, 120);
  // 2026-08-01 01:00 UTC = 周六 09:00 GMT+8。
  assert.equal(heatmap.activeSeconds[5][9], 120);
  assert.equal(heatmap.prompts[5][9], 2);
  assert.equal(heatmap.activeSeconds.flat().reduce((sum, value) => sum + value, 0), 120);
});
