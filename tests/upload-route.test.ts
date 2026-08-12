import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/api/upload/route.ts", import.meta.url),
  "utf8",
);

test("upload route consumes quota and checks Content-Length before multipart parsing", () => {
  const rate = source.indexOf('consumeCommunityRateLimit(user.id, "upload")');
  const length = source.indexOf('request.headers.get("content-length")');
  const parse = source.indexOf("request.formData()");
  assert.ok(rate >= 0 && length > rate && parse > length);
});

test("upload route documents the required reverse-proxy hard limit", () => {
  assert.match(source, /Caddy\/反代.*硬上限/);
});
