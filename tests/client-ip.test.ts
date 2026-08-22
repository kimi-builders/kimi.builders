import assert from "node:assert/strict";
import test from "node:test";
import { trustedClientIp } from "../src/lib/client-ip";

/* The trusted IP extraction order for rate limiting / visitor identity:
   cf-connecting-ip > x-real-ip > the rightmost XFF segment > null. The
   leftmost XFF segment (client-supplied) must be ignored. */
test("trustedClientIp prefers cf-connecting-ip over everything", () => {
  assert.equal(
    trustedClientIp(
      new Headers({
        "cf-connecting-ip": "198.51.100.7",
        "x-real-ip": "10.0.0.1",
        "x-forwarded-for": "1.2.3.4, 10.0.0.2",
      }),
    ),
    "198.51.100.7",
  );
});

test("trustedClientIp falls back to x-real-ip, then the rightmost XFF segment", () => {
  assert.equal(
    trustedClientIp(new Headers({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.2.3.4" })),
    "10.0.0.1",
  );
  /* The left segment is client-forgeable: take the rightmost (appended
     by our trusted proxy) — forgery has no effect. */
  assert.equal(
    trustedClientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 10.0.0.2" })),
    "10.0.0.2",
  );
  assert.equal(trustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
});

test("trustedClientIp returns null when no trusted header exists", () => {
  assert.equal(trustedClientIp(new Headers()), null);
  assert.equal(trustedClientIp(new Headers({ "x-forwarded-for": " " })), null);
});
