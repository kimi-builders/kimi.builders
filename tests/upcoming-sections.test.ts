import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NAV_HIDDEN, UPCOMING } from "../src/lib/upcoming";

/* ---- Source pinning for the not-yet-ready section switches
   (src/lib/upcoming.ts): while explore / Demo Night are gated, the
   page, navigation, search, and rail must agree in all four places;
   Demo Night isn't shipping soon — its entry wears no SOON badge,
   simply hidden (NAV_HIDDEN). The 20260821 merge turned blog/learn into
   explore; the legacy /blog and /learn pages 301 and carry no gate
   branches. ---- */

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("upcoming flags: explore open; demoNight stays gated", () => {
  /* explore opened up (the four-dimension shelf; empty content is an
     honest empty state); demoNight stays gated. UPCOMING branches stay
     in the pages, ready to re-gate anytime. */
  assert.deepEqual(UPCOMING, { explore: false, demoNight: true });
});

test("nav-hidden flags: demoNight entries are removed, not just badged", () => {
  assert.deepEqual(NAV_HIDDEN, { demoNight: true });
});

test("gated pages short-circuit to SoonPanel before any data fetch", () => {
  const gated: Array<[string, string]> = [
    ["app/(app)/explore/page.tsx", "UPCOMING.explore"],
    ["app/(app)/explore/[slug]/page.tsx", "UPCOMING.explore"],
    ["app/(app)/explore/series/[slug]/page.tsx", "UPCOMING.explore"],
    /* Modalization moved the gate and data fetching into the shared
       content component (both the full page and the intercepted modal
       pass the same gate); the page itself is a thin shell. */
    ["app/(app)/blog/admin/new/_components/NewArticleContent.tsx", "UPCOMING.explore"],
    ["app/(app)/blog/admin/[slug]/edit/_components/EditArticleContent.tsx", "UPCOMING.explore"],
    ["app/(app)/demo-night/page.tsx", "UPCOMING.demoNight"],
  ];
  for (const [path, flag] of gated) {
    const source = read(path);
    assert.match(source, /SoonPanel/, `${path} renders SoonPanel`);
    assert.ok(
      source.includes(`if (${flag})`),
      `${path} gates on ${flag} before data fetching`,
    );
  }
});

test("nav surfaces: SOON badge for gated, hidden for nav-hidden", () => {
  const left = read("app/(app)/_components/LeftNav.tsx");
  assert.ok(left.includes("soon: UPCOMING.explore"), "LeftNav explore soon");
  assert.ok(
    left.includes("hidden: NAV_HIDDEN.demoNight"),
    "LeftNav demoNight hidden",
  );
  /* LeftNav renders sections in live/soon groups; the filter predicate
     is a compound (!s.hidden && !s.soon) — we pin only the "hidden
     must be filtered" semantics. */
  assert.match(left, /\.filter\(\(\w+\) => !\w+\.hidden/, "LeftNav filters hidden");
  /* The mobile drawer shares the desktop's SECTIONS registry: both
     surfaces always agree — no local copies allowed. */
  const drawer = read("app/(app)/_components/MobileNavDrawer.tsx");
  assert.ok(
    drawer.includes(`import { SECTIONS } from "./LeftNav"`),
    "drawer shares the LeftNav SECTIONS registry",
  );
  assert.match(drawer, /\.filter\(\(\w+\) => !\w+\.hidden/, "drawer filters hidden");
  const search = read("app/(app)/_components/GlobalSearch.tsx");
  assert.ok(search.includes("soon(locale, UPCOMING.explore)"), "search explore soon");
  assert.ok(
    search.includes("NAV_HIDDEN.demoNight"),
    "search drops demoNight while nav-hidden",
  );
});

test("dedicated explore rail falls back to community while gated", () => {
  const rail = read("app/(app)/_components/right-rail.ts");
  assert.match(rail, /!UPCOMING\.explore && \(p === "\/explore"/);
});
