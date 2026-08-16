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

/* ---- @kimi 召唤(20260816 PR2):60s 去重 / AI 评论可见性 / 治理删除 ---- */

test("comment duplicate query: same author+work+body within 60s (idempotent retry)", () => {
  const { sql, args } = workCommentDuplicateQuery(9, 4, "hello @kimi");
  /* 对齐社区 createCommentForVisiblePost 的 60s 同人同文窗口(UTC_TIMESTAMP(3)) */
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
  /* AI 评论 user_id NULL:作者联表必须是 LEFT JOIN */
  assert.match(sql, /LEFT JOIN users u ON u\.id = c\.user_id/);
});

test("comment page + count share the AI filter when the viewer hides AI replies", () => {
  const page = workCommentPageQuery(7, 0, { showAi: false });
  const count = workCommentCountQuery(7, { showAi: false });
  assert.match(page.sql, /AND c\.is_ai = 0/);
  assert.match(count.sql, /AND is_ai = 0/);
  /* 默认(未传 / showAi:true)不带过滤,向后兼容旧调用 */
  assert.doesNotMatch(workCommentPageQuery(7, 0).sql, /is_ai = 0/);
  assert.doesNotMatch(workCommentCountQuery(7).sql, /is_ai = 0/);
  assert.deepEqual(page.args, [7, 0]);
  assert.deepEqual(count.args, [7]);
});

test("comment insert stays human-only; AI rows are written by the job runner", () => {
  const { sql } = workCommentInsertQuery(9, 4, "x");
  /* 人类评论不落 is_ai(列默认 0);AI 插入(is_ai=1, user_id NULL)在 ai-reply.ts */
  assert.equal(sql.includes("is_ai"), false);
});

test("comment delete with moderator flag drops the ownership predicate", () => {
  const mod = workCommentDeleteQuery(55, 4, { moderator: true });
  assert.doesNotMatch(mod.sql, /c\.user_id = \? OR w\.user_id = \?/);
  assert.deepEqual(mod.args, [55]);
  /* 计数维护与软删语义不变 */
  assert.match(mod.sql, /c\.deleted_at = NOW\(\)/);
  assert.match(
    mod.sql,
    /w\.comment_count = GREATEST\(0, CAST\(w\.comment_count AS SIGNED\) - 1\)/,
  );
  /* 默认不变:归属校验仍在 */
  const plain = workCommentDeleteQuery(55, 4);
  assert.match(plain.sql, /\(c\.user_id = \? OR w\.user_id = \?\)/);
  assert.deepEqual(plain.args, [55, 4, 4]);
});
