import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../db/migrations/20260922_comment_retry_duplicate_cleanup.sql", import.meta.url),
  "utf8",
);

test("historical comment retry cleanup is narrowly scoped", () => {
  assert.match(migration, /later\.parent_id <=> earlier\.parent_id/);
  assert.match(migration, /later\.user_id = earlier\.user_id/);
  assert.match(migration, /BINARY later\.body_md = BINARY earlier\.body_md/);
  assert.match(migration, /TIMESTAMPDIFF\(SECOND, earlier\.created_at, later\.created_at\) BETWEEN 0 AND 5/);
  assert.match(migration, /later\.is_ai = 0/);
  assert.match(migration, /later\.edited_at IS NULL/);
  assert.match(migration, /later\.hidden_at IS NULL/);
});

test("cleanup preserves the surviving thread and dependent references", () => {
  assert.match(migration, /DELETE duplicate_reaction/);
  assert.match(migration, /SET reaction\.target_id = cleanup\.canonical_id/);
  assert.match(migration, /SET notification\.comment_id = cleanup\.canonical_id/);
  assert.match(migration, /SET job\.comment_id = cleanup\.canonical_id/);
  assert.match(migration, /SET child\.parent_id = cleanup\.canonical_id/);
  assert.match(migration, /SET duplicate_comment\.deleted_at = COALESCE/);
  assert.match(migration, /SET canonical_comment\.score = totals\.score/);
  assert.match(migration, /SET post\.comment_count =/);
});
