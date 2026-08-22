/* cron 路由鉴权(20260822 P2-4)纯函数测试:恒时比较 + 未配置统一 401 语义。 */
import assert from "node:assert/strict";
import test from "node:test";
import { cronAuthorized } from "../src/lib/cron-auth";

function req(auth?: string): Request {
  return new Request("https://kimi.builders/api/cron/usage-retention", {
    headers: auth === undefined ? {} : { authorization: auth },
  });
}

test("未配置 CRON_SECRET:一律拒绝(与凭据错误同观感,不可探测配置状态)", () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(cronAuthorized(req()), false);
  assert.equal(cronAuthorized(req("Bearer anything")), false);
  if (prev !== undefined) process.env.CRON_SECRET = prev;
});

test("凭据匹配才放行;前缀/错字/缺头都不行", () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "unit-test-cron-secret";
  try {
    assert.equal(cronAuthorized(req("Bearer unit-test-cron-secret")), true);
    assert.equal(cronAuthorized(req("Bearer unit-test-cron-secre")), false); /* 前缀 */
    assert.equal(cronAuthorized(req("Bearer unit-test-cron-secretX")), false); /* 尾差 */
    assert.equal(cronAuthorized(req("bearer unit-test-cron-secret")), false); /* scheme */
    assert.equal(cronAuthorized(req()), false); /* 缺头 */
    assert.equal(cronAuthorized(req("Basic unit-test-cron-secret")), false);
  } finally {
    if (prev !== undefined) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  }
});
