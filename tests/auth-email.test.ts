/* 邮箱凭证单元测试:scrypt 散列往返、篡改检测、邮箱/密码策略校验。无数据库。 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordPolicyError,
  verifyPassword,
} from "../src/lib/auth/password";

test("password: hash/verify 往返 + 盐随机", async () => {
  const a = await hashPassword("correct horse battery");
  const b = await hashPassword("correct horse battery");
  assert.match(a, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(a, b); // 随机盐
  assert.equal(await verifyPassword("correct horse battery", a), true);
  assert.equal(await verifyPassword("wrong password", a), false);
});

test("password: 篡改/畸形存储串拒绝", async () => {
  const stored = await hashPassword("p@ssw0rd!");
  assert.equal(await verifyPassword("p@ssw0rd!", `${stored}x`), false);
  assert.equal(await verifyPassword("p@ssw0rd!", "scrypt$bogus"), false);
  assert.equal(await verifyPassword("p@ssw0rd!", ""), false);
  // N 过大盘问直接拒绝(防 DoS 参数注入)
  assert.equal(
    await verifyPassword("x", "scrypt$999999999$8$1$c2FsdA$aGFzaA"),
    false,
  );
});

test("email: 归一化与校验", () => {
  assert.equal(normalizeEmail("  Foo@Bar.com "), "foo@bar.com");
  assert.equal(isValidEmail("foo@bar.com"), true);
  assert.equal(isValidEmail("foo@bar"), false);
  assert.equal(isValidEmail("foo bar@baz.com"), false);
  assert.equal(isValidEmail("@x.com"), false);
  assert.equal(isValidEmail("a@b.c"), true);
});

test("password policy: 8–72", () => {
  assert.equal(passwordPolicyError("1234567"), "too_short");
  assert.equal(passwordPolicyError("12345678"), null);
  assert.equal(passwordPolicyError("x".repeat(72)), null);
  assert.equal(passwordPolicyError("x".repeat(73)), "too_long");
});
