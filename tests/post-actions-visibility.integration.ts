/* 社区 Action 数据层门禁集成测试。只在隔离库运行，覆盖私密、屏蔽、软删、
   不存在目标的评论/反应/订阅/投票拒绝与零写入；loadMore Action 使用的同一
   getVisiblePostAccess 门禁也逐目标断言拒绝。 */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import {
  createComment,
  createCommentForVisiblePost,
  createPost,
  getVisiblePostAccess,
  setCommentReactionForViewer,
  setPostReactionForViewer,
  toggleSubscribeForViewer,
  votePollForViewer,
} from "../src/lib/posts";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run post action visibility outside an isolated kbu-mysql database");
}

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const userIds: number[] = [];
  const postIds: number[] = [];
  const insertUser = async (suffix: string, role = "member"): Promise<number> => {
    const [res] = await pool.query(
      "INSERT INTO users (handle, name, role) VALUES (?, ?, ?)",
      [`act_${suffix}_${stamp}`, `Action ${suffix}`, role],
    );
    const id = Number((res as { insertId: number }).insertId);
    userIds.push(id);
    return id;
  };
  const makePoll = async (owner: number, visibility: "public" | "private") => {
    const id = await createPost({
      userId: owner,
      type: "poll",
      category: "chat",
      title: `gate-${stamp}`,
      bodyMd: "body",
      linkUrl: "",
      lang: "en",
      aiReply: false,
      visibility,
      options: ["A", "B"],
    });
    postIds.push(id);
    const [options] = await pool.query("SELECT id FROM poll_options WHERE post_id = ? ORDER BY id", [id]);
    return { id, optionId: Number((options as { id: number }[])[0].id) };
  };

  try {
    const authorId = await insertUser("author");
    const strangerId = await insertUser("stranger");
    const modId = await insertUser("mod", "mod");
    const stranger = { id: strangerId, role: "member" };

    const privatePost = await makePoll(authorId, "private");
    const privateComment = await createComment(privatePost.id, authorId, "private seed");

    const hiddenPost = await makePoll(authorId, "public");
    const hiddenComment = await createComment(hiddenPost.id, authorId, "hidden seed");
    await pool.query("UPDATE posts SET hidden_at = NOW(), hidden_reason = 'test' WHERE id = ?", [hiddenPost.id]);

    const deletedPost = await makePoll(authorId, "public");
    const deletedComment = await createComment(deletedPost.id, authorId, "deleted seed");
    await pool.query("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [deletedPost.id]);

    const missingPostId = Math.max(...postIds) + 1_000_000;
    const missingCommentId = Math.max(privateComment, hiddenComment, deletedComment) + 1_000_000;

    const denied = [
      ["private", privatePost.id, privateComment, privatePost.optionId],
      ["hidden", hiddenPost.id, hiddenComment, hiddenPost.optionId],
      ["deleted", deletedPost.id, deletedComment, deletedPost.optionId],
      ["missing", missingPostId, missingCommentId, missingPostId],
    ] as const;

    for (const [label, postId, commentId, optionId] of denied) {
      /* loadMoreCommentsAction 的门禁入口。 */
      assert.equal(await getVisiblePostAccess(postId, stranger), null, `${label}: loadMore gate`);
      assert.equal(
        await createCommentForVisiblePost(stranger, postId, `DENIED-${label}-${stamp}`),
        null,
        `${label}: comment`,
      );
      assert.equal(await setPostReactionForViewer(stranger, postId, "up"), false, `${label}: post reaction`);
      assert.equal(
        await setCommentReactionForViewer(stranger, commentId, "up"),
        false,
        `${label}: comment reaction`,
      );
      assert.equal(await toggleSubscribeForViewer(stranger, postId), false, `${label}: subscribe`);
      assert.equal(
        await votePollForViewer(stranger, postId, optionId),
        "not_visible",
        `${label}: poll vote`,
      );
    }

    const [deniedComments] = await pool.query(
      "SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND body_md LIKE ?",
      [strangerId, `DENIED-%-${stamp}`],
    );
    assert.equal(Number((deniedComments as { n: number }[])[0].n), 0);
    const [reactionRows] = await pool.query("SELECT COUNT(*) AS n FROM reactions WHERE user_id = ?", [strangerId]);
    assert.equal(Number((reactionRows as { n: number }[])[0].n), 0);
    const [subscriptionRows] = await pool.query(
      "SELECT COUNT(*) AS n FROM post_subscriptions WHERE user_id = ?",
      [strangerId],
    );
    assert.equal(Number((subscriptionRows as { n: number }[])[0].n), 0);
    const [voteRows] = await pool.query("SELECT COUNT(*) AS n FROM poll_votes WHERE user_id = ?", [strangerId]);
    assert.equal(Number((voteRows as { n: number }[])[0].n), 0);

    /* 正常放行不被误伤:作者可操作自己的私密帖，管理角色可操作屏蔽帖。 */
    const author = { id: authorId, role: "member" };
    assert.ok(await createCommentForVisiblePost(author, privatePost.id, "author private reply"));
    assert.equal(await setPostReactionForViewer(author, privatePost.id, "up"), true);
    assert.equal(await votePollForViewer(author, privatePost.id, privatePost.optionId), "ok");
    const mod = { id: modId, role: "mod" };
    assert.ok(await getVisiblePostAccess(hiddenPost.id, mod));
    assert.equal(await setCommentReactionForViewer(mod, hiddenComment, "up"), true);

    console.log("post action visibility integration: passed");
  } finally {
    for (const id of postIds) await pool.query("DELETE FROM posts WHERE id = ?", [id]);
    if (userIds.length) {
      /* reactions 的 target 是多态键、不会随帖子/评论 FK 级联；先按 user 清掉。 */
      await pool.query("DELETE FROM reactions WHERE user_id IN (?)", [userIds]);
      await pool.query("DELETE FROM users WHERE id IN (?)", [userIds]);
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
