import assert from "node:assert/strict";
import test from "node:test";
import {
  HSTS_HEADER,
  buildCspReportOnly,
  securityHeaders,
} from "../src/lib/security-headers";

test("CSP is report-only shaped: self defaults, inline for Next, frame allowlist", () => {
  const csp = buildCspReportOnly();
  assert.match(csp, /^default-src 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /font-src 'self' data:/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /img-src 'self' data: https:/);
  assert.match(csp, /frame-src 'self' https:/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /report-uri \/api\/csp-report/);
});

test("hsts is conservative: capped max-age, no subdomains, no preload", () => {
  assert.match(HSTS_HEADER, /^max-age=\d+$/);
  assert.ok(!HSTS_HEADER.includes("includeSubDomains"));
  assert.ok(!HSTS_HEADER.includes("preload"));
});

test("securityHeaders composes the report-only policy and hsts", () => {
  const headers = securityHeaders();
  assert.match(headers.csp, /img-src 'self' data: https:/);
  assert.equal(headers.hsts, HSTS_HEADER);
});

test("next.config wires the headers onto every path without dropping the existing ones", async () => {
  const config = (await import("../next.config")).default;
  const headers = await config.headers?.();
  const root = headers?.find((h) => h.source === "/:path*");
  assert.ok(root, "root header set exists");
  const keys = root.headers.map((h) => h.key);
  for (const key of [
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Content-Security-Policy-Report-Only",
    "Strict-Transport-Security",
  ]) {
    assert.ok(keys.includes(key), `missing header ${key}`);
  }
});
