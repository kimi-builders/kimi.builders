import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(
  new URL("../components/HoverPrefetchLink.tsx", import.meta.url),
  "utf8",
);

test("intent link disables viewport prefetch and restores the default on intent", () => {
  assert.match(src, /prefetch=\{active \? null : false\}/);
  assert.match(src, /onMouseEnter=\{\(\) => setActive\(true\)\}/);
  assert.match(src, /onFocus=\{\(\) => setActive\(true\)\}/);
});
