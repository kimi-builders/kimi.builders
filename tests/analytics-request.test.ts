import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ANALYTICS_BODY_BYTES,
  readAnalyticsJson,
} from "../src/lib/analytics-request";

const encoder = new TextEncoder();

test("analytics JSON reader accepts valid JSON and the exact byte limit", async () => {
  const value = { event: "join_click" };
  assert.deepEqual(
    await readAnalyticsJson(
      new Request("https://example.test/api/analytics/event", {
        method: "POST",
        body: JSON.stringify(value),
      }),
    ),
    value,
  );

  const prefix = '{"padding":"';
  const suffix = '"}';
  const exactBody = `${prefix}${"x".repeat(
    MAX_ANALYTICS_BODY_BYTES - encoder.encode(prefix + suffix).byteLength,
  )}${suffix}`;
  assert.equal(encoder.encode(exactBody).byteLength, MAX_ANALYTICS_BODY_BYTES);
  const exact = await readAnalyticsJson(
    new Request("https://example.test/api/analytics/event", {
      method: "POST",
      body: exactBody,
    }),
  );
  assert.equal(typeof (exact as { padding: unknown }).padding, "string");
});

test("analytics JSON reader cancels a multi-chunk body above the limit", async () => {
  let cancelled = false;
  let pullCount = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(
        new Uint8Array(pullCount === 1 ? 1024 : MAX_ANALYTICS_BODY_BYTES - 1024 + 1),
      );
    },
    cancel() {
      cancelled = true;
    },
  });
  const init = {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" };

  await assert.rejects(
    readAnalyticsJson(new Request("https://example.test/api/analytics/event", init)),
    /body too large/,
  );
  assert.equal(pullCount, 2);
  assert.equal(cancelled, true);
});

test("analytics JSON reader rejects declared overflow, missing body, and malformed JSON", async () => {
  await assert.rejects(
    readAnalyticsJson(
      new Request("https://example.test/api/analytics/event", {
        method: "POST",
        headers: { "Content-Length": String(MAX_ANALYTICS_BODY_BYTES + 1) },
        body: "{}",
      }),
    ),
    /body too large/,
  );
  await assert.rejects(
    readAnalyticsJson(
      new Request("https://example.test/api/analytics/event", { method: "POST" }),
    ),
    /body missing/,
  );
  await assert.rejects(
    readAnalyticsJson(
      new Request("https://example.test/api/analytics/event", {
        method: "POST",
        body: "{not-json}",
      }),
    ),
    SyntaxError,
  );
});
