import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertOrder(input: string, first: string, second: string) {
  const firstIndex = input.indexOf(first);
  const secondIndex = input.indexOf(second);
  assert.ok(firstIndex >= 0, `missing ${first}`);
  assert.ok(secondIndex >= 0, `missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} must precede ${second}`);
}

test("error report route rejects foreign and non-JSON input before reading a body", () => {
  const route = source("app/api/error/route.ts");
  assertOrder(route, "isSameOrigin(request)", "request.text()");
  assertOrder(route, 'contentType !== "application/json"', "request.text()");
  assertOrder(route, "consumeUsageRateLimit({", "request.text()");
  assert.match(route, /parseErrorReport/);
  assert.match(route, /insertErrorEvent/);
  assert.match(route, /ERROR_BODY_MAX_BYTES/);
});

test("CSP route accepts only browser report media types before reading a body", () => {
  const route = source("app/api/csp-report/route.ts");
  assert.match(route, /application\/csp-report/);
  assert.match(route, /application\/reports\+json/);
  assertOrder(route, "CSP_CONTENT_TYPES.includes(contentType)", "request.text()");
  assertOrder(route, "consumeUsageRateLimit({", "request.text()");
  assert.match(route, /parseCspReport/);
  assert.match(route, /insertErrorEvent/);
});

test("browser reporters cannot submit release attribution", () => {
  const reporter = source("components/ErrorReporter.tsx");
  const boundaries = [source("app/error.tsx"), source("app/global-error.tsx")];
  assert.doesNotMatch(reporter, /release\s*:/);
  for (const boundary of boundaries) assert.doesNotMatch(boundary, /release\s*:/);
  assert.match(reporter, /source: "client"/);
  assert.match(boundaries[0], /source: "client"/);
  assert.match(boundaries[1], /source: "global"/);
});

test("error storage is anonymous, server-attributed, and fingerprinted", () => {
  const schema =
    source("db/schema.sql").match(
      /CREATE TABLE IF NOT EXISTS error_events \([\s\S]*?\n\)/,
    )?.[0] ?? "";
  const library = source("src/lib/error-report.ts");
  assert.doesNotMatch(schema, /user_id/);
  assert.match(schema, /fingerprint CHAR\(64\) NOT NULL/);
  assert.match(schema, /client\/global\/csp/);
  assert.match(library, /process\.env\.DEPLOYMENT_VERSION/);
  assert.match(library, /createHash\("sha256"\)/);
});

test("error digest uses a fixed UTC window and retry-safe delivery", () => {
  const route = source("app/api/cron/error-digest/route.ts");
  assert.match(route, /previousUtcDayWindow\(\)/);
  assert.match(route, /idempotencyKey:/);
  assert.match(route, /status: ok \? 200 : 502/);
  assert.match(route, /deliveryFailures/);
});
