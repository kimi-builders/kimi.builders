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
  // 2026-08-12 18:40 GMT-7 -> the week's Monday 8/10 00:00 (GMT-7) =
  // 8/10 07:00 UTC.
  const instant = Date.UTC(2026, 7, 13, 1, 40);
  const window = weekWindowFor(instant, TZ_GMT_MINUS_7);
  assert.equal(new Date(window.fromUtcMs).toISOString(), "2026-08-10T07:00:00.000Z");
  assert.equal(new Date(window.toUtcMs).toISOString(), "2026-08-17T07:00:00.000Z");
  // The same UTC instant is Thursday morning at GMT+8, but the Monday is
  // still 8/10 (local 8/10 00:00 = 8/9 16:00 UTC).
  const plus8 = weekWindowFor(instant, TZ_GMT_PLUS_8);
  assert.equal(new Date(plus8.fromUtcMs).toISOString(), "2026-08-09T16:00:00.000Z");
});

test("isoWeekNumberTz honors ISO boundaries independent of timezone", () => {
  // ISO week 1 of 2026 starts on 2025-12-29 (a Monday).
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
  // A Wednesday date also snaps to the same week's Monday.
  assert.equal(parseWeekKey("2026-08-12", TZ_GMT_PLUS_8)?.fromUtcMs, week33.fromUtcMs);
  assert.equal(parseWeekKey("not-a-week", TZ_GMT_PLUS_8), null);
  assert.equal(parseWeekKey(undefined, TZ_GMT_PLUS_8), null);
});
