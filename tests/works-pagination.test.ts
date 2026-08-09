import assert from "node:assert/strict";
import test from "node:test";
import {
  AWESOME_PAGE_SIZE,
  WORKS_PAGE_SIZE,
  worksPageQuery,
} from "../src/lib/works";

test("page sizes keep the previous fixed limits, over-fetching one", () => {
  assert.equal(WORKS_PAGE_SIZE, 100);
  assert.equal(AWESOME_PAGE_SIZE, 200);
  assert.match(
    worksPageQuery({ source: "site" }).sql,
    new RegExp(`LIMIT ${WORKS_PAGE_SIZE + 1}`),
  );
  assert.match(
    worksPageQuery({ source: "all" }).sql,
    new RegExp(`LIMIT ${AWESOME_PAGE_SIZE + 1}`),
  );
});

test("works wall only lists member works, ordered by id (monotonic with created_at)", () => {
  const { sql, args } = worksPageQuery({ source: "site" });
  assert.match(sql, /WHERE w\.source = 'site'/);
  assert.match(sql, /ORDER BY w\.id DESC/);
  assert.deepEqual(args, []);
});

test("id cursor appends a keyset predicate after the existing filters", () => {
  const { sql, args } = worksPageQuery({ source: "site", after: 321 });
  assert.match(sql, /w\.source = 'site' AND w\.id < \?/);
  assert.deepEqual(args, [321]);
});

test("awesome keeps the agent JSON filter and can combine it with the cursor", () => {
  const withAgent = worksPageQuery({ source: "all", agent: "kimi-cli" });
  assert.match(withAgent.sql, /JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\)/);
  assert.deepEqual(withAgent.args, ["kimi-cli"]);
  const both = worksPageQuery({ source: "all", agent: "kimi-cli", after: 7 });
  assert.match(both.sql, /JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\) AND w\.id < \?/);
  assert.deepEqual(both.args, ["kimi-cli", 7]);
  /* awesome 无筛选时没有 WHERE 子句(全来源) */
  assert.equal(worksPageQuery({ source: "all" }).sql.includes("WHERE"), false);
});

test("invalid cursors are ignored (treated as page 1)", () => {
  for (const after of [0, -5, Number.NaN, 1.5]) {
    const { sql, args } = worksPageQuery({ source: "site", after });
    assert.equal(sql.includes("w.id < ?"), false);
    assert.deepEqual(args, []);
  }
});
