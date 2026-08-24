import assert from "node:assert/strict";
import test from "node:test";
import { AGENTS } from "../src/lib/agents";
import { WORK_KINDS } from "../src/lib/work-kinds";
import {
  AWESOME_PAGE_SIZE,
  WORKS_PAGE_SIZE,
  awesomeScopeOf,
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
    worksPageQuery({ source: "awesome" }).sql,
    new RegExp(`LIMIT ${AWESOME_PAGE_SIZE + 1}`),
  );
});

test("works wall only lists member works, ordered by id (monotonic with created_at)", () => {
  const { sql, args } = worksPageQuery({ source: "site" });
  assert.match(sql, /WHERE w\.visibility = 'public' AND w\.hidden_at IS NULL AND w\.source = 'site'/);
  assert.match(sql, /ORDER BY w\.id DESC/);
  assert.deepEqual(args, []);
});

test("id cursor appends a keyset predicate after the existing filters", () => {
  const { sql, args } = worksPageQuery({ source: "site", after: "321" });
  assert.match(sql, /w\.source = 'site' AND w\.id < \?/);
  assert.deepEqual(args, [321]);
});

test("awesome keeps the agent JSON filter and can combine it with the cursor", () => {
  const withAgent = worksPageQuery({ source: "awesome", agents: ["kimi-cli"] });
  assert.match(withAgent.sql, /JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\)/);
  assert.deepEqual(withAgent.args, ["kimi-cli"]);
  const both = worksPageQuery({ source: "awesome", agents: ["kimi-cli"], after: "7" });
  /* A single agent also gets the OR-chain wrap (parenthesized). */
  assert.match(both.sql, /\(JSON_CONTAINS\(w\.agents, JSON_QUOTE\(\?\)\)\) AND w\.id < \?/);
  assert.deepEqual(both.args, ["kimi-cli", 7]);
  /* Unfiltered awesome keeps only the visibility predicate (public
     entries; a signed-in viewer additionally gets their own private
     ones). */
  assert.equal(
    worksPageQuery({ source: "awesome" }).sql.includes("WHERE w.visibility = 'public'"),
    true,
  );
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

test("multi-select filters dedupe and keep placeholders equal to bound args (P0-1)", () => {
  /* P0-1 regression: placeholders were once generated from the full
     array while params bound a truncated constant — duplicate/over-cap
     ids triggered a bind-count mismatch (MySQL 1064) and a whole-page
     500 on /works. Fixed: placeholders and params share one array. */
  const placeholders = (q: { sql: string }) => (q.sql.match(/\?/g) ?? []).length;

  /* Duplicate ids: the minimal repro is ?agent=kimi x11 on a signed-in
     URL. */
  const dup = worksPageQuery({
    source: "site",
    viewerId: 1,
    agents: Array.from({ length: 11 }, () => "kimi"),
    kinds: Array.from({ length: 13 }, () => "app"),
  });
  assert.equal(placeholders(dup), dup.args.length);
  assert.deepEqual(dup.args, [1, 1, "kimi", "app"]);

  /* Full registry + stacked duplicates: deduped to exactly the registry
     size, all entering the SQL. */
  const allAgents = AGENTS.map((a) => a.id);
  const overflow = worksPageQuery({
    source: "site",
    agents: [...allAgents, ...allAgents, "kimi"],
    kinds: [...WORK_KINDS.map((k) => k.id), "app"],
  });
  assert.equal(placeholders(overflow), overflow.args.length);
  assert.deepEqual(overflow.args, [...allAgents, ...WORK_KINDS.map((k) => k.id)]);
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
  /* Hot and new cursors never cross. */
  assert.equal(decodeWorksCursor("321", "hot"), null);
  assert.equal(decodeWorksCursor("12|321", "new") === null, true);
  assert.equal(decodeWorksCursor("12|321", "hot")?.id, 321);
  assert.equal(encodeWorksCursor({ id: 321, votes: 12 }), "12|321");
  assert.equal(encodeWorksCursor({ id: 321 }), "321");
});

test("awesome scope filter narrows by inclusion scope", () => {
  const { sql, args } = worksPageQuery({ source: "awesome", scope: "eco" });
  assert.match(sql, /w\.scope = \?/);
  assert.deepEqual(args, ["eco"]);

  const participation = worksPageQuery({ source: "awesome", scope: "part" });
  assert.match(
    participation.sql,
    /w\.scope = \? OR \(w\.source = 'site' AND w\.also_awesome = 1\).*w\.source = 'awesome'/,
  );
  assert.deepEqual(participation.args, ["part"]);
});

test("Awesome scope derives participation for opted-in member work", () => {
  assert.equal(
    awesomeScopeOf({ source: "site", scope: "", alsoAwesome: true }),
    "part",
  );
  assert.equal(
    awesomeScopeOf({ source: "site", scope: "", alsoAwesome: false }),
    null,
  );
  assert.equal(
    awesomeScopeOf({ source: "awesome", scope: "eco", alsoAwesome: true }),
    "eco",
  );
  assert.equal(
    awesomeScopeOf({ source: "awesome", scope: "", alsoAwesome: true }),
    "part",
  );
});
