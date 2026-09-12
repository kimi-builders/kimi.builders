import assert from "node:assert/strict";
import test from "node:test";
import {
  availableExploreFilters,
  joinLensWords,
} from "../src/lib/explore-filters";
import { t } from "../src/lib/i18n";

/* ---- The one lens availability judgment ---- */

test("availableExploreFilters: empty dimensions stay closed everywhere", () => {
  assert.deepEqual(
    availableExploreFilters({ product: 0, role: 0, tag: 0, year: 0 }),
    [],
  );
});

test("availableExploreFilters: only content-bearing lenses pass, vocabulary order", () => {
  assert.deepEqual(
    availableExploreFilters({ product: 3, role: 0, tag: 2, year: 1 }),
    ["product", "tag", "year"],
  );
  assert.deepEqual(
    availableExploreFilters({ product: 0, role: 5, tag: 0, year: 4 }),
    ["role", "year"],
  );
  assert.deepEqual(
    availableExploreFilters({ product: 1, role: 1, tag: 1, year: 1 }),
    ["product", "role", "tag", "year"],
  );
});

/* ---- Lede lens list (the promise matches the rendered toolbar) ---- */

test("joinLensWords: empty falls back, one stands alone, pairs and lists join per locale", () => {
  assert.equal(joinLensWords([], true), "");
  assert.equal(joinLensWords([], false), "");
  assert.equal(joinLensWords(["章"], true), "章");
  assert.equal(joinLensWords(["chapter"], false), "chapter");
  assert.equal(joinLensWords(["章", "产品"], true), "章和产品");
  assert.equal(joinLensWords(["chapter", "product"], false), "chapter and product");
  assert.equal(joinLensWords(["章", "产品", "标签", "归档"], true), "章、产品、标签和归档");
  assert.equal(
    joinLensWords(["chapter", "product", "tag", "archive"], false),
    "chapter, product, tag, and archive",
  );
});

test("lede lens words resolve as DICT keys and never promise a hidden lens", () => {
  /* Every lens the availability function can return must have a lede
     word — a missing key would crash the page instead of drifting
     quietly. */
  for (const key of ["product", "role", "tag", "year"] as const) {
    for (const locale of ["zh", "en"] as const) {
      const word = t(locale, `explore.lensWord.${key}`);
      assert.ok(word.length > 0, `explore.lensWord.${key}.${locale}`);
    }
  }
  /* The assembled lede contains exactly the words passed in. */
  assert.equal(
    t("zh", "explore.ledeLenses", { lenses: joinLensWords(["产品", "标签"], true) }),
    "月刊评鉴与 Builder 亲自跑通的实践，按产品和标签浏览。",
  );
  assert.equal(
    t("en", "explore.ledeLenses", {
      lenses: joinLensWords(["product", "tag"], false),
    }),
    "The Monthly and practices run by Builders, browsable by product and tag.",
  );
});
