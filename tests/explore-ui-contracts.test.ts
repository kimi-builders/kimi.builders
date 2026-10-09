import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/lib/i18n";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("external search changes reset the draft while unrelated lens changes preserve it", () => {
  const page = source("app/(app)/explore/page.tsx");
  assert.match(page, /<ExploreSearch key=\{selQ \?\? ""\}/);
  assert.match(page, /id="explore-catalog"/);
  assert.match(page, /href="#explore-catalog"/);
  assert.match(page, /practices: items\.filter\(\(item\) => item\.kind === "guide"\)\.length/);
  assert.equal(t("zh", "explore.typePractices"), "独立实践");
});

test("search clearing has a touch target and describes only the search action", () => {
  const search = source("app/(app)/explore/_components/ExploreSearch.tsx");
  assert.match(search, /data-tip=\{t\(locale, "explore.clearSearch"\)\}/);
  assert.match(search, /size-11/);
  assert.doesNotMatch(search, /works\.clearFilters/);
  assert.equal(t("en", "explore.clearSearch"), "Clear search");
});

test("portrait posters preserve their content and series breadcrumbs can wrap", () => {
  const page = source("app/(app)/explore/page.tsx");
  assert.match(page, /aspect-\[3\/4\] w-full object-contain/);
  const detail = source("app/(app)/explore/[slug]/page.tsx");
  const breadcrumb = detail.slice(detail.indexOf("{/* Breadcrumb: back to the explore shelf"));
  assert.match(breadcrumb, /flex min-w-0 flex-wrap/);
  assert.match(breadcrumb, /min-w-0 flex-1 truncate/);
  assert.equal(t("en", "explore.reverifyPending"), "Verification expired; recheck pending");
});

test("unavailable primary media is blocked at publication and rendered without an iframe", () => {
  const actions = source("app/(app)/blog/actions.ts");
  assert.match(actions, /publish && parsed\.payload\.deck && !media\.payload\.deck/);
  const detail = source("app/(app)/explore/[slug]/page.tsx");
  assert.match(detail, /if \(tutorial\.mediaUnavailable\)/);
  assert.match(detail, /guide\.tutorial\.mediaUnavailable.*robots: \{ index: false, follow: true \}/);
});
