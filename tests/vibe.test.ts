import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VIBE, normalizeVibe } from "../src/lib/vibe";

/* ---- 站点默认气质(20260822 起可配置):单一事实源 src/lib/vibe.ts ---- */

test("DEFAULT_VIBE is one of the two vibes", () => {
  assert.ok(DEFAULT_VIBE === "poster" || DEFAULT_VIBE === "soft");
});

test("normalizeVibe: legal values pass through, junk falls back to default", () => {
  assert.equal(normalizeVibe("poster"), "poster");
  assert.equal(normalizeVibe("soft"), "soft");
  /* 与 DEFAULT_VIBE 不同档的合法值必须原样过(不能被默认吞掉) */
  assert.notEqual(normalizeVibe("soft"), normalizeVibe(""));
  /* 脏值/缺失回落站点默认 */
  assert.equal(normalizeVibe(""), DEFAULT_VIBE);
  assert.equal(normalizeVibe(undefined), DEFAULT_VIBE);
  assert.equal(normalizeVibe(null), DEFAULT_VIBE);
  assert.equal(normalizeVibe("SOFT"), DEFAULT_VIBE);
  assert.equal(normalizeVibe("1"), DEFAULT_VIBE);
});
