/* 月刊统计快照缓存(20260822 P2-5)源码钉:同 public-feed-cache 的约定,
   缓存模块独立、纯模块不被缓存污染,发布/撤稿路径作废 tag。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cache = readFileSync(new URL("../src/lib/monthly-stats-cache.ts", import.meta.url), "utf8");
const tags = readFileSync(new URL("../src/lib/cache-tags.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/(app)/blog/actions.ts", import.meta.url), "utf8");
const explore = readFileSync(new URL("../app/(app)/explore/[slug]/page.tsx", import.meta.url), "utf8");
const shareLetter = readFileSync(new URL("../src/lib/share-letter.ts", import.meta.url), "utf8");

test("快照走 unstable_cache:5 分钟兜底 + monthly-stats tag", () => {
  assert.match(cache, /unstable_cache\(/);
  assert.match(cache, /MONTHLY_STATS_REVALIDATE_SECONDS = 5 \* 60/);
  assert.match(cache, /PUBLIC_MONTHLY_STATS_CACHE_TAG/);
  assert.match(tags, /public:monthly-stats/);
});

test("monthly.ts 保持纯模块:不引 next/cache(单测/裸 Node 可直接导入)", () => {
  const monthly = readFileSync(new URL("../src/lib/monthly.ts", import.meta.url), "utf8");
  assert.doesNotMatch(monthly, /from "next\/cache"/);
});

test("消费方:explore 详情页与 letter 海报走缓存快照", () => {
  assert.match(explore, /getCachedMonthlyStatsSnapshot/);
  assert.match(shareLetter, /getCachedMonthlyStatsSnapshot/);
});

test("发布/撤稿/软删都作废 monthly-stats tag", () => {
  assert.equal(actions.match(/updateTag\(PUBLIC_MONTHLY_STATS_CACHE_TAG\)/g)?.length ?? 0, 2);
});

