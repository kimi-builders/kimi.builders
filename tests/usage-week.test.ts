import assert from "node:assert/strict";
import test from "node:test";
import {
  isoWeekNumberTz,
  parseWeekKey,
  weekKeyFor,
  weekLabel,
  weekWindowFor,
} from "../src/lib/usage/week";

const TZ_GMT_PLUS_8 = 480;
const TZ_GMT_MINUS_7 = -420;

test("weekWindowFor snaps to Monday 00:00 in the user's reported timezone", () => {
  // 2026-08-12 18:40 GMT-7 → 所在周周一 8/10 00:00(GMT-7)= 8/10 07:00 UTC。
  const instant = Date.UTC(2026, 7, 13, 1, 40);
  const window = weekWindowFor(instant, TZ_GMT_MINUS_7);
  assert.equal(new Date(window.fromUtcMs).toISOString(), "2026-08-10T07:00:00.000Z");
  assert.equal(new Date(window.toUtcMs).toISOString(), "2026-08-17T07:00:00.000Z");
  // 同一 UTC 时刻在 GMT+8 已是周四上午,周一仍是 8/10(本地 8/10 00:00 = 8/9 16:00 UTC)。
  const plus8 = weekWindowFor(instant, TZ_GMT_PLUS_8);
  assert.equal(new Date(plus8.fromUtcMs).toISOString(), "2026-08-09T16:00:00.000Z");
});

test("isoWeekNumberTz honors ISO boundaries independent of timezone", () => {
  // 2026 年 ISO 第 1 周从 2025-12-29(周一)开始。
  const week1 = weekWindowFor(Date.UTC(2025, 11, 30, 12), 0);
  assert.equal(isoWeekNumberTz(week1.fromUtcMs, 0), 1);
  const week33 = weekWindowFor(Date.UTC(2026, 7, 12, 12), 0);
  assert.equal(isoWeekNumberTz(week33.fromUtcMs, 0), 33);
});

test("weekLabel renders ranges within and across months", () => {
  const week33 = weekWindowFor(Date.UTC(2026, 7, 12, 12), 0);
  assert.equal(weekLabel(week33.fromUtcMs, 0, true), "第 33 周 · 8月10日–16日");
  assert.equal(weekLabel(week33.fromUtcMs, 0, false), "Week 33 · Aug 10–16");
  const week31 = weekWindowFor(Date.UTC(2026, 6, 29, 12), 0);
  assert.equal(weekLabel(week31.fromUtcMs, 0, true), "第 31 周 · 7月27日–8月2日");
});

test("weekKeyFor and parseWeekKey round-trip and snap any day to its Monday", () => {
  const week33 = weekWindowFor(Date.UTC(2026, 7, 12, 12), TZ_GMT_PLUS_8);
  const key = weekKeyFor(week33.fromUtcMs, TZ_GMT_PLUS_8);
  assert.equal(key, "2026-08-10");
  const parsed = parseWeekKey(key, TZ_GMT_PLUS_8);
  assert.equal(parsed?.fromUtcMs, week33.fromUtcMs);
  // 周三的日期也吸附到同一周周一。
  assert.equal(parseWeekKey("2026-08-12", TZ_GMT_PLUS_8)?.fromUtcMs, week33.fromUtcMs);
  assert.equal(parseWeekKey("not-a-week", TZ_GMT_PLUS_8), null);
  assert.equal(parseWeekKey(undefined, TZ_GMT_PLUS_8), null);
});
