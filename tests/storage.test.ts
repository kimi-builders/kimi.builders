import assert from "node:assert/strict";
import test from "node:test";
import { mediaKey, mediaUrl, mediaBucket, storageConfigured } from "../src/lib/storage";

test("mediaKey is content-addressed: same body → same key", () => {
  const body = Buffer.from("hello media");
  const a = mediaKey("image", body);
  const b = mediaKey("image", Buffer.from("hello media"));
  assert.equal(a, b);
  assert.match(a, /^image\/\d{6}\/[0-9a-f]{16}\.webp$/);
});

test("mediaKey differs by content and prefix", () => {
  const body = Buffer.from("hello media");
  assert.notEqual(mediaKey("image", body), mediaKey("logo", body));
  assert.notEqual(mediaKey("image", body), mediaKey("image", Buffer.from("other")));
});

test("mediaUrl joins base without double slashes and strips trailing slash", () => {
  process.env.R2_PUBLIC_BASE_URL = "https://cdn.kimi.builders/";
  assert.equal(
    mediaUrl("image/202608/abc.webp"),
    "https://cdn.kimi.builders/image/202608/abc.webp",
  );
  delete process.env.R2_PUBLIC_BASE_URL;
  // 未配置时回退默认域名
  assert.equal(
    mediaUrl("logo/x.webp"),
    "https://cdn.kimi.builders/logo/x.webp",
  );
});

test("storageConfigured requires all three R2 credentials", () => {
  const saved = { ...process.env };
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  assert.equal(storageConfigured(), false);
  process.env.R2_ENDPOINT = "https://x.r2.cloudflarestorage.com";
  assert.equal(storageConfigured(), false);
  process.env.R2_ACCESS_KEY_ID = "id";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  assert.equal(storageConfigured(), true);
  process.env = saved;
});

test("mediaBucket defaults to kb-media", () => {
  const saved = process.env.R2_BUCKET;
  delete process.env.R2_BUCKET;
  assert.equal(mediaBucket(), "kb-media");
  if (saved !== undefined) process.env.R2_BUCKET = saved;
});
