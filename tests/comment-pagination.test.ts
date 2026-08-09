import assert from "node:assert/strict";
import test from "node:test";
import { flattenCommentPage } from "../src/lib/comment-tree";
import {
  COMMENT_PAGE_SIZE,
  commentCountQuery,
  commentPageQuery,
} from "../src/lib/posts";

test("page size is 50 top-level comments per page", () => {
  assert.equal(COMMENT_PAGE_SIZE, 50);
});

test("page query keeps AI comments when showAi=true", () => {
  const { sql, args } = commentPageQuery(42, { showAi: true, after: 0 });
  assert.equal(sql.includes("is_ai = 0"), false);
  assert.deepEqual(args, [42, 0]);
});

test("page query filters AI on both the anchor parent join and the visible set", () => {
  const { sql } = commentPageQuery(42, { showAi: false, after: 0 });
  /* 父 Join、锚点自身、递归部分三处都要滤,缺一处就会把 AI 回复或其子树漏进来 */
  assert.equal(sql.match(/AND p\.is_ai = 0/g)?.length, 1);
  assert.equal(sql.match(/AND c\.is_ai = 0/g)?.length, 2);
});

test("page query pages visible roots by id cursor and over-fetches one root", () => {
  const { sql, args } = commentPageQuery(7, { showAi: true, after: 123 });
  assert.match(sql, /id > \?/);
  assert.match(sql, new RegExp(`LIMIT ${COMMENT_PAGE_SIZE + 1}`));
  assert.deepEqual(args, [7, 123]);
});

test("page query resolves the visible root recursively so replies ride with their root", () => {
  const { sql } = commentPageQuery(7, { showAi: true, after: 0 });
  assert.match(sql, /WITH RECURSIVE tree AS/);
  /* 父被软删/过滤时回复自身升级为顶层(与旧全量拍平的兜底一致) */
  assert.match(sql, /c\.parent_id IS NULL OR p\.id IS NULL/);
});

test("count query shares the page query's visibility rules", () => {
  const shown = commentCountQuery(42, { showAi: true });
  assert.equal(shown.sql.includes("is_ai"), false);
  assert.match(shown.sql, /deleted_at IS NULL/);
  assert.deepEqual(shown.args, [42]);
  const hidden = commentCountQuery(42, { showAi: false });
  assert.match(hidden.sql, /AND is_ai = 0/);
  assert.match(hidden.sql, /deleted_at IS NULL/);
});

test("flatten groups replies of any depth under their root with direct-parent markers", () => {
  const rows = [
    { id: 1, parentId: null, rootId: 1 },
    { id: 2, parentId: 1, rootId: 1 },
    { id: 3, parentId: 2, rootId: 1 },
    { id: 4, parentId: null, rootId: 4 },
    { id: 5, parentId: 4, rootId: 4 },
  ];
  const threads = flattenCommentPage(rows);
  assert.equal(threads.length, 2);
  assert.deepEqual(
    threads.map((t) => t.comment.id),
    [1, 4],
  );
  assert.deepEqual(
    threads[0].replies.map((r) => [r.comment.id, r.replyToId]),
    [
      [2, 1],
      [3, 2],
    ],
  );
  assert.deepEqual(
    threads[1].replies.map((r) => [r.comment.id, r.replyToId]),
    [[5, 4]],
  );
});

test("flatten keeps input order of roots and replies", () => {
  const rows = [
    { id: 10, parentId: null, rootId: 10 },
    { id: 20, parentId: null, rootId: 20 },
    { id: 15, parentId: 10, rootId: 10 },
    { id: 25, parentId: 20, rootId: 20 },
    { id: 12, parentId: 10, rootId: 10 },
  ];
  const threads = flattenCommentPage(rows);
  assert.deepEqual(
    threads.map((t) => [t.comment.id, t.replies.map((r) => r.comment.id)]),
    [
      [10, [15, 12]],
      [20, [25]],
    ],
  );
});

test("flatten falls back to top-level when the root is missing from the page", () => {
  const rows = [{ id: 9, parentId: 8, rootId: 7 }];
  const threads = flattenCommentPage(rows);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].comment.id, 9);
  assert.equal(threads[0].replies.length, 0);
});
