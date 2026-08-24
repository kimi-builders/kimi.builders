import assert from "node:assert/strict";
import test from "node:test";
import {
  SITEMAP_DYNAMIC_CAP,
  SITEMAP_STATIC_PATHS,
  sitemapArticlesQuery,
  sitemapPostsQuery,
  sitemapSeriesSlugs,
  sitemapUrls,
  sitemapWorksQuery,
} from "../src/lib/sitemap-data";

test("sitemapUrls: 静态路由在前,动态条目按类拼接", () => {
  const urls = sitemapUrls({
    postIds: [3, 2],
    workIds: [7],
    articleSlugs: ["letter-2026-08"],
    seriesSlugs: ["some-series"],
  });
  assert.equal(urls[0], "https://kimi.builders/");
  assert.equal(urls.length, SITEMAP_STATIC_PATHS.length + 5);
  assert.ok(urls.includes("https://kimi.builders/community/3"));
  assert.ok(urls.includes("https://kimi.builders/works/7"));
  assert.ok(urls.includes("https://kimi.builders/explore/letter-2026-08"));
  assert.ok(urls.includes("https://kimi.builders/explore/series/some-series"));
});

test("sitemapSeriesSlugs: 只在册且有集的系列进图(0 集不上架同口径)", () => {
  assert.deepEqual(sitemapSeriesSlugs([]), []);
});

test("sitemap 查询:可见性谓词与公共面同口径,条数封顶", () => {
  assert.match(sitemapPostsQuery(), /visibility = 'public' AND hidden_at IS NULL AND deleted_at IS NULL/);
  assert.match(sitemapWorksQuery(), /visibility = 'public' AND hidden_at IS NULL/);
  assert.match(sitemapArticlesQuery(), /published_at IS NOT NULL AND deleted_at IS NULL/);
  assert.match(sitemapPostsQuery(), new RegExp(`LIMIT ${SITEMAP_DYNAMIC_CAP}`));
});
