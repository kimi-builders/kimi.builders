import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(
  new URL("../db/schema.sql", import.meta.url),
  "utf8",
);

test("latest feed index preserves created_at/id order after the live predicate", () => {
  const migration = readFileSync(
    new URL(
      "../db/migrations/20260901_posts_live_feed_index.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const sql of [migration, schema]) {
    assert.match(
      sql,
      /KEY idx_posts_live_new \(deleted_at, created_at, id\)/,
    );
  }
  assert.doesNotMatch(migration, /ORDER BY id DESC/);
});

test("recursive comment index starts with the parent lookup and visibility predicates", () => {
  const migration = readFileSync(
    new URL(
      "../db/migrations/20260902_comment_parent_index.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const sql of [migration, schema]) {
    assert.match(
      sql,
      /KEY idx_comments_parent_visible\s+\(parent_id, deleted_at, hidden_at, is_ai\)/,
    );
  }
  /* schema.sql also carries the already-deployed governance index. */
  assert.match(schema, /KEY idx_comments_hidden_id \(hidden_at, id\)/);
});
