import assert from "node:assert/strict";
import test from "node:test";
import { searchSiteItems, type SiteSearchItem } from "../src/lib/site-search";

const items: SiteSearchItem[] = [
  { href: "/community", label: "Community", description: "Discussions", keywords: ["帖子"] },
  { href: "/works", label: "Works", description: "Member projects", keywords: ["作品"] },
  { href: "/usage", label: "Usage", description: "Token dashboard", keywords: ["用量"] },
];

test("site search matches labels, descriptions, and bilingual keywords", () => {
  assert.deepEqual(searchSiteItems(items, "work").map((item) => item.href), ["/works"]);
  assert.deepEqual(searchSiteItems(items, "dashboard").map((item) => item.href), ["/usage"]);
  assert.deepEqual(searchSiteItems(items, "帖子").map((item) => item.href), ["/community"]);
});

test("site search ranks exact labels first and keeps empty-query order", () => {
  const ranked = searchSiteItems(
    [...items, { href: "/usage-help", label: "Usage help", description: "Guide" }],
    "usage",
  );
  assert.equal(ranked[0]?.href, "/usage");
  assert.deepEqual(searchSiteItems(items, "", 2).map((item) => item.href), ["/community", "/works"]);
});

test("site search clamps the result limit and ignores whitespace", () => {
  assert.equal(searchSiteItems(items, "   ", -1).length, 0);
  assert.equal(searchSiteItems(items, "", 999).length, items.length);
});
