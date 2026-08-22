import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VIBE, normalizeVibe } from "../src/lib/vibe";

/* ---- The site's default vibe (configurable): single source
   src/lib/vibe.ts ---- */

test("DEFAULT_VIBE is one of the two vibes", () => {
  assert.ok(DEFAULT_VIBE === "poster" || DEFAULT_VIBE === "soft");
});

test("normalizeVibe: legal values pass through, junk falls back to default", () => {
  assert.equal(normalizeVibe("poster"), "poster");
  assert.equal(normalizeVibe("soft"), "soft");
  /* A legal value differing from DEFAULT_VIBE must pass through as-is
     (never swallowed by the default); the assertion assumes nothing
     about which vibe is default — the default is configurable
     (vibe.ts), and the test survives a change. */
  const other: "poster" | "soft" = DEFAULT_VIBE === "poster" ? "soft" : "poster";
  assert.equal(normalizeVibe(other), other);
  assert.notEqual(normalizeVibe(other), normalizeVibe(""));
  /* Dirty/missing values fall back to the site default. */
  assert.equal(normalizeVibe(""), DEFAULT_VIBE);
  assert.equal(normalizeVibe(undefined), DEFAULT_VIBE);
  assert.equal(normalizeVibe(null), DEFAULT_VIBE);
  assert.equal(normalizeVibe("SOFT"), DEFAULT_VIBE);
  assert.equal(normalizeVibe("1"), DEFAULT_VIBE);
});
