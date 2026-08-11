import assert from "node:assert/strict";
import test from "node:test";
import {
  AWESOME_PAGE_SIZE,
  WORKS_PAGE_SIZE,
  decodeWorksCursor,
  encodeWorksCursor,
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
  const { sql, args } = worksPageQuery({ source: "site", after: "321" });
  assert.match(sql, /w\.source = 'site' AND w\.id < \?/);
  assert.deepEqual(args, [321]);
});

test("awesome keeps the agent JSON filter and can combine it with the cursor", () => {
  const withAgent = worksPageQuery({ source: "all", agents: ["kimi-cli"] });
  assert.match(withAgent.sql, /JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\)/);
  assert.deepEqual(withAgent.args, ["kimi-cli"]);
  const both = worksPageQuery({ source: "all", agents: ["kimi-cli"], after: "7" });
  /* 单个 agent 也是 OR 链包装(括号形式) */
  assert.match(both.sql, /\(JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\)\) AND w\.id < \?/);
  assert.deepEqual(both.args, ["kimi-cli", 7]);
  /* awesome 无筛选时没有 WHERE 子句(全来源) */
  assert.equal(worksPageQuery({ source: "all" }).sql.includes("WHERE"), false);
});

test("multi-agent filter OR-chains, kind filter uses IN", () => {
  const { sql, args } = worksPageQuery({
    source: "site",
    agents: ["kimi-code", "codex"],
    kinds: ["app", "skill"],
  });
  assert.match(sql, /JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\) OR JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\)/);
  assert.match(sql, /w\.kind IN \(\?,\?\)/);
  assert.deepEqual(args, ["kimi-code", "codex", "app", "skill"]);
});

test("invalid cursors are ignored (treated as page 1)", () => {
  for (const after of ["0", "-5", "abc", "1.5", "1|2|3"]) {
    const { sql, args } = worksPageQuery({ source: "site", after });
    assert.equal(sql.includes("w.id < ?"), false);
    assert.deepEqual(args, []);
  }
});

test("hot sort orders by votes with a composite (votes|id) keyset cursor", () => {
  const { sql, args } = worksPageQuery({ source: "site", sort: "hot", after: "12|321" });
  assert.match(sql, /ORDER BY w\.vote_count DESC, w\.id DESC/);
  assert.match(sql, /w\.vote_count < \? OR \(w\.vote_count = \? AND w\.id < \?\)/);
  assert.deepEqual(args, [12, 12, 321]);
  /* hot 游标与 new 游标不串用 */
  assert.equal(decodeWorksCursor("321", "hot"), null);
  assert.equal(decodeWorksCursor("12|321", "new") === null, true);
  assert.equal(decodeWorksCursor("12|321", "hot")?.id, 321);
  assert.equal(encodeWorksCursor({ id: 321, votes: 12 }), "12|321");
  assert.equal(encodeWorksCursor({ id: 321 }), "321");
});

test("awesome scope filter narrows by inclusion scope", () => {
  const { sql, args } = worksPageQuery({ source: "all", scope: "eco" });
  assert.match(sql, /w\.scope = \?/);
  assert.deepEqual(args, ["eco"]);
});
