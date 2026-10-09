import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isMobileUA,
  readWorksSourceCookie,
  parseWorksSource,
  workDetailHref,
  WORKS_SRC_COOKIE,
  WORKS_VIEW_COOKIE,
} from "../src/lib/works-view";

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

test("works source cookie parses the active list lens", () => {
  assert.equal(WORKS_SRC_COOKIE, "kb-works-src");
  assert.equal(readWorksSourceCookie("kb_theme=dark; kb-works-src=awesome"), "awesome");
  assert.equal(readWorksSourceCookie("kb-works-src=works; kb_locale=zh"), "works");
  assert.equal(readWorksSourceCookie("kb-works-src=unknown"), null);
  assert.equal(readWorksSourceCookie("other=awesome"), null);
});

test("work detail links carry only a validated, explicit list context", () => {
  assert.equal(workDetailHref(13, "works"), "/works/13?from=works");
  assert.equal(workDetailHref(13, "awesome"), "/works/13?from=awesome");
  assert.equal(workDetailHref(13), "/works/13");
  assert.equal(parseWorksSource("works"), "works");
  assert.equal(parseWorksSource("awesome"), "awesome");
  for (const value of ["/awesome", "unknown", ["works"], undefined, null]) {
    assert.equal(parseWorksSource(value), null);
  }
});

test("detail, cards, and all three navigation surfaces share explicit source context", () => {
  const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const file of ["LeftNav", "MobileTabBar", "MobileNavDrawer"]) {
    assert.match(read(`app/(app)/_components/${file}.tsx`), /useWorksSource\(worksSrc\)/);
  }
  const hook = read("app/(app)/_components/useWorksSource.ts");
  assert.match(hook, /parseWorksSource\(params\.get\("from"\)\)/);
  assert.match(hook, /useEffect\(/);
  assert.match(read("app/(app)/works/[id]/page.tsx"), /getWorksSource\(\(await searchParams\)\.from\)/);
  for (const file of ["WorkCard", "WorkGridCard"]) {
    const card = read(`app/(app)/works/_components/${file}.tsx`);
    assert.match(card, /href=\{workDetailHref\(w\.id, listSource\)\}/);
    assert.match(card, /pointer-events-none/);
    assert.match(card, /focus-visible:outline-ui-blue/);
  }
});
