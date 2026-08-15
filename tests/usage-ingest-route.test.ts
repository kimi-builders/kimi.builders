/* /api/usage/ingest 路由级测试:设备鉴权先于一切、校验先于写库、
   排行榜缓存只在「公开且有增量」时作废。同 upload-route.test.ts 的源码断言约定。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(
  new URL("../app/api/usage/ingest/route.ts", import.meta.url),
  "utf8",
);

function assertOrder(a: string, b: string, label: string) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  assert.ok(ia >= 0, `缺少 ${a}`);
  assert.ok(ib >= 0, `缺少 ${b}`);
  assert.ok(ia < ib, `${label}:${a} 必须先于 ${b}`);
}

test("ingest POST: 设备鉴权先于请求体解析与写库", () => {
  assertOrder("authenticateUsageRequest(", "readUsageJson(", "鉴权先于解析");
  /* validateUsageIngest(await readUsageJson(...)) 是嵌套调用,文本序与执行序相反,
     只对执行序有意义的「解析先于写库」「校验先于写库」做文本断言 */
  assertOrder("readUsageJson(", "ingestUsage(", "解析先于写库");
  assertOrder("validateUsageIngest(", "ingestUsage(", "校验先于写库");
  assert.ok(src.includes('authenticateUsageRequest(request, "ingest")'));
});

test("ingest POST: 未授权一律 401 口径(usageUnauthorized)", () => {
  assert.match(src, /if \(!principal\) return usageUnauthorized\(\)/);
});

test("ingest POST: 排行榜缓存只在公开且有增量时作废", () => {
  assert.match(src, /settings\.showOnLeaderboard && ingested\.buckets > 0/);
  assertOrder("showOnLeaderboard", "revalidateTag(", "公开判断先于缓存作废");
});

test("ingest DELETE: 用 delete  scope 鉴权后再删当前设备数据", () => {
  assert.ok(src.includes('authenticateUsageRequest(request, "delete")'));
  assertOrder('authenticateUsageRequest(request, "delete")', "deleteUsageForDevice(", "鉴权先于删除");
});

test("ingest: 两个方法都套统一错误出口(usageErrorResponse)", () => {
  assert.equal((src.match(/usageErrorResponse\(error\)/g) ?? []).length, 2);
});
