import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  isMediaKind,
  MEDIA_MAX_INPUT_BYTES,
  MediaError,
  processMedia,
} from "../src/lib/media";

function makeImage(
  width: number,
  height: number,
  format: "png" | "jpeg" = "png",
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: "#2255cc" },
  });
  return (format === "png" ? base.png() : base.jpeg()).toBuffer();
}

test("isMediaKind accepts known kinds only", () => {
  assert.equal(isMediaKind("logo"), true);
  assert.equal(isMediaKind("image"), true);
  assert.equal(isMediaKind("avatar"), true);
  assert.equal(isMediaKind("video"), false);
  assert.equal(isMediaKind(""), false);
});

test("logo is square-cropped to 512 webp", async () => {
  const out = await processMedia("logo", await makeImage(1200, 800));
  assert.equal(out.width, 512);
  assert.equal(out.height, 512);
  assert.equal(out.contentType, "image/webp");
  assert.equal(out.ext, "webp");
  assert.ok(out.body.byteLength > 0);
});

test("image keeps aspect ratio within 1600 and never enlarges", async () => {
  const wide = await processMedia("image", await makeImage(3200, 800, "jpeg"));
  assert.equal(wide.width, 1600);
  assert.equal(wide.height, 400);

  const small = await processMedia("image", await makeImage(800, 600));
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
});

test("rejects non-image payloads as 415-class errors", async () => {
  await assert.rejects(
    () => processMedia("image", Buffer.from("not an image at all")),
    (err: unknown) => err instanceof MediaError && err.code === "not_image",
  );
});

test("rejects oversized input before decoding", async () => {
  const big = Buffer.alloc(MEDIA_MAX_INPUT_BYTES + 1, 1);
  await assert.rejects(
    () => processMedia("image", big),
    (err: unknown) => err instanceof MediaError && err.code === "too_large",
  );
});
