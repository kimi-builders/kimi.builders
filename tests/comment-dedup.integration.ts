/* 评论服务端幂等(去重)集成测试。只在隔离库运行:
   同人同帖同文 60 秒内的重复提交不产生第二行,返回已有 id 且 duplicate=1;
   不同文案不受影响。防的是绕过客户端 posting 防抖的网络重试/刷新重提。 */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import { createCommentForVisiblePost, createPost } from "../src/lib/posts";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run comment dedup test outside an isolated kbu-mysql database");
}

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const [userRes] = await pool.query(
    "INSERT INTO users (handle, name, role) VALUES (?, ?, 'member')",
    [`dedup_${stamp}`, "Dedup QA"],
  );
  const userId = Number((userRes as { insertId: number }).insertId);
  const viewer = { id: userId, role: "member" };
  const postId = await createPost({
    userId,
    type: "text",
    category: "chat",
    title: `dedup-${stamp}`,
    bodyMd: "post body",
    linkUrl: "",
    lang: "zh",
    aiReply: false,
    visibility: "public",
    options: [],
  });

  try {
    const first = await createCommentForVisiblePost(viewer, postId, "同一段评论");
    assert.ok(first && !first.duplicate, "首次提交应正常创建");
    const second = await createCommentForVisiblePost(viewer, postId, "同一段评论");
    assert.ok(second?.duplicate, "重复提交应标记 duplicate");
    assert.equal(second?.id, first?.id, "重复提交返回已有评论 id");

    const third = await createCommentForVisiblePost(viewer, postId, "不同的评论");
    assert.ok(third && !third.duplicate, "不同文案应正常创建");

    const [rows] = await pool.query(
      "SELECT COUNT(*) AS c FROM comments WHERE post_id = ? AND deleted_at IS NULL",
      [postId],
    );
    assert.equal(Number((rows as { c: number }[])[0].c), 2, "同文重复不产生新行");

    const [post] = await pool.query("SELECT comment_count FROM posts WHERE id = ?", [postId]);
    assert.equal(
      Number((post as { comment_count: number }[])[0].comment_count),
      2,
      "冗余计数与真实行数一致",
    );
    console.log("comment-dedup: passed");
  } finally {
    await pool.query("DELETE FROM comments WHERE post_id = ?", [postId]);
    await pool.query("DELETE FROM post_subscriptions WHERE post_id = ?", [postId]);
    await pool.query("DELETE FROM posts WHERE id = ?", [postId]);
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    await pool.end();
  }
}

void main();
