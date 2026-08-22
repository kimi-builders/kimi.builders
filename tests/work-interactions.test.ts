import assert from "node:assert/strict";
import test from "node:test";
import {
  WORK_COMMENT_PAGE_SIZE,
  workCommentCountQuery,
  workCommentDeleteQuery,
  workCommentDuplicateQuery,
  workCommentInsertQuery,
  workCommentPageQuery,
  workVoteBranch,
  workVoteCountQuery,
  workVoteDeleteQuery,
  workVoteInsertQuery,
} from "../src/lib/works";

/* Work interactions: support toggle (up-only, click again to cancel) +
   single-level comments (soft delete). No DB here — testing SQL
   building and pure decision functions (like comment-pagination /
   community-rate-limit). */

test("comment page size is 50 per page", () => {
  assert.equal(WORK_COMMENT_PAGE_SIZE, 50);
});

test("comment page query pages visible comments by id cursor, ascending, over-fetching one", () => {
  const { sql, args } = workCommentPageQuery(7, 123);
  assert.match(sql, /c\.work_id = \?/);
  assert.match(sql, /c\.deleted_at IS NULL/);
  /* id cursor: greater than the last row of the previous page,
     ascending (threads grow bottom-up). */
  assert.match(sql, /c\.id > \?/);
  assert.match(sql, /ORDER BY c\.id ASC/);
  assert.match(sql, new RegExp(`LIMIT ${WORK_COMMENT_PAGE_SIZE + 1}`));
  assert.deepEqual(args, [7, 123]);
});

test("comment count query shares the page query's visibility rules", () => {
  const { sql, args } = workCommentCountQuery(7);
  assert.match(sql, /work_id = \?/);
  assert.match(sql, /deleted_at IS NULL/);
  assert.deepEqual(args, [7]);
});

test("vote insert uses INSERT IGNORE on the composite key (concurrent/double-click idempotent)", () => {
  const { sql, args } = workVoteInsertQuery(9, 4);
  assert.match(sql, /INSERT IGNORE INTO work_votes/);
  assert.match(sql, /\(work_id, user_id\)/);
  assert.deepEqual(args, [9, 4]);
});

test("vote branch: first insert = support, duplicate insert = cancel (toggle)", () => {
  /* INSERT IGNORE affectedRows: 1 = a new row (never supported
     before); 0 = the PK already existed (this call cancels). */
  assert.equal(workVoteBranch(1), "support");
  assert.equal(workVoteBranch(0), "cancel");
  assert.equal(workVoteBranch(2), "support");
});

test("vote delete is scoped by both work_id and user_id", () => {
  const { sql, args } = workVoteDeleteQuery(9, 4);
  assert.match(sql, /DELETE FROM work_votes WHERE work_id = \? AND user_id = \?/);
  assert.deepEqual(args, [9, 4]);
});

test("vote count: increment is plain +1; decrement casts to SIGNED inside GREATEST", () => {
  const up = workVoteCountQuery(9, 1);
  assert.match(up.sql, /vote_count = vote_count \+ 1/);
  const down = workVoteCountQuery(9, -1);
  /* Subtracting 1 from UNSIGNED wraps to a huge value (the posts
     hotExpr trap): CAST first, then GREATEST as the floor. */
  assert.match(down.sql, /GREATEST\(0, CAST\(vote_count AS SIGNED\) - 1\)/);
  assert.deepEqual(up.args, [9]);
  assert.deepEqual(down.args, [9]);
});

test("comment insert is single-layer (no parent) and slices body at 10000", () => {
  const { sql, args } = workCommentInsertQuery(9, 4, "x".repeat(10001));
  assert.match(sql, /INSERT INTO work_comments \(work_id, user_id, body\)/);
  assert.equal(sql.includes("parent_id"), false);
  assert.deepEqual(args.slice(0, 2), [9, 4]);
  assert.equal((args[2] as string).length, 10000);
});

test("comment delete is a soft delete pinned by author-or-work-author permission", () => {
  const { sql, args } = workCommentDeleteQuery(55, 4);
  /* Soft delete, never physical. */
  assert.match(sql, /SET c\.deleted_at = NOW\(\)/);
  assert.equal(sql.includes("DELETE FROM"), false);
  /* Permissions pinned in WHERE: the comment author (c.user_id) or the
     work author (w.user_id). */
  assert.match(sql, /JOIN works w ON w\.id = c\.work_id/);
  assert.match(sql, /\(c\.user_id = \? OR w\.user_id = \?\)/);
  /* Deletes only visible comments: a repeat delete yields affectedRows=0
     and the counter is never decremented twice (idempotent). */
  assert.match(sql, /c\.deleted_at IS NULL/);
  assert.deepEqual(args, [55, 4, 4]);
});

test("comment delete maintains the denormalized count in the same statement", () => {
  const { sql } = workCommentDeleteQuery(55, 4);
  /* One multi-table UPDATE soft-deletes + decrements; the minus side
     gets the same CAST SIGNED + GREATEST floor. */
  assert.match(
    sql,
    /w\.comment_count = GREATEST\(0, CAST\(w\.comment_count AS SIGNED\) - 1\)/,
  );
});

/* ---- @kimi summons: 60s dedup / AI-comment visibility / moderation
   deletes ---- */

test("comment duplicate query: same author+work+body within 60s (idempotent retry)", () => {
  const { sql, args } = workCommentDuplicateQuery(9, 4, "hello @kimi");
  /* Aligned with createCommentForVisiblePost's 60s same-user-same-text
     window (UTC_TIMESTAMP(3)). */
  assert.match(sql, /SELECT id FROM work_comments/);
  assert.match(sql, /work_id = \? AND user_id = \? AND body = \?/);
  assert.match(sql, /deleted_at IS NULL/);
  assert.match(sql, /TIMESTAMPADD\(SECOND, -60, UTC_TIMESTAMP\(3\)\)/);
  assert.match(sql, /LIMIT 1/);
  assert.deepEqual(args, [9, 4, "hello @kimi"]);
});

test("comment page query selects is_ai and tolerates NULL user_id (AI comments)", () => {
  const { sql } = workCommentPageQuery(7, 0);
  assert.match(sql, /c\.is_ai/);
  /* AI comments carry NULL user_id: the author join must be LEFT. */
  assert.match(sql, /LEFT JOIN users u ON u\.id = c\.user_id/);
});

test("comment page + count share the AI filter when the viewer hides AI replies", () => {
  const page = workCommentPageQuery(7, 0, { showAi: false });
  const count = workCommentCountQuery(7, { showAi: false });
  assert.match(page.sql, /AND c\.is_ai = 0/);
  assert.match(count.sql, /AND is_ai = 0/);
  /* Default (absent / showAi:true) carries no filter — backward
     compatible with old callers. */
  assert.doesNotMatch(workCommentPageQuery(7, 0).sql, /is_ai = 0/);
  assert.doesNotMatch(workCommentCountQuery(7).sql, /is_ai = 0/);
  assert.deepEqual(page.args, [7, 0]);
  assert.deepEqual(count.args, [7]);
});

test("comment insert stays human-only; AI rows are written by the job runner", () => {
  const { sql } = workCommentInsertQuery(9, 4, "x");
  /* Human comments never set is_ai (column default 0); AI inserts
     (is_ai=1, user_id NULL) live in ai-reply.ts. */
  assert.equal(sql.includes("is_ai"), false);
});

test("comment delete with moderator flag drops the ownership predicate", () => {
  const mod = workCommentDeleteQuery(55, 4, { moderator: true });
  assert.doesNotMatch(mod.sql, /c\.user_id = \? OR w\.user_id = \?/);
  assert.deepEqual(mod.args, [55]);
  /* Counter maintenance and soft-delete semantics unchanged. */
  assert.match(mod.sql, /c\.deleted_at = NOW\(\)/);
  assert.match(
    mod.sql,
    /w\.comment_count = GREATEST\(0, CAST\(w\.comment_count AS SIGNED\) - 1\)/,
  );
  /* Default unchanged: the ownership check stays. */
  const plain = workCommentDeleteQuery(55, 4);
  assert.match(plain.sql, /\(c\.user_id = \? OR w\.user_id = \?\)/);
  assert.deepEqual(plain.args, [55, 4, 4]);
});
