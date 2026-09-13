import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYearGrid,
  FOOTPRINT_DAYS,
  FOOTPRINT_WEEKS,
  footprintMonthText,
  localTodayYmd,
  monthLabelRightAligns,
} from "../src/lib/usage/year-grid";

/* 2026-08-09 is a Sunday: grid end = today, the first column's Monday
   = the window's first day, all 371 cells in-window. */
test("buildYearGrid: 53x7 grid anchored so the last column ends on today's week", () => {
  const grid = buildYearGrid({}, "2026-08-09");
  assert.equal(grid.weeks.length, FOOTPRINT_WEEKS);
  for (const week of grid.weeks) assert.equal(week.length, 7);
  assert.equal(FOOTPRINT_DAYS, 371);
  /* First cell = the window's first day (today minus 370) and a
     Monday; last cell = today (Sunday). */
  assert.equal(grid.weeks[0][0].date, "2025-08-04");
  assert.equal(grid.weeks[52][6].date, "2026-08-09");
  assert.equal(grid.weeks.flat().filter((c) => c.inWindow).length, 371);
});

test("buildYearGrid places tokens on their dates and ignores out-of-window keys", () => {
  const grid = buildYearGrid(
    {
      "2026-08-09": 100, // today
      "2025-08-04": 50, // window start
      "2026-01-15": 7,
      // Out-of-window keys are ignored.
    },
    "2026-08-09",
  );
  const byDate = new Map(grid.weeks.flat().map((c) => [c.date, c]));
  assert.equal(byDate.get("2026-08-09")!.tokens, 100);
  assert.equal(byDate.get("2025-08-04")!.tokens, 50);
  assert.equal(byDate.get("2026-01-15")!.tokens, 7);
  assert.equal(byDate.has("2020-01-01"), false);
  assert.equal(
    grid.weeks.flat().reduce((s, c) => s + c.tokens, 0),
    157,
  );
});

test("buildYearGrid labels a month at the first column whose Monday enters it", () => {
  const grid = buildYearGrid({}, "2026-08-09");
  /* First column 2025-08-04 (Monday, August) -> labels start in
     September and end at the last column 2026-08-03 (Monday). */
  assert.deepEqual(grid.monthLabels, [
    { weekIndex: 4, month: 9 },
    { weekIndex: 9, month: 10 },
    { weekIndex: 13, month: 11 },
    { weekIndex: 17, month: 12 },
    { weekIndex: 22, month: 1 },
    { weekIndex: 26, month: 2 },
    { weekIndex: 30, month: 3 },
    { weekIndex: 35, month: 4 },
    { weekIndex: 39, month: 5 },
    { weekIndex: 43, month: 6 },
    { weekIndex: 48, month: 7 },
    { weekIndex: 52, month: 8 },
  ]);
  assert.equal(grid.monthLabels.length, 12); // the last 12 months
});

/* 2026-08-11 is a Tuesday: the last column = this week (Mon 08-10 ...
   Sun 08-16); the 5 cells after today are future (inWindow=false); the
   window's 5 oldest days (08-06...08-10 of last year) fall outside the
   grid on the left. */
test("buildYearGrid marks future days out of window when today is mid-week", () => {
  const grid = buildYearGrid({ "2025-08-06": 999, "2026-08-11": 42 }, "2026-08-11");
  assert.equal(grid.weeks[0][0].date, "2025-08-11");
  assert.equal(grid.weeks[52][6].date, "2026-08-16");
  /* Today sits in the last column (row 1 = Tuesday); rows 2..6 are the
     future. */
  assert.deepEqual(
    grid.weeks[52].map((c) => c.inWindow),
    [true, true, false, false, false, false, false],
  );
  assert.equal(grid.weeks[52][1].tokens, 42);
  /* The oldest in-window days the grid can't fit simply don't show (the
     price of a constant 371 cells, same as GitHub). */
  assert.equal(
    grid.weeks.flat().reduce((s, c) => s + c.tokens, 0),
    42,
  );
  assert.equal(grid.weeks.flat().filter((c) => c.inWindow).length, 366);
});

test("localTodayYmd converts now into the user's local calendar day", () => {
  const now = new Date(Date.UTC(2026, 7, 8, 20, 0)); // 2026-08-08 20:00 UTC
  assert.equal(localTodayYmd(480, now), "2026-08-09"); // Beijing +8 -> next day 04:00
  assert.equal(localTodayYmd(0, now), "2026-08-08");
  assert.equal(localTodayYmd(-300, now), "2026-08-08"); // US Eastern DST -> 15:00 same day
  /* Clamping and invalid values follow social.ts's convention. */
  assert.equal(localTodayYmd(100000, now), "2026-08-09"); // clamped to +840 -> next day 10:00
  assert.equal(localTodayYmd(Number.NaN, now), "2026-08-08");
});

/* ---- Month label copy + edge placement: labels in the final two
   columns right-align (translateX(-100%)) so the text can neither wrap
   onto two lines nor overflow the grid; every other label anchors
   left. Applies to the 53-week desktop grid and each mobile half-year
   page alike. ---- */

test("footprintMonthText renders compact labels within the 4-glyph budget", () => {
  // zh: digit + glyph; en: three-letter short form.
  assert.equal(footprintMonthText(9, true), "9\u6708");
  assert.equal(footprintMonthText(12, true), "12\u6708");
  assert.equal(footprintMonthText(9, false), "Sep");
  assert.equal(footprintMonthText(12, false), "Dec");
  assert.equal(footprintMonthText(1, false), "Jan");
  for (let month = 1; month <= 12; month++) {
    assert.ok(footprintMonthText(month, true).length <= 4, `zh label ${month}`);
    assert.ok(footprintMonthText(month, false).length <= 3, `en label ${month}`);
  }
});

test("monthLabelRightAligns dodges the final two columns only", () => {
  const total = 53;
  assert.equal(monthLabelRightAligns(0, total), false);
  assert.equal(monthLabelRightAligns(50, total), false);
  // The last two columns: a left-anchored label has no room and would
  // wrap or overflow.
  assert.equal(monthLabelRightAligns(51, total), true);
  assert.equal(monthLabelRightAligns(52, total), true);
  // Mobile half-year pages see their own week count (27 / 26).
  assert.equal(monthLabelRightAligns(24, 27), false);
  assert.equal(monthLabelRightAligns(25, 27), true);
  assert.equal(monthLabelRightAligns(26, 27), true);
  assert.equal(monthLabelRightAligns(23, 26), false);
  assert.equal(monthLabelRightAligns(24, 26), true);
  assert.equal(monthLabelRightAligns(25, 26), true);
  // Degenerate inputs stay left-anchored.
  assert.equal(monthLabelRightAligns(0, 0), false);
});

test("the audit's edge case: a label entering at the last column right-aligns", () => {
  // 2026-08-09 ends the grid; August's Monday enters at column 52 —
  // the exact label that wrapped/overflowed before the fix. zh and en
  // render it within budget either way.
  const grid = buildYearGrid({}, "2026-08-09");
  const last = grid.monthLabels.at(-1);
  assert.deepEqual(last, { weekIndex: 52, month: 8 });
  assert.equal(monthLabelRightAligns(last.weekIndex, 53), true);
  assert.ok(footprintMonthText(last.month, true).length <= 4);
  assert.equal(footprintMonthText(last.month, false), "Aug");
  // The label before it sits far enough from the edge to anchor left.
  const prev = grid.monthLabels.at(-2);
  assert.deepEqual(prev, { weekIndex: 48, month: 7 });
  assert.equal(monthLabelRightAligns(prev.weekIndex, 53), false);
});

test("a cross-year window keeps every label inside the grid edge rule", () => {
  // 2026-12-27 ends the grid; the window spans the previous December,
  // so labels cross the year boundary (Jan of the new year appears).
  const grid = buildYearGrid({}, "2026-12-27");
  const months = grid.monthLabels.map((m) => m.month);
  assert.ok(months.includes(1) && months.includes(12), months.join(","));
  for (const label of grid.monthLabels) {
    // Whatever the month, the placement rule depends only on the
    // column: edge columns right-align, the rest anchor left.
    assert.equal(
      monthLabelRightAligns(label.weekIndex, 53),
      label.weekIndex >= 51,
      `week ${label.weekIndex}`,
    );
  }
});
