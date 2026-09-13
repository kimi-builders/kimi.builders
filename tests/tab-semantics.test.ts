import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/lib/i18n";
import { resolveTabMove } from "../app/(app)/settings/_components/SettingsTabs";

/* Two tab grammars, one boundary (20260912 review; written into
   AGENTS.md and components/seg-classes.ts):
   - Solid seg block (components/seg-classes.ts): mode / filter /
     format switches within one object — DetailTabs. Interactive tabs
     carry the full ARIA pattern (tablist/tab/tabpanel).
   - Underline tabs: long-lived in-page sections whose panels stay
     mounted with unsaved state — Settings, Profile. URL-driven
     section tabs are nav links carrying aria-current, never
     role="tab".
   These pins keep future pages from re-deciding the grammar by
   guessing. */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("DetailTabs: content-format tabs use the solid seg block with the full ARIA pattern", () => {
  const detail = read("components/DetailTabs.tsx");
  assert.match(detail, /SEG_WRAP/);
  assert.match(detail, /SEG_ITEM_ACTIVE/);
  assert.match(detail, /role="tablist"/);
  assert.match(detail, /role="tab"/);
  assert.match(detail, /role="tabpanel"/);
  assert.match(detail, /aria-selected=/);
  assert.match(detail, /aria-controls=/);
});

test("SettingsTabs: underline section tabs, ARIA-complete, never the seg block", () => {
  const settings = read("app/(app)/settings/_components/SettingsTabs.tsx");
  /* Underline grammar: a border-b hairline, not the inverted block. */
  assert.match(settings, /border-b-2/);
  assert.doesNotMatch(settings, /seg-classes/);
  assert.doesNotMatch(settings, /SEG_ITEM_ACTIVE/);
  /* Interactive in-page tabs keep the full ARIA pairing, including a
     named tablist (labels arrive pre-localized from the server). */
  assert.match(settings, /role="tablist"/);
  assert.match(settings, /aria-label=\{ariaLabel\}/);
  assert.match(settings, /role="tab"/);
  assert.match(settings, /role="tabpanel"/);
  assert.match(settings, /aria-selected=/);
  assert.match(settings, /aria-controls=/);
  assert.match(settings, /aria-labelledby=/);
  /* Roving tabIndex: only the active tab is in the tab order, ←/→/
     Home/End move focus and selection (selection follows focus). */
  assert.match(settings, /tabIndex=\{active === tab\.key \? 0 : -1\}/);
  assert.match(settings, /resolveTabMove\(/);
  assert.match(settings, /focus\(\{ preventScroll: true \}\)/);
  /* Panels stay mounted (hidden) so unsaved form state survives tab
     switches — the reason this grammar exists. */
  assert.match(settings, /hidden=/);
  /* The settings page names the tablist through the paired DICT key. */
  const content = read("app/(app)/settings/_components/SettingsContent.tsx");
  assert.match(content, /ariaLabel=\{t\(locale, "set\.tabsLabel"\)\}/);
  assert.equal(t("zh", "set.tabsLabel"), "设置分区");
  assert.equal(t("en", "set.tabsLabel"), "Settings sections");
});

test("resolveTabMove: arrow keys wrap, Home/End jump, other keys ignored", () => {
  const keys = ["profile", "prefs", "privacy", "account"];
  assert.equal(resolveTabMove(keys, "profile", "ArrowRight"), "prefs");
  assert.equal(resolveTabMove(keys, "account", "ArrowRight"), "profile");
  assert.equal(resolveTabMove(keys, "profile", "ArrowLeft"), "account");
  assert.equal(resolveTabMove(keys, "prefs", "ArrowLeft"), "profile");
  assert.equal(resolveTabMove(keys, "privacy", "Home"), "profile");
  assert.equal(resolveTabMove(keys, "prefs", "End"), "account");
  assert.equal(resolveTabMove(keys, "prefs", "ArrowDown"), null);
  assert.equal(resolveTabMove(keys, "missing", "ArrowRight"), null);
});

test("Profile section tabs: URL-driven nav links with aria-current, not ARIA tabs", () => {
  const profile = read("app/(app)/u/[handle]/page.tsx");
  assert.match(profile, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(profile, /kb-navlink/);
  assert.doesNotMatch(profile, /role="tab"/);
  assert.doesNotMatch(profile, /role="tablist"/);
});

test("MobileTabBar: bottom navigation is links with aria-current, not tabs", () => {
  const bar = read("app/(app)/_components/MobileTabBar.tsx");
  assert.match(bar, /aria-current=\{tab\.active \? "page" : undefined\}/);
  assert.doesNotMatch(bar, /role="tab"/);
});
