import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_DIGEST_THRESHOLD,
  ERROR_MESSAGE_MAX,
  ERROR_STACK_MAX,
  errorFingerprint,
  isErrorSource,
  parseCspReport,
  parseErrorReport,
  shouldAlertErrorDigest,
} from "../src/lib/error-report";

test("parseErrorReport accepts the four sources and caps fields", () => {
  const row = parseErrorReport({
    source: "client",
    message: "x".repeat(ERROR_MESSAGE_MAX + 50),
    url: "https://kimi.builders/works/13",
    release: "abc123",
    stack: "y".repeat(ERROR_STACK_MAX + 10),
  });
  assert.ok(row);
  assert.equal(row.source, "client");
  assert.equal(row.message.length, ERROR_MESSAGE_MAX);
  assert.equal(row.stack?.length, ERROR_STACK_MAX);
  assert.equal(row.url, "https://kimi.builders/works/13");
  assert.equal(row.release, "abc123");
});

test("parseErrorReport rejects unknown sources and empty messages", () => {
  assert.equal(parseErrorReport({ source: "web", message: "boom" }), null);
  assert.equal(parseErrorReport({ source: "client", message: "   " }), null);
  assert.equal(parseErrorReport({ source: "client" }), null);
  assert.equal(parseErrorReport({}), null);
});

test("parseErrorReport coerces non-string fields instead of throwing", () => {
  const row = parseErrorReport({
    source: "server",
    message: 123,
    url: { bad: true },
    stack: ["nope"],
  } as unknown as Parameters<typeof parseErrorReport>[0]);
  assert.equal(row, null);
  const ok = parseErrorReport({ source: "server", message: "db down", url: 42 });
  assert.ok(ok);
  assert.equal(ok.url, "");
});

test("empty stacks become null, not empty strings", () => {
  const row = parseErrorReport({ source: "client", message: "boom", stack: "  " });
  assert.ok(row);
  assert.equal(row.stack, null);
});

test("parseCspReport reads both the legacy body and the Reporting API envelope", () => {
  const legacy = parseCspReport({
    "csp-report": {
      "document-uri": "https://kimi.builders/explore",
      "violated-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/lib.js",
    },
  });
  assert.ok(legacy);
  assert.equal(legacy.source, "csp");
  assert.match(legacy.message, /script-src-elem/);
  assert.match(legacy.message, /evil\.example/);
  assert.equal(legacy.url, "https://kimi.builders/explore");

  const envelope = parseCspReport({
    body: { documentURL: "https://kimi.builders/", blockedURL: "https://evil.example/x.js" },
  });
  assert.ok(envelope);
  assert.equal(envelope.source, "csp");
  assert.equal(envelope.url, "https://kimi.builders/");

  assert.equal(parseCspReport({ nope: 1 }), null);
  assert.equal(parseCspReport("junk"), null);
});

test("errorFingerprint groups by source + message head + stack head", () => {
  const a = parseErrorReport({ source: "client", message: "TypeError: X is not a function", stack: "at A\nat B\nat C" });
  const b = parseErrorReport({ source: "client", message: "TypeError: X is not a function", stack: "at A\nat B\nat TAIL-THAT-DIFFERS" });
  const c = parseErrorReport({ source: "client", message: "Different message entirely", stack: "at A\nat B\nat C" });
  const d = parseErrorReport({ source: "server", message: "TypeError: X is not a function", stack: "at A\nat B" });
  assert.ok(a && b && c && d);
  /* Same head (first 2 stack lines) + same message head => grouped. */
  assert.equal(errorFingerprint(a), errorFingerprint(b));
  /* Different message head or source => separate groups. */
  assert.notEqual(errorFingerprint(a), errorFingerprint(c));
  assert.notEqual(errorFingerprint(a), errorFingerprint(d));
});

test("digest stays quiet below the threshold and alerts at/above it", () => {
  assert.equal(shouldAlertErrorDigest({ total: 0, topMessage: null, topCount: 0 }).alert, false);
  assert.equal(
    shouldAlertErrorDigest({ total: ERROR_DIGEST_THRESHOLD - 1, topMessage: "x", topCount: 5 }).alert,
    false,
  );
  assert.equal(
    shouldAlertErrorDigest({ total: ERROR_DIGEST_THRESHOLD, topMessage: "x", topCount: 20 }).alert,
    true,
  );
});

test("isErrorSource is a plain allowlist check", () => {
  assert.ok(isErrorSource("client"));
  assert.ok(isErrorSource("csp"));
  assert.ok(!isErrorSource("Client"));
  assert.ok(!isErrorSource(null));
});
