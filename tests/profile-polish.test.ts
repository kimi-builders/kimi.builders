import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/lib/i18n";

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
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const workDetail = readFileSync(
  new URL("../app/(app)/works/[id]/page.tsx", import.meta.url),
  "utf8",
);
const workVote = readFileSync(
  new URL("../app/(app)/works/_components/WorkVoteButton.tsx", import.meta.url),
  "utf8",
);

test("mobile profile bio and actions escape the avatar-side narrow column", () => {
  assert.match(profile, /grid-cols-\[72px_minmax\(0,1fr\)\]/);
  assert.match(profile, /col-span-2 mt-4 whitespace-pre-wrap/);
  assert.match(profile, /col-span-2 mt-4 grid items-stretch gap-2/);
  assert.match(profile, /self \? "grid-cols-3" : "grid-cols-2"/);
  assert.doesNotMatch(profile, /overflow-x-auto sm:flex-wrap/);
  assert.match(share, /min-h-9 w-full min-w-0/);
});

test("mobile home stats keep the three community counts together above usage", () => {
  assert.match(home, /grid-cols-3 gap-y-8.*sm:grid-cols-4/);
  assert.match(home, /col-span-3 border-t border-line pt-8 sm:col-span-1/);
});

test("work detail try and support actions share equal tracks and height", () => {
  assert.match(workDetail, /work\.url \? "grid-cols-2 sm:w-\[28rem\]"/);
  assert.match(workDetail, /inline-flex h-11 w-full items-center justify-center/);
  assert.match(workVote, /inline-flex h-11 w-full items-center justify-center/);
});

test("profile post empty state renders one merged line instead of duplicate copy", () => {
  assert.doesNotMatch(profile, /prof\.emptyPostsText/);
  assert.match(profile, /title=\{self \? t\(locale, "prof\.emptyPostsTitle"\)/);
});

test("leaderboard selected segments use a light token-derived state", () => {
  assert.match(leaderboard, /bg-blue\/10 text-blue ring-1 ring-inset ring-blue\/20/);
  assert.doesNotMatch(leaderboard, /SEG_ITEM_ACTIVE/);
});

/* ---- Streak stat semantics (20260912 review): one time scale per
   card — main value = the current daily streak, sub = the longest
   daily streak. Mixing in the weekly streak produced "0 days current
   / 21 weeks", which reads as a negative signal when it only means
   "nothing used today yet". ---- */

test("profile streak card pairs current daily streak with the longest daily streak", () => {
  assert.match(profile, /prof\.statStreak"\)/);
  assert.match(profile, /\{fsum\.streak\.current\}/);
  /* The sub line reads the longest DAILY streak from the same summary
     object — never the weekly streak, and no current||longest
     fallback that would pass history off as the present. */
  assert.match(profile, /prof\.statStreakSub", \{ n: fsum\.streak\.longest \}\)/);
  assert.doesNotMatch(profile, /streakWeeks\.current \|\| streakWeeks\.longest/);
  /* Copy stays on that time scale, zh/en paired. */
  assert.match(t("zh", "prof.statStreak"), /当前连续/);
  assert.equal(t("en", "prof.statStreak"), "CURRENT STREAK");
  assert.equal(t("zh", "prof.statStreakSub", { n: 21 }), "最长连续 21 天");
  assert.equal(t("en", "prof.statStreakSub", { n: 21 }), "longest: 21 days");
});
