import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYearGrid,
  FOOTPRINT_DAYS,
  FOOTPRINT_WEEKS,
  localTodayYmd,
} from "../src/lib/usage/year-grid";

/* 2026-08-09 是周日:网格末日 = 今天,首列周一 = 窗口首日,371 格全在窗口内 */
test("buildYearGrid: 53x7 grid anchored so the last column ends on today's week", () => {
  const grid = buildYearGrid({}, "2026-08-09");
  assert.equal(grid.weeks.length, FOOTPRINT_WEEKS);
  for (const week of grid.weeks) assert.equal(week.length, 7);
  assert.equal(FOOTPRINT_DAYS, 371);
  /* 首格 = 窗口首日(今天往前 370 天)且是周一;末格 = 今天(周日) */
  assert.equal(grid.weeks[0][0].date, "2025-08-04");
  assert.equal(grid.weeks[52][6].date, "2026-08-09");
  assert.equal(grid.weeks.flat().filter((c) => c.inWindow).length, 371);
});

test("buildYearGrid places tokens on their dates and ignores out-of-window keys", () => {
  const grid = buildYearGrid(
    {
      "2026-08-09": 100, // 今天
      "2025-08-04": 50, // 窗口首日
      "2026-01-15": 7,
      "2020-01-01": 999, // 窗口外的键忽略
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
  /* 首列 2025-08-04(周一,8 月)→ 标签从 9 月起,到末列 2026-08-03(周一)止 */
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
  assert.equal(grid.monthLabels.length, 12); // 最近 12 个月
});

/* 2026-08-11 是周二:末列 = 本周(周一 08-10 … 周日 08-16),今天之后的 5 格
   是未来(inWindow=false);窗口最早的 5 天(08-06…08-10 去年)落在网格左侧之外 */
test("buildYearGrid marks future days out of window when today is mid-week", () => {
  const grid = buildYearGrid({ "2025-08-06": 999, "2026-08-11": 42 }, "2026-08-11");
  assert.equal(grid.weeks[0][0].date, "2025-08-11");
  assert.equal(grid.weeks[52][6].date, "2026-08-16");
  /* 今天在末列(行 1 = 周二),行 2..6 是未来 */
  assert.deepEqual(
    grid.weeks[52].map((c) => c.inWindow),
    [true, true, false, false, false, false, false],
  );
  assert.equal(grid.weeks[52][1].tokens, 42);
  /* 窗口内但网格装不下的最旧几天不显示(371 格恒定的代价,与 GitHub 同) */
  assert.equal(
    grid.weeks.flat().reduce((s, c) => s + c.tokens, 0),
    42,
  );
  assert.equal(grid.weeks.flat().filter((c) => c.inWindow).length, 366);
});

test("localTodayYmd converts now into the user's local calendar day", () => {
  const now = new Date(Date.UTC(2026, 7, 8, 20, 0)); // 2026-08-08 20:00 UTC
  assert.equal(localTodayYmd(480, now), "2026-08-09"); // 北京 +8 → 次日 04:00
  assert.equal(localTodayYmd(0, now), "2026-08-08");
  assert.equal(localTodayYmd(-300, now), "2026-08-08"); // 美东夏令 → 15:00 当天
  /* 夹取与非法值同 social.ts 约定 */
  assert.equal(localTodayYmd(100000, now), "2026-08-09"); // 夹到 +840 → 次日 10:00
  assert.equal(localTodayYmd(Number.NaN, now), "2026-08-08");
});
