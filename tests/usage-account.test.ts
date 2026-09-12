import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicUsageAccount, getUsageAccountIdentity } from "../src/lib/usage/account";
import { isUsageSourceId } from "../src/lib/usage-contract";
import { usageSourceLabel } from "../src/lib/usage/labels";

test("device account lookup selects only the authenticated user's display identity", async () => {
  let captured: unknown[] = [];
  const db = { query: async (sql: string, values: unknown[]) => {
    captured = [sql, values];
    return [[{ handle: "builder", name: "Builder", email: "private@example.com", password_hash: "secret" }], []];
  } } as unknown as Parameters<typeof getUsageAccountIdentity>[1];
  const result = await getUsageAccountIdentity(42, db);
  assert.deepEqual(captured, ["SELECT handle, name FROM users WHERE id = ? LIMIT 1", [42]]);
  assert.deepEqual(result, { handle: "builder", name: "Builder" });
  assert.equal(publicUsageAccount(undefined), null);
  assert.equal(publicUsageAccount({ handle: "" }), null);
  assert.deepEqual(publicUsageAccount({ handle: "builder\n", name: null }), { handle: "builder", name: null });
});

test("device identity route requires the settings scope and returns no-store JSON", () => {
  const route = readFileSync(new URL("../app/api/usage/device/current/route.ts", import.meta.url), "utf8");
  assert.match(route, /authenticateUsageRequest\(request, "settings"\)/);
  assert.match(route, /if \(!principal\) return usageUnauthorized\(\)/);
  assert.match(route, /getUsageAccountIdentity\(principal.userId\)/);
  assert.match(route, /return noStoreJson\(\{ account, deviceId:/);
});

test("new Beta usage sources are accepted with distinct labels without billing-tier aliases", () => {
  for (const id of ["qoder", "qoder-cn", "dsh"]) assert.equal(isUsageSourceId(id), true);
  assert.equal(isUsageSourceId("qoder-auto"), false);
  assert.deepEqual(["qoder", "qoder-cn", "dsh"].map(usageSourceLabel), ["Qoder", "Qoder CN", "DeepSeek Harness"]);
});
