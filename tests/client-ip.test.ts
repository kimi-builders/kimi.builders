import assert from "node:assert/strict";
import test from "node:test";
import { trustedClientIp } from "../src/lib/client-ip";

/* P1-1(20260822):限流/访客身份的 IP 提取可信序——cf-connecting-ip >
   x-real-ip > XFF 最右段 > null。XFF 首段(客户端自带)必须被忽略。 */
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
  /* 左段是客户端可伪造值:取最右(可信代理追加),伪造不生效 */
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
