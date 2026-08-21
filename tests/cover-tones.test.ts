import assert from "node:assert/strict";
import test from "node:test";
import {
  COVER_TONES,
  coverTextureClass,
  coverToneClass,
  coverToneName,
  isCoverTone,
} from "../src/lib/cover-tones";

/* ---- 名称砖色档注册表(cover-tones.ts) ---- */

test("coverToneClass: theme falls back to null, fixed tones get the css pair", () => {
  assert.equal(coverToneClass("theme"), null);
  assert.equal(coverToneClass("green"), "work-tone work-tone-green");
  assert.equal(coverToneClass("blue"), "work-tone work-tone-blue");
  assert.equal(coverToneClass("black"), "work-tone work-tone-black");
  /* 未知 id 按 theme 兜底(渲染路径容错:坏值回落主题砖,不打掉页面) */
  assert.equal(coverToneClass("nope"), null);
});

test("isCoverTone / coverToneName: registry lookup with fallback", () => {
  assert.equal(isCoverTone("blue"), true);
  assert.equal(isCoverTone("red"), false);
  assert.equal(coverToneName("black", true), COVER_TONES[3].zh);
  assert.equal(coverToneName("unknown", false), COVER_TONES[0].en);
});

/* ---- 名称砖纹理变体(20260821 评审):按名稳定哈希,约一半带网格 ---- */

test("coverTextureClass: deterministic per key", () => {
  assert.equal(coverTextureClass("Kimi-Claw"), coverTextureClass("Kimi-Claw"));
  assert.equal(coverTextureClass(""), coverTextureClass(""));
});

test("coverTextureClass: both variants are reachable (roughly half)", () => {
  const keys = Array.from({ length: 200 }, (_, i) => `work-${i}`);
  const gridded = keys.filter((k) => coverTextureClass(k) === "work-tile-grid");
  assert.equal(gridded.length > 60, true);
  assert.equal(gridded.length < 140, true);
  /* 输出值只有两种:网格类或无纹理 */
  for (const k of keys) {
    assert.ok(coverTextureClass(k) === null || coverTextureClass(k) === "work-tile-grid");
  }
});
