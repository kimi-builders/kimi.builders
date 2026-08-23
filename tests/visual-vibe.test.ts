import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* ---- Source pinning for the visual vibe (kb_vibe: poster default /
   soft). How it works: Tailwind v4 resolves every rounded-* to
   var(--radius-*) and shadows compose through --tw-shadow, so a vibe
   switch = globals.css overriding variables with zero component
   changes. This test pins four links of the chain: the variable block
   exists, <html data-vibe> renders directly, the cookie parses, and
   the toggle entries (TopBar/drawer/settings) plus the no-JS backstop
   action exist — break any link and vibe switching silently degrades
   to "classic forever"; this goes red first. ---- */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("globals.css: poster vibe zeroes radius/shadow and flattens card wash", () => {
  const css = read("app/globals.css");
  assert.match(css, /:root\[data-vibe="poster"\]\s*\{[\s\S]*?--radius-2xl: 0px/);
  assert.match(css, /--radius-lg: 0px/);
  /* Bare rounded and rounded-4xl sit outside the xs..3xl ladder — zeroing
     must list them explicitly. */
  assert.match(css, /:root\[data-vibe="poster"\]\s*\{[\s\S]*?--radius: 0px/);
  assert.match(css, /--radius-4xl: 0px/);
  /* Emptying shadows must kill only --tw-shadow (rings/focus rings ride
     independent variables and must survive). */
  assert.match(css, /:root\[data-vibe="poster"\][^{]*\{[\s\S]*?--tw-shadow: 0 0 #0000/);
  assert.match(css, /:root\[data-vibe="poster"\]\s*\{[\s\S]*?--color-card:/);
  /* The home poster scope (following the UI theme, scope="poster")
     redeclares tokens locally — the poster's demotion must follow
     explicitly. */
  assert.match(css, /:root\[data-vibe="poster"\] \[data-theme-scope="poster"\]/);
  /* Settings page vibe-card active states. */
  assert.match(css, /html\[data-vibe="poster"\] \.vibe-card-poster/);
});

test("root layout SSR-writes data-vibe from prefs (no-flash first paint)", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /data-vibe=\{prefs\.vibe\}/);
});

test("prefs: kb_vibe parses via normalizeVibe (default configurable in vibe.ts)", () => {
  /* The default vibe moved from literals to the single source
     DEFAULT_VIBE in src/lib/vibe.ts; prefs only normalizes the cookie —
     "which is default" no longer scatters across parse expressions. */
  const prefs = read("src/lib/prefs.ts");
  assert.match(prefs, /vibe: normalizeVibe\(store\.get\("kb_vibe"\)\?\.value\)/);

  const vibe = read("src/lib/vibe.ts");
  assert.match(vibe, /export const DEFAULT_VIBE: Vibe = "(poster|soft)";/, "DEFAULT_VIBE is a legal vibe");
  /* The backstop action shares the source: fallbacks go through
     normalizeVibe, no more hand-written poster literals. */
  const settingsActions = read("app/(app)/settings/actions.ts");
  assert.match(
    settingsActions,
    /set\("kb_vibe", normalizeVibe\(String\(formData\.get\("vibe"\) \?\? ""\)\)/,
  );
  const communityActions = read("app/(app)/community/actions.ts");
  assert.match(communityActions, /normalizeVibe\(store\.get\("kb_vibe"\)\?\.value\)/);
});

test("vibe surfaces: toggle in topbar/drawer, cards in settings, no-JS fallbacks", () => {
  const topbar = read("app/(app)/_components/TopBar.tsx");
  assert.ok(topbar.includes("VibeToggle"), "topbar has vibe toggle");

  const drawer = read("app/(app)/_components/MobileNavDrawer.tsx");
  assert.ok(drawer.includes("VibeToggle"), "mobile drawer has vibe toggle");

  const settings = read("app/(app)/settings/_components/SettingsContent.tsx");
  assert.ok(settings.includes("VibeCards"), "settings page has vibe cards");

  const communityActions = read("app/(app)/community/actions.ts");
  assert.ok(communityActions.includes("setVibeAction"), "toggle fallback action");

  const settingsActions = read("app/(app)/settings/actions.ts");
  assert.ok(settingsActions.includes("setVibeToAction"), "explicit pick fallback action");
});

test("reduced motion keeps the endless twin-star brand orbit as the single exception", () => {
  const home = read("app/page.tsx");
  const loading = read("components/BrandLoading.tsx");
  const css = read("app/globals.css");
  const logo = read("public/brand/logo-animated.svg");

  assert.match(home, /src="\/brand\/logo-animated\.svg"/);
  assert.match(loading, /src="\/brand\/logo-animated\.svg"/);
  assert.match(css, /single reduced-motion exception/);
  assert.doesNotMatch(css, /kb-brand-logo-static/);
  assert.match(logo, /<animateMotion[^>]*repeatCount="indefinite"/);
});
