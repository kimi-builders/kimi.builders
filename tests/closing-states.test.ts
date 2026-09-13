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

test("route modal's confirm bar replaces marked submit rows without an overlay", () => {
  const modal = read("app/(app)/_components/RouteModal.tsx");
  const postForm = read("app/(app)/community/_components/PostForm.tsx");
  /* The dialog is a flex column: header / scrollable body / confirm bar
     as siblings. When the new row shrinks the scrollport, a marked
     submit row is removed instead of leaving a clipped, clickable
     primary sliver at the seam. */
  assert.match(modal, /flex max-h-\[86vh\] flex-col/);
  assert.match(modal, /min-h-0 flex-1 overscroll-contain overflow-y-auto/);
  assert.match(modal, /confirming \? "\[&_\[data-modal-submit-row\]\]:hidden"/);
  assert.match(modal, /data-modal-confirm/);
  assert.match(postForm, /data-modal-submit-row/);
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

test("the new-post confirm says the draft survives; it never claims a discard", () => {
  /* The post form auto-saves a local draft, so closing cannot discard:
     the confirm copy names the real outcome and the close button reads
     "keep draft" with neutral styling (destructive:false). Forms
     without a local draft (works publish, admin) keep the discard
     copy. */
  const modal = read("app/@modal/(.)community/new/page.tsx");
  assert.match(modal, /modal\.draftCloseTitle/);
  assert.match(modal, /modal\.draftCloseKeep/);
  assert.match(modal, /destructive: false/);
  assert.doesNotMatch(modal, /modal\.dirtyTitle/);
  assert.doesNotMatch(modal, /modal\.discardClose/);
  assert.equal(t("zh", "modal.draftCloseTitle"), "关闭发帖窗口？草稿仍会保存在本设备。");
  assert.equal(t("en", "modal.draftCloseTitle"), "Close this form? Your draft will stay on this device.");
  assert.equal(t("zh", "modal.draftCloseKeep"), "保留草稿并关闭");
  assert.equal(t("en", "modal.draftCloseKeep"), "Close & keep draft");
});

test("modals without a local draft keep the discard-and-close contract", () => {
  const workModal = read("app/@modal/(.)works/new/page.tsx");
  assert.match(workModal, /modal\.dirtyTitle/);
  assert.match(workModal, /modal\.discardClose/);
  // The discard copy itself stays honest: it really discards.
  assert.equal(t("zh", "modal.discardClose"), "放弃并关闭");
  assert.equal(t("en", "modal.discardClose"), "Discard & close");
});

test("clearing the draft un-arms the close confirm (no copy left to lie)", () => {
  /* After "clear draft" there is no draft to keep — the confirm bar
     would promise "your draft will stay on this device" for a close
     that discards nothing. The form notifies the modal (bubbling
     custom event), which drops its dirty flag and takes a standing
     confirm bar down; X then closes directly. */
  const form = read("app/(app)/community/_components/PostForm.tsx");
  assert.match(form, /notifyModalDirtyReset\(formRef\.current\)/);
  const modal = read("app/(app)/_components/RouteModal.tsx");
  assert.match(modal, /MODAL_DIRTY_RESET_EVENT/);
  assert.match(modal, /body\.addEventListener\(MODAL_DIRTY_RESET_EVENT, reset\)/);
  /* The reset clears both the flag and a standing confirm bar. */
  assert.match(modal, /const reset = \(\) => \{\s*\n\s*setDirty\(false\);\s*\n\s*setConfirming\(false\);/);
});

test("confirm-bar close styling follows the guard's destructiveness", () => {
  const modal = read("app/(app)/_components/RouteModal.tsx");
  /* destructive:false (draft kept) = neutral border; default (real
     discard) = danger border + danger focus ring. */
  assert.match(modal, /dirtyGuard\.destructive === false/);
  assert.match(modal, /border-status-danger\/50 text-status-danger-fg/);
});

test("the post form still restores the local draft and clears it only on submit", () => {
  const form = read("app/(app)/community/_components/PostForm.tsx");
  /* Close-and-reopen restores the draft (the confirm copy relies on
     it); a successful submit is the only path that clears it. */
  assert.match(form, /readCommunityDraft\(window\.localStorage\.getItem\(COMMUNITY_DRAFT_KEY\)\)/);
  assert.match(form, /submittingRef\.current\) window\.localStorage\.removeItem\(COMMUNITY_DRAFT_KEY\)/);
});
