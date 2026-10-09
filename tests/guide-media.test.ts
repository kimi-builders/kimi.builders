import assert from "node:assert/strict";
import test from "node:test";
import { guideMediaState, localDeckPath, resolveGuideMedia } from "../src/lib/guide-media";
import { deriveFormats } from "../src/lib/explore";

test("static deck paths stay within the public decks directory", () => {
  assert.equal(localDeckPath("/decks/a.html?locale=zh#p2", "/tmp/public"), "/tmp/public/decks/a.html");
  for (const url of ["/decks/../secret", "/decks/%2e%2e/secret", "/decks/%00", "/decks/%ZZ", "/decks/a\\b"]) {
    assert.equal(localDeckPath(url, "/tmp/public"), "");
  }
  assert.equal(localDeckPath("https://example.com/slides", "/tmp/public"), null);
  assert.equal(localDeckPath("/dynamic-slides/a", "/tmp/public"), null);
});

test("missing deck-only content is unlisted without mutating its stored payload", () => {
  const payload = { deck: "/decks/missing.html", resources: [{ label: "Source", url: "/" }] };
  const result = guideMediaState(false, payload, false);
  assert.equal(result.unavailable, true);
  assert.equal(result.payload.deck, undefined);
  assert.equal(payload.deck, "/decks/missing.html");
  assert.deepEqual(deriveFormats(false, result.payload), []);
});

test("valid deck-only content is labelled slides, and alternate primary media stays readable", () => {
  assert.deepEqual(deriveFormats(false, guideMediaState(false, { deck: "/decks/a.html" }, true).payload), ["deck"]);
  assert.equal(guideMediaState(true, { deck: "/decks/missing.html" }, false).unavailable, false);
  const video = { provider: "youtube" as const, id: "x" };
  assert.deepEqual(deriveFormats(false, guideMediaState(false, { video, deck: "/decks/missing.html" }, false).payload), ["video"]);
});

test("a missing static deck fails readiness without an HTTP request", async () => {
  const result = await resolveGuideMedia(false, { deck: "/decks/nonexistent-acceptance-fixture.html" });
  assert.equal(result.unavailable, true);
});
