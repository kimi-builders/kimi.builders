import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/lib/i18n";

/* Mobile bottom tab bar invariants (20260912 review): the compose
   entry is not a standing primary — every item shares one
   active/inactive grammar and only the current route's item gets the
   blue block, so "where am I" is always the strongest signal. English
   tab tags stay single-line at 390px via short-tag DICT keys, never
   hardcoded language branches. */

const tabBar = readFileSync(
  new URL("../app/(app)/_components/MobileTabBar.tsx", import.meta.url),
  "utf8",
);

test("every tab item shares one active grammar; nothing is a standing primary", () => {
  // No per-item "primary" special case: the blue block rides the same
  // active flag for all six items.
  assert.doesNotMatch(tabBar, /primary:\s*true/);
  assert.doesNotMatch(tabBar, /tab\.primary/);
  // One icon container size for every item (equal touch rhythm).
  assert.match(tabBar, /size-10 items-center justify-center rounded-lg/);
  // Active = blue block + ui-blue label; inactive = grey.
  assert.match(tabBar, /tab\.active \? "bg-blue text-white" : ""/);
  assert.match(tabBar, /tab\.active \? "text-ui-blue" : "text-grey hover:text-paper"/);
  // aria-current still marks the current page for assistive tech.
  assert.match(tabBar, /aria-current=\{tab\.active \? "page" : undefined\}/);
});

test("the compose entry highlights only on the compose routes", () => {
  // Its active condition is route-based (new-post / new-work), not an
  // unconditional emphasis.
  assert.match(
    tabBar,
    /pathname\.startsWith\("\/community\/new"\) \|\|\s*\n\s*pathname\.startsWith\("\/works\/new"\),/,
  );
  // Navigation count, order and login gates are untouched: six tabs,
  // gated entries still route through /login?next=.
  assert.match(tabBar, /grid grid-cols-6/);
  assert.match(tabBar, /loggedIn \? path : `\/login\?next=/);
});

test("mobile short tags exist as paired DICT keys (en stays single-line at 390px)", () => {
  // The works context uses the short tag, not the long "Publish work".
  assert.match(tabBar, /key: "works\.submitShort"/);
  // zh/en pairs, sentence-case, short enough for one line.
  assert.equal(t("en", "works.submitShort"), "Publish");
  assert.equal(t("zh", "works.submitShort"), "发布作品");
  assert.equal(t("en", "nav.post"), "Post");
  assert.equal(t("zh", "nav.post"), "发帖");
  assert.equal(t("en", "awesome.recommend"), "Recommend");
  assert.equal(t("zh", "awesome.recommend"), "推荐项目");
  // The desktop/modal label keeps its full form.
  assert.equal(t("en", "works.submit"), "Publish work");
});
