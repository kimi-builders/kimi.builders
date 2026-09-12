import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NAV_HIDDEN } from "../src/lib/upcoming";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap-data";
import { t } from "../src/lib/i18n";

/* Closing states (dirty-form confirm, filtered empty states, search
   empty state, dialog focus) must stay honest and reversible: no
   overlapped primaries, no filters the reader can't see or clear, no
   suggestions that point at nothing, no dead CTAs. These pins hold the
   surfaces to the invariants the review found broken. */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("route modal's confirm bar is a layout row, never an overlay on the form footer", () => {
  const modal = read("app/(app)/_components/RouteModal.tsx");
  /* The dialog is a flex column: header / scrollable body / confirm bar
     as siblings — while the bar is up it takes its own layout row, so
     the form footer's primary button can never share pixels with it
     (an overlaid sliver of the primary submit reads as a second
     primary). */
  assert.match(modal, /flex max-h-\[86vh\] flex-col/);
  assert.match(modal, /min-h-0 flex-1 overscroll-contain overflow-y-auto/);
  assert.match(modal, /"flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-card px-6 py-3"/);
  assert.doesNotMatch(modal, /absolute inset-x-0 bottom-0/);
});

test("community filtered empty state never claims the community is empty and offers the way out", () => {
  const page = read("app/(app)/community/page.tsx");
  /* Topic/solved filters with no results take the dedicated state... */
  assert.match(page, /cat \|\| solvedOnly \? \(/);
  assert.match(page, /feed\.emptyFiltered/);
  assert.match(page, /feed\.emptyFilteredCta/);
  /* ...which clears every active feed filter, including a combined
     subscribed + topic/solved state, back to the full feed. */
  assert.match(page, /feedHref\(\{ cat: null, sub: null, solved: null \}\)/);
});

test("leaderboard empty CTA leads with login for signed-out visitors", () => {
  const page = read("app/(app)/usage/leaderboard/page.tsx");
  assert.match(page, /user \? "\/usage#usage-management" : "\/login\?next=%2Fusage"/);
  assert.match(page, /lb\.emptyCtaLogin/);
  assert.match(page, /lb\.emptyHintLogin/);
});

test("global search hands focus back to its trigger on every close path", () => {
  const search = read("app/(app)/_components/GlobalSearch.tsx");
  assert.match(search, /onClose=\{onDialogClose\}/);
  assert.match(search, /triggerRef\.current\?\.focus\(\)/);
});

test("search empty suggestions stay inside the search catalog", () => {
  /* demo-night is nav-hidden: it matches nothing in search, so the
     empty-state hint must not suggest it. If demo-night relaunches
     (NAV_HIDDEN flips), the suggestion may return — update this pin
     together with upcoming.ts. */
  if (NAV_HIDDEN.demoNight) {
    assert.doesNotMatch(t("zh", "search.emptyHint"), /demo/i);
    assert.doesNotMatch(t("en", "search.emptyHint"), /demo/i);
  }
});

test("sitemap static paths exclude nav-hidden sections", () => {
  assert.equal(
    (SITEMAP_STATIC_PATHS as readonly string[]).includes("/demo-night"),
    !NAV_HIDDEN.demoNight,
  );
});

test("user-facing usage copy speaks the uploader's view, not implementation words", () => {
  const surfaces = [
    "app/(app)/usage/_components/UsagePrivacyForm.tsx",
    "app/(app)/usage/_components/UsageEmptyStates.tsx",
    "app/(app)/usage/_components/UsageSyncDialog.tsx",
    "app/(app)/usage/_components/DeleteAllUsageDialog.tsx",
    "app/(app)/usage/_components/DeviceManagementDialog.tsx",
    "app/(app)/usage/_components/UsageMethodologyDialog.tsx",
    "app/(app)/usage/_components/DeviceApprovalForm.tsx",
    "app/(app)/usage/device/_components/UsageDeviceContent.tsx",
  ]
    .map(read)
    .join("\n");
  assert.doesNotMatch(surfaces, /Collector|collector/);
  assert.doesNotMatch(surfaces, /payload|basename/);
});

test("explore lens deep links honor the one availability judgment on every issuing surface", () => {
  for (const path of [
    "app/(app)/explore/page.tsx",
    "app/(app)/_components/rail/ExploreRail.tsx",
    "app/(app)/_components/rail/ArticleRail.tsx",
    "app/(app)/explore/series/[slug]/page.tsx",
  ]) {
    assert.match(read(path), /availableExploreFilters\(/, path);
  }
  /* The URL channel never filters on a lens the toolbar can't render:
     every lens param parse is guarded by the shared availability check. */
  const page = read("app/(app)/explore/page.tsx");
  assert.match(page, /lensAvailable\("product"\) && v/);
  assert.match(page, /lensAvailable\("role"\) && v/);
  assert.match(page, /lensAvailable\("tag"\) \? first\(sp\.tag\)/);
  assert.match(page, /lensAvailable\("year"\) \? first\(sp\.year\)/);
});

test("explore lede names exactly the lenses that render this request", () => {
  const page = read("app/(app)/explore/page.tsx");
  assert.match(page, /explore\.ledeLenses/);
  assert.match(page, /explore\.ledeBase/);
  assert.doesNotMatch(page, /explore\.lede"/);
});

test("monthly issue navigation renders only when a neighbor exists", () => {
  const detail = read("app/(app)/explore/[slug]/page.tsx");
  assert.match(detail, /\(prev \|\| next\) && \(/);
  /* The nav and its links stand or fall together: no empty landmark
     with placeholder spans. */
  assert.doesNotMatch(detail, /\{\(prev \|\| next\) && \([\s\S]*?<span \/>/);
  /* With no placeholder node, a lone next/newer link must push itself
     to the right edge instead of inheriting the first flex position. */
  assert.match(
    detail,
    /href=\{`\/explore\/\$\{next\.slug\}`\} className="kb-navlink group ml-auto min-w-0 text-right"/,
  );
});
