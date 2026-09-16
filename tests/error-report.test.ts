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
  previousUtcDayWindow,
  redactErrorText,
  sanitizeObservedPath,
  shouldAlertErrorDigest,
} from "../src/lib/error-report";

test("parseErrorReport accepts client sources, caps fields, and stores path only", () => {
  const row = parseErrorReport({
    source: "client",
    message: "x".repeat(ERROR_MESSAGE_MAX + 50),
    url: "https://kimi.builders/works/13?token=secret#private",
    stack: "y".repeat(ERROR_STACK_MAX + 10),
  });
  assert.ok(row);
  assert.equal(row.source, "client");
  assert.equal(row.message.length, ERROR_MESSAGE_MAX);
  assert.equal(row.stack?.length, ERROR_STACK_MAX);
  assert.equal(row.url, "/works/13");
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
  assert.equal(parseErrorReport({ source: "server", message: "db down", url: 42 }), null);
});

test("empty stacks become null, not empty strings", () => {
  const row = parseErrorReport({ source: "client", message: "boom", stack: "  " });
  assert.ok(row);
  assert.equal(row.stack, null);
});

test("parseCspReport reads both the legacy body and the Reporting API envelope", () => {
  const legacy = parseCspReport({
    "csp-report": {
      "document-uri": "https://kimi.builders/explore?code=oauth-secret#fragment",
      "violated-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/lib.js?token=secret",
    },
  });
  assert.ok(legacy);
  assert.equal(legacy.source, "csp");
  assert.match(legacy.message, /script-src-elem/);
  assert.match(legacy.message, /evil\.example/);
  assert.equal(legacy.url, "/explore");
  assert.doesNotMatch(legacy.message, /oauth-secret|token=secret/);

  const envelope = parseCspReport({
    body: { documentURL: "https://kimi.builders/", blockedURL: "https://evil.example/x.js" },
  });
  assert.ok(envelope);
  assert.equal(envelope.source, "csp");
  assert.equal(envelope.url, "/");

  assert.equal(parseCspReport({ nope: 1 }), null);
  assert.equal(parseCspReport("junk"), null);
});

test("errorFingerprint groups by source + message head + stack head", () => {
  const a = parseErrorReport({ source: "client", message: "TypeError: X is not a function", stack: "at A\nat B\nat C" });
  const b = parseErrorReport({ source: "client", message: "TypeError: X is not a function", stack: "at A\nat B\nat TAIL-THAT-DIFFERS" });
  const c = parseErrorReport({ source: "client", message: "Different message entirely", stack: "at A\nat B\nat C" });
  const d = parseErrorReport({ source: "global", message: "TypeError: X is not a function", stack: "at A\nat B" });
  assert.ok(a && b && c && d);
  /* Same head (first 2 stack lines) + same message head => grouped. */
  assert.equal(errorFingerprint(a, "release-a"), errorFingerprint(b, "release-a"));
  /* Different message head, source, or release => separate groups. */
  assert.notEqual(errorFingerprint(a, "release-a"), errorFingerprint(c, "release-a"));
  assert.notEqual(errorFingerprint(a, "release-a"), errorFingerprint(d, "release-a"));
  assert.notEqual(errorFingerprint(a, "release-a"), errorFingerprint(a, "release-b"));
  assert.match(errorFingerprint(a, "release-a"), /^[0-9a-f]{64}$/);
});

test("observability sanitizers remove URLs, credentials, and email addresses", () => {
  assert.equal(
    sanitizeObservedPath("https://kimi.builders/login/reset?token=deadbeef#reset"),
    "/login/reset",
  );
  assert.equal(sanitizeObservedPath("javascript:alert(1)"), "");
  const text = redactErrorText(
    "GET /callback?code=abc123&state=xyz Bearer abcdefghijk user@example.com",
    500,
  );
  assert.equal(
    text,
    "GET /callback?code=[redacted]&state=[redacted] Bearer [redacted] [redacted-email]",
  );
});

test("previousUtcDayWindow is stable throughout the next UTC day", () => {
  const morning = previousUtcDayWindow(new Date("2026-09-16T00:01:00.000Z"));
  const evening = previousUtcDayWindow(new Date("2026-09-16T23:59:59.999Z"));
  assert.equal(morning.key, "2026-09-15");
  assert.equal(evening.key, morning.key);
  assert.equal(morning.start.toISOString(), "2026-09-15T00:00:00.000Z");
  assert.equal(morning.end.toISOString(), "2026-09-16T00:00:00.000Z");
});

test("digest stays quiet below the threshold and alerts at/above it", () => {
  assert.equal(
    shouldAlertErrorDigest({ total: 0, topSource: null, topMessage: null, topCount: 0 }).alert,
    false,
  );
  assert.equal(
    shouldAlertErrorDigest({ total: ERROR_DIGEST_THRESHOLD - 1, topSource: "client", topMessage: "x", topCount: 5 }).alert,
    false,
  );
  assert.equal(
    shouldAlertErrorDigest({ total: ERROR_DIGEST_THRESHOLD, topSource: "csp", topMessage: "x", topCount: 20 }).alert,
    true,
  );
});

test("isErrorSource is a plain allowlist check", () => {
  assert.ok(isErrorSource("client"));
  assert.ok(isErrorSource("global"));
  assert.ok(isErrorSource("csp"));
  assert.ok(!isErrorSource("server"));
  assert.ok(!isErrorSource("Client"));
  assert.ok(!isErrorSource(null));
});
