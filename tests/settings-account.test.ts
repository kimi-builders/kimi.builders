import assert from "node:assert/strict";
import test from "node:test";
import { canUnlinkProvider } from "../src/lib/auth/users";

/* ---- OAuth 解绑守卫 canUnlinkProvider:不允许拿走最后一个登录方式 ---- */

test("unlink guard: passwordless + single provider is the last method", () => {
  assert.equal(canUnlinkProvider(false, 1), "last_method");
});

test("unlink guard: nothing linked is not_linked, regardless of password", () => {
  assert.equal(canUnlinkProvider(false, 0), "not_linked");
  assert.equal(canUnlinkProvider(true, 0), "not_linked");
});

test("unlink guard: a second method (password or another provider) allows unlink", () => {
  assert.equal(canUnlinkProvider(true, 1), "ok");
  assert.equal(canUnlinkProvider(false, 2), "ok");
  assert.equal(canUnlinkProvider(true, 2), "ok");
});
