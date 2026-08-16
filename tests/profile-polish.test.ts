import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync(
  new URL("../app/(app)/u/[handle]/page.tsx", import.meta.url),
  "utf8",
);
const share = readFileSync(
  new URL("../app/(app)/u/[handle]/_components/ProfileShareButtons.tsx", import.meta.url),
  "utf8",
);
const leaderboard = readFileSync(
  new URL("../app/(app)/usage/leaderboard/page.tsx", import.meta.url),
  "utf8",
);

test("mobile profile actions stay in one compact, horizontally safe row", () => {
  assert.match(profile, /flex-nowrap items-center.*overflow-x-auto sm:flex-wrap/);
  /* 20260815 评审:移动端操作按钮字号 10px→11px(可读性下限),触控与截断语义不变 */
  assert.match(profile, /min-h-8 shrink-0.*text-\[11px\].*whitespace-nowrap/);
  assert.match(share, /min-h-8 shrink-0.*text-\[11px\].*whitespace-nowrap/);
});

test("profile post empty state renders one merged line instead of duplicate copy", () => {
  assert.doesNotMatch(profile, /prof\.emptyPostsText/);
  assert.match(profile, /title=\{self \? t\(locale, "prof\.emptyPostsTitle"\)/);
});

test("leaderboard selected segments use a light token-derived state", () => {
  assert.match(leaderboard, /bg-blue\/10 text-blue ring-1 ring-inset ring-blue\/20/);
  assert.doesNotMatch(leaderboard, /SEG_ITEM_ACTIVE/);
});
