import assert from "node:assert/strict";
import test from "node:test";
import { changeFilterQuery, mergeFilterQuery } from "../src/lib/filter-query";

test("successive lens edits preserve search, mode and other dimensions", () => {
  const base = mergeFilterQuery("q=Kimi&type=paths&chapter=build", { product: ["kimi-code"], role: [], tag: [], year: [] });
  const role = changeFilterQuery(base, { role: "software" });
  const tag = changeFilterQuery(role, { tag: "实践" });
  const params = new URLSearchParams(tag);
  assert.equal(params.get("product"), "kimi-code");
  assert.equal(params.get("role"), "software");
  assert.equal(params.get("q"), "Kimi");
  assert.equal(params.get("type"), "paths");
  assert.equal(params.get("chapter"), "build");
  assert.equal(params.get("tag"), "实践");
  assert.equal(new URLSearchParams(changeFilterQuery(tag, { product: null })).get("role"), "software");
});

test("works and awesome merge all selections and clear only filter keys", () => {
  const query = mergeFilterQuery("sort=popular", { agent: ["kimi", "claude"], kind: ["tool"], scope: ["global"] });
  assert.equal(new URLSearchParams(changeFilterQuery(query, { kind: "app" })).get("agent"), "kimi,claude");
  assert.equal(changeFilterQuery(query, { agent: null, kind: null, scope: null }), "sort=popular");
  assert.equal(mergeFilterQuery("role=obsolete&q=a%26b", { role: [] }), "q=a%26b");
});
