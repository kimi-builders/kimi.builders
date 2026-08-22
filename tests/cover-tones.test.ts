import assert from "node:assert/strict";
import test from "node:test";
import {
  COVER_TONES,
  coverTextureClass,
  coverToneClass,
  coverToneName,
  isCoverTone,
} from "../src/lib/cover-tones";

/* ---- The name-brick tone registry (cover-tones.ts) ---- */

test("coverToneClass: theme falls back to null, fixed tones get the css pair", () => {
  assert.equal(coverToneClass("theme"), null);
  assert.equal(coverToneClass("green"), "work-tone work-tone-green");
  assert.equal(coverToneClass("blue"), "work-tone work-tone-blue");
  assert.equal(coverToneClass("black"), "work-tone work-tone-black");
  /* Unknown ids fall back to theme (render tolerance: bad values fall
     back to the theme brick, never killing the page). */
  assert.equal(coverToneClass("nope"), null);
});

test("isCoverTone / coverToneName: registry lookup with fallback", () => {
  assert.equal(isCoverTone("blue"), true);
  assert.equal(isCoverTone("red"), false);
  assert.equal(coverToneName("black", true), COVER_TONES[3].zh);
  assert.equal(coverToneName("unknown", false), COVER_TONES[0].en);
});

/* ---- Name-brick texture variants: stable hash by name, roughly half
   carry the grid ---- */

test("coverTextureClass: deterministic per key", () => {
  assert.equal(coverTextureClass("Kimi-Claw"), coverTextureClass("Kimi-Claw"));
  assert.equal(coverTextureClass(""), coverTextureClass(""));
});

test("coverTextureClass: both variants are reachable (roughly half)", () => {
  const keys = Array.from({ length: 200 }, (_, i) => `work-${i}`);
  const gridded = keys.filter((k) => coverTextureClass(k) === "work-tile-grid");
  assert.equal(gridded.length > 60, true);
  assert.equal(gridded.length < 140, true);
  /* Only two outputs exist: grid or no texture. */
  for (const k of keys) {
    assert.ok(coverTextureClass(k) === null || coverTextureClass(k) === "work-tile-grid");
  }
});
