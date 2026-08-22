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

/* ---- 20260822 P2-6/P2-8:发布失效补全 + proxy matcher ---- */

test("发布/删除失效覆盖:旧 slug 详情页 + 新旧系列页", () => {
  const save = actions.slice(actions.indexOf("export async function saveArticleAction"));
  assert.match(actions, /getArticleSlugAndSeriesById/);
  assert.match(save, /prev\.slug !== slug/);
  assert.match(save, /\/explore\/series\/\$\{s\}/);
  const del = actions.slice(actions.indexOf("export async function deleteArticleAction"));
  assert.match(del, /\/explore\/\$\{prev\.slug\}/);
  assert.match(del, /\/explore\/series\/\$\{prev\.series\}/);
});

test("proxy matcher 盖住 (app) 组单层页(/about、/login),右栏不再被藏", () => {
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  const m = proxy.match(/matcher:\s*\[([\s\S]*?)\]/);
  assert.ok(m);
  assert.match(m[1], /"\/about\/:path\*"/);
  assert.match(m[1], /"\/login\/:path\*"/);
});
