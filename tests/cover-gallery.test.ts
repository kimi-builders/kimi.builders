import assert from "node:assert/strict";
import test from "node:test";
import {
  awesomeCover,
  COVER_GALLERY,
  isGalleryCoverSrc,
} from "../src/lib/cover-gallery";

/* ---- Cover gallery: curated preset covers stored as root-relative
   public paths. Works submissions allowlist against this registry;
   awesome rows hash their name onto it. ---- */

test("registry: eight unique root-relative webp srcs", () => {
  assert.equal(COVER_GALLERY.length, 8);
  const srcs = COVER_GALLERY.map((cover) => cover.src);
  assert.equal(new Set(srcs).size, 8);
  for (const src of srcs) {
    assert.ok(src.startsWith("/covers/"), src);
    assert.ok(src.endsWith(".webp"), src);
  }
  for (const cover of COVER_GALLERY) {
    assert.ok(cover.id.length > 0);
    assert.ok(cover.zh.length > 0);
    assert.ok(cover.en.length > 0);
  }
});

test("isGalleryCoverSrc: exact members only", () => {
  assert.equal(isGalleryCoverSrc("/covers/paper-plane.webp"), true);
  assert.equal(isGalleryCoverSrc("/covers/paper-plane.webp?x=1"), false);
  assert.equal(isGalleryCoverSrc("/covers/unknown.webp"), false);
  assert.equal(isGalleryCoverSrc("image/202601/abc.webp"), false);
  assert.equal(isGalleryCoverSrc(""), false);
});

test("awesomeCover: deterministic and in-registry", () => {
  const first = awesomeCover("My Awesome Tool");
  assert.equal(first, awesomeCover("My Awesome Tool"));
  for (const name of ["a", "b", "编译器", "another-entry", "x".repeat(64)]) {
    const cover = awesomeCover(name);
    assert.ok(isGalleryCoverSrc(cover.src));
  }
  // 16 samples spread over more than one cover
  const picks = new Set(
    Array.from({ length: 16 }, (_, i) => awesomeCover(`entry-${i}`).id),
  );
  assert.ok(picks.size > 1);
});
