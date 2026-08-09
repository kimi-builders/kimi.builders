import assert from "node:assert/strict";
import test from "node:test";
import {
  WORK_COMMENT_PAGE_SIZE,
  workCommentCountQuery,
  workCommentDeleteQuery,
  workCommentInsertQuery,
  workCommentPageQuery,
  workVoteBranch,
  workVoteCountQuery,
  workVoteDeleteQuery,
  workVoteInsertQuery,
} from "../src/lib/works";

/* P1-2 作品互动:支持 toggle(顶只有,再点取消)+ 单层评论(软删)。
   无 DB 环境,测 SQL 构建与纯决策函数(同 comment-pagination / community-rate-limit)。 */

test("comment page size is 50 per page", () => {
  assert.equal(WORK_COMMENT_PAGE_SIZE, 50);
});

test("comment page query pages visible comments by id cursor, ascending, over-fetching one", () => {
  const { sql, args } = workCommentPageQuery(7, 123);
  assert.match(sql, /c\.work_id = \?/);
  assert.match(sql, /c\.deleted_at IS NULL/);
  /* id 游标:比上一页最后一条大,正序翻页(对话从下往上长) */
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
  /* INSERT IGNORE 的 affectedRows:1 = 新行(之前没支持过);0 = 主键已存在(这次是取消) */
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
  /* UNSIGNED 直接 -1 会回绕成巨值(同 posts hotExpr 的坑):先 CAST 再 GREATEST 兜底 */
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
  /* 软删,不物理删 */
  assert.match(sql, /SET c\.deleted_at = NOW\(\)/);
  assert.equal(sql.includes("DELETE FROM"), false);
  /* 权限钉在 WHERE:评论作者本人(c.user_id)或作品作者(w.user_id) */
  assert.match(sql, /JOIN works w ON w\.id = c\.work_id/);
  assert.match(sql, /\(c\.user_id = \? OR w\.user_id = \?\)/);
  /* 只删可见评论:重复删除 affectedRows=0,计数不会被重复扣减(幂等) */
  assert.match(sql, /c\.deleted_at IS NULL/);
  assert.deepEqual(args, [55, 4, 4]);
});

test("comment delete maintains the denormalized count in the same statement", () => {
  const { sql } = workCommentDeleteQuery(55, 4);
  /* 多表 UPDATE 一条语句软删 + 计数 -1;减侧同样 CAST SIGNED + GREATEST 兜底 */
  assert.match(
    sql,
    /w\.comment_count = GREATEST\(0, CAST\(w\.comment_count AS SIGNED\) - 1\)/,
  );
});
