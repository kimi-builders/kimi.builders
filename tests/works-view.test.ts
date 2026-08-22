import assert from "node:assert/strict";
import test from "node:test";
import { isMobileUA, WORKS_VIEW_COOKIE } from "../src/lib/works-view";

/* ---- Mobile UA detection (mobile is always rows) ---- */

test("isMobileUA: phones detected, desktop UA not", () => {
  /* iPhone Safari. */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ),
    true,
  );
  /* Android Chrome (phones and tablets share the prefix — both take the
     mobile rules). */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
    ),
    true,
  );
  /* Desktop macOS Safari (iPadOS 13+ requests desktop UAs by default —
     desktop rules too). */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    ),
    false,
  );
  /* Desktop Windows Chrome. */
  assert.equal(
    isMobileUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    ),
    false,
  );
  /* Empty/missing UA: prefer desktop (beyond the rows default, the
     toggle still shows — nobody gets trapped). */
  assert.equal(isMobileUA(""), false);
});

test("works-view cookie name stays stable (kb-works-view)", () => {
  assert.equal(WORKS_VIEW_COOKIE, "kb-works-view");
});
