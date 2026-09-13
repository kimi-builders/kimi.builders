import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/lib/i18n";

/* Works claim-semantics copy: the page-header lede is a one-line
   positioning sentence; the full boundary (self-reported, capped by
   synced aggregate usage, not exact per-project usage) lives ONCE per
   viewport — in the right rail at xl+, and in the sub-xl note line
   (the rail is hidden below xl). The two never repeat verbatim on the
   same screen, and the Awesome entry copy is untouched. */

const worksPage = readFileSync(
  new URL("../app/(app)/works/page.tsx", import.meta.url),
  "utf8",
);

test("works lede is a short positioning line, not the full disclaimer", () => {
  assert.equal(t("zh", "works.wallIntro"), "Builder 用 Kimi 做出的作品；声明投入由 Builder 自报。");
  assert.equal(
    t("en", "works.wallIntro"),
    "Work made by Builders with Kimi; declared tokens are self-reported.",
  );
  // The lede no longer carries the cap/exactness boundary (that is
  // the rail's claimNote job).
  assert.doesNotMatch(t("zh", "works.wallIntro"), /封顶/);
  assert.doesNotMatch(t("zh", "works.wallIntro"), /精确用量/);
  assert.doesNotMatch(t("en", "works.wallIntro"), /capped|exact/);
});

test("the rail keeps the full claim boundary (adjacent to the stats)", () => {
  const zh = t("zh", "works.claimNote");
  assert.match(zh, /封顶/);
  assert.match(zh, /精确用量/);
  const en = t("en", "works.claimNote");
  assert.match(en, /capped/);
  assert.match(en, /not exact/);
});

test("the sub-xl note carries the boundary where the rail is hidden", () => {
  // The works page renders the note, visible only below xl (the rail
  // breakpoint) — one boundary instance per viewport, never two.
  assert.match(worksPage, /works\.claimMobileNote/);
  assert.match(worksPage, /xl:hidden/);
  const zh = t("zh", "works.claimMobileNote");
  assert.match(zh, /封顶/);
  assert.match(zh, /不是单件作品的精确用量/);
  const en = t("en", "works.claimMobileNote");
  assert.match(en, /capped by synced aggregate usage/);
  assert.match(en, /not exact per-project usage/);
});

test("Awesome's own inclusion copy is untouched by the works dedupe", () => {
  // The rail claimNote funnels to Awesome, but Awesome's entry copy
  // has its own keys — they keep their meaning.
  assert.match(t("zh", "awesome.recommend"), /推荐项目/);
  assert.equal(t("en", "awesome.recommend"), "Recommend");
  assert.match(t("zh", "works.goAwesome"), /Awesome/);
});
