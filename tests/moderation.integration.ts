/* Community moderation integration. Runs only against an isolated
   database (DATABASE_URL must contain kbu-mysql). Covers: hide
   (posts/comments/works -> invisible publicly, visible to the author;
   unhide restores; repeats reject idempotently); poster snapshots
   (hidden -> null, route 404s; hidden can't be featured); management
   soft delete (deleted_at + counters); hard delete (admin semantics,
   target must exist, including soft-deleted posts/comments; comment hard
   delete removes the subtree and decrements by live rows; post hard
   delete cascades comments); mutes (effective, auto-expiring, unmute, admin targets
   rejected); profile reset (avatar/name/bio cleared, admin targets
   rejected); roles (setUserRole round trip, admin targets rejected);
   audit (every action writes a moderation_actions row). */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import { sendFeedback } from "../src/lib/feedback";
import { getPostFeatured, setPostFeatured } from "../src/lib/featured";
import {
  adminDeleteComment,
  adminDeletePost,
  getActiveMute,
  getModerationLog,
  hardDeleteComment,
  hardDeletePost,
  hideContent,
  muteUntilFor,
  muteUser,
  resetUserProfile,
  resolveFeedback,
  setUserRole,
  unhideContent,
  unmuteUser,
} from "../src/lib/moderation";
import { createCommentForVisiblePost, createPost, getCommentsPage, getFeedPage, getPost } from "../src/lib/posts";
import { getPostShareSnapshot, getWorkShareSnapshot } from "../src/lib/share-posters";
import { createWork, getWorksPage, type WorkFields } from "../src/lib/works";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run moderation integration outside an isolated kbu-mysql database");
}

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const userIds: number[] = [];
  const insertUser = async (suffix: string, role = "member"): Promise<number> => {
    const [res] = await pool.query(
      "INSERT INTO users (handle, name, role, avatar_url, bio) VALUES (?, ?, ?, 'https://example.com/a.png', 'bio')",
      [`mod_${suffix}_${stamp}`, `Mod ${suffix}`, role],
    );
    const id = Number((res as { insertId: number }).insertId);
    userIds.push(id);
    return id;
  };
  const postIds: number[] = [];
  const workIds: number[] = [];
  const auditCount = async (): Promise<number> => {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS n FROM moderation_actions WHERE actor_id IN (?)",
      [userIds.length ? userIds : [-1]],
    );
    return Number((rows as { n: number }[])[0]?.n ?? 0);
  };

  try {
    const admin = await insertUser("admin", "admin");
    const mod = await insertUser("mod", "mod");
    const member = await insertUser("m");
    let audit = 0;

    /* ---- Hide post: gone publicly, author still sees, unhide
       restores ---- */
    const postId = await createPost({
      userId: member, type: "text", category: "chat", title: "治理测试帖",
      bodyMd: "body", linkUrl: "", lang: "zh", aiReply: false, visibility: "public", options: [],
    });
    postIds.push(postId);
    /* Seeding uses the safe variant: createComment is gone, everything
       goes through createCommentForVisiblePost — the author's view
       seeding their own public post, same semantics. */
    const memberViewer = { id: member, role: "member" };
    const firstFloor = await createCommentForVisiblePost(memberViewer, postId, "一楼");
    assert.ok(firstFloor);
    const commentId = firstFloor.id;
    const reply = await createCommentForVisiblePost(memberViewer, postId, "一楼回复", commentId);
    assert.ok(reply);

    assert.equal(await hideContent(mod, "post", postId, "违规"), true);
    audit += 1;
    assert.equal(await hideContent(mod, "post", postId, "重复"), false); /* 幂等:已屏蔽 */
    const anonFeed = await getFeedPage({ sort: "new" });
    assert.ok(!anonFeed.posts.some((p) => p.id === postId));
    const authorFeed = await getFeedPage({ sort: "new", viewerId: member });
    const ownHidden = authorFeed.posts.find((p) => p.id === postId);
    assert.ok(ownHidden && ownHidden.hiddenAt !== null);
    /* Hidden can't be featured; the poster snapshot is null. */
    assert.equal(await setPostFeatured(mod, postId, "x"), false);
    assert.equal(await getPostShareSnapshot(postId), null);
    assert.equal(await unhideContent(mod, "post", postId), true);
    audit += 1;
    assert.ok((await getFeedPage({ sort: "new" })).posts.some((p) => p.id === postId));
    assert.ok(await getPostShareSnapshot(postId));

    /* ---- Feature-then-hide: hide clears the three featured columns in
       the same transaction, no residue ---- */
    assert.equal(await setPostFeatured(mod, postId, "值得一读"), true);
    assert.ok(await getPostFeatured(postId));
    assert.equal(await hideContent(mod, "post", postId, "又违规"), true);
    audit += 1;
    {
      const [row] = await pool.query(
        "SELECT featured_at, featured_by, featured_reason FROM posts WHERE id = ?",
        [postId],
      );
      const r = (row as { featured_at: Date | null }[])[0];
      assert.equal(r.featured_at, null); /* 三列齐清,取数层还有谓词双保险 */
      assert.equal(await getPostFeatured(postId), null);
    }
    assert.equal(await unhideContent(mod, "post", postId), true);
    audit += 1;
    /* Unhiding doesn't restore featuring — re-feature deliberately. */
    assert.equal(await getPostFeatured(postId), null);

    /* ---- Hide comment: gone publicly (replies promoted to top level),
       author still sees ---- */
    assert.equal(await hideContent(mod, "comment", commentId, "引战"), true);
    audit += 1;
    const anonComments = await getCommentsPage(postId, { showAi: true });
    assert.ok(!anonComments.comments.some((c) => c.id === commentId));
    /* Parent hidden -> the reply promotes to top level (same semantics
       as soft delete). */
    assert.equal(anonComments.comments.length, 1);
    assert.equal(anonComments.total, 1);
    assert.equal((await getPost(postId))?.commentCount, 1);
    assert.equal(
      (await getFeedPage({ sort: "new" })).posts.find((p) => p.id === postId)?.commentCount,
      1,
    );
    assert.equal((await getPostShareSnapshot(postId))?.commentCount, 1);
    const authorComments = await getCommentsPage(postId, { showAi: true, viewerId: member });
    assert.ok(authorComments.comments.some((c) => c.id === commentId && c.hiddenAt !== null));
    assert.equal(await unhideContent(mod, "comment", commentId), true);
    audit += 1;
    assert.equal((await getPost(postId))?.commentCount, 2);
    assert.equal((await getPostShareSnapshot(postId))?.commentCount, 2);

    /* ---- Audit-failure injection: the business update must roll back
       with the transaction ---- */
    const rollbackPost = await createPost({
      userId: member, type: "text", category: "chat", title: "审计回滚",
      bodyMd: "body", linkUrl: "", lang: "zh", aiReply: false, visibility: "public", options: [],
    });
    postIds.push(rollbackPost);
    await assert.rejects(() => adminDeletePost(2_147_483_647, rollbackPost, "invalid actor"));
    const [rollbackRows] = await pool.query(
      "SELECT deleted_at FROM posts WHERE id = ?", [rollbackPost],
    );
    assert.equal((rollbackRows as { deleted_at: Date | null }[])[0]?.deleted_at, null);

    /* ---- Hide work: wall/poster definitions ---- */
    const wFields: WorkFields = {
      name: "治理测试作品", tagline: "", url: "https://example.com", repoUrl: "",
      screenshotUrl: "", tags: [], agents: ["kimi"], authorLabel: "", visibility: "public",
      claimedTokens: null, status: "released", models: [], kind: "app",
      descriptionMd: "", scope: null, logoKey: "", imageKeys: [],
      coverTone: "theme", coverFit: "cover", coverKey: "", aiReply: true,
      sourcePath: null,
    };
    const workId = await createWork(member, wFields);
    workIds.push(workId);
    assert.equal(await hideContent(mod, "work", workId, "侵权"), true);
    audit += 1;
    assert.ok(!(await getWorksPage()).works.some((w) => w.id === workId));
    assert.ok((await getWorksPage({ viewerId: member })).works.some((w) => w.id === workId && w.hiddenAt !== null));
    assert.equal(await getWorkShareSnapshot(workId), null);
    assert.equal(await unhideContent(mod, "work", workId), true);
    audit += 1;

    /* ---- Management soft delete + hard delete ---- */
    assert.equal(await adminDeleteComment(mod, commentId, "清理"), true);
    audit += 1;
    /* Hard delete is the terminal cleanup for soft-deleted rows. The
       root's live reply is removed with the subtree and is the only row
       still represented in the public counter. */
    assert.equal(await hardDeleteComment(admin, commentId, "硬删评论树"), true);
    audit += 1;
    const [cnt] = await pool.query("SELECT comment_count AS n FROM posts WHERE id = ?", [postId]);
    assert.equal(Number((cnt as { n: number }[])[0]?.n), 0); /* 两条评论都已清掉 */
    const [commentRows] = await pool.query("SELECT COUNT(*) AS n FROM comments WHERE post_id = ?", [postId]);
    assert.equal(Number((commentRows as { n: number }[])[0]?.n), 0);

    assert.equal(await adminDeletePost(mod, postId, "违规"), true);
    audit += 1;
    assert.equal(await hardDeletePost(admin, postId, "硬删已软删帖子"), true);
    audit += 1;
    assert.equal(await hardDeletePost(admin, postId, "再来"), false); /* 不存在 */
    const post2 = await createPost({
      userId: member, type: "text", category: "chat", title: "硬删测试帖",
      bodyMd: "b", linkUrl: "", lang: "zh", aiReply: false, visibility: "public", options: [],
    });
    postIds.push(post2);
    assert.ok(await createCommentForVisiblePost(memberViewer, post2, "随帖级联"));
    assert.equal(await hardDeletePost(admin, post2, "硬删"), true);
    audit += 1;
    const [orphans] = await pool.query("SELECT COUNT(*) AS n FROM comments WHERE post_id = ?", [post2]);
    assert.equal(Number((orphans as { n: number }[])[0]?.n), 0); /* 级联 */
    assert.equal(await hardDeletePost(admin, post2, "再来"), false); /* 不存在 */

    /* ---- Mutes: effective / auto-expiring / unmute / admin targets
       rejected ---- */
    const until = muteUntilFor(7);
    assert.ok(until);
    assert.equal(await muteUser(mod, member, until, "刷屏"), true);
    audit += 1;
    assert.ok(await getActiveMute(member));
    assert.equal(await muteUser(mod, admin, until, "x"), false); /* admin 不可被禁言 */
    assert.equal(await unmuteUser(mod, member), true);
    audit += 1;
    assert.equal(await getActiveMute(member), null);
    await pool.query("UPDATE users SET muted_until = ? WHERE id = ?", [until, admin]);
    assert.equal(await unmuteUser(mod, admin), false); /* 历史脏值也不能让 mod 解禁 admin */
    const [adminMute] = await pool.query("SELECT muted_until FROM users WHERE id = ?", [admin]);
    assert.ok((adminMute as { muted_until: Date | null }[])[0]?.muted_until);
    await pool.query("UPDATE users SET muted_until = NULL WHERE id = ?", [admin]);
    await pool.query("UPDATE users SET muted_until = '2020-01-01 00:00:00' WHERE id = ?", [member]);
    assert.equal(await getActiveMute(member), null); /* 过期自动解除 */

    /* ---- Profile reset ---- */
    assert.equal(await resetUserProfile(mod, member, "头像违规"), true);
    audit += 1;
    const [cleared] = await pool.query(
      "SELECT avatar_url, name, bio FROM users WHERE id = ?", [member],
    );
    assert.deepEqual(
      (cleared as { avatar_url: string; name: string; bio: string }[])[0],
      { avatar_url: "", name: "", bio: "" },
    );
    assert.equal(await resetUserProfile(mod, admin, "x"), false);

    /* ---- Roles: promote to mod <-> demote to member; admin targets
       rejected ---- */
    assert.equal(await setUserRole(admin, member, "mod"), true);
    audit += 1;
    assert.equal(await setUserRole(admin, member, "member"), true);
    audit += 1;
    assert.equal(await setUserRole(admin, admin, "member"), false); /* admin 不可被降 */

    /* ---- Feedback resolution: state change + audit are one
       transaction; an invalid actor leaves the flag open. ---- */
    const feedbackResults = await Promise.all([
      sendFeedback({
        reporterId: member,
        targetType: "work",
        targetId: workId,
        reason: "other",
        note: "integration one",
      }),
      sendFeedback({
        reporterId: member,
        targetType: "work",
        targetId: workId,
        reason: "spam",
        note: "integration two",
      }),
    ]);
    assert.equal(feedbackResults.filter((r) => r.ok).length, 1);
    assert.equal(
      feedbackResults.filter((r) => !r.ok && r.code === "duplicate").length,
      1,
    );
    const [feedbackRows] = await pool.query(
      `SELECT id FROM feedback
       WHERE reporter_id = ? AND target_type = 'work' AND target_id = ? AND status = 'open'`,
      [member, workId],
    );
    assert.equal((feedbackRows as { id: number }[]).length, 1);
    const feedbackId = Number((feedbackRows as { id: number }[])[0]?.id);
    await assert.rejects(() => resolveFeedback(2_147_483_647, feedbackId));
    const [openFeedback] = await pool.query(
      "SELECT status FROM feedback WHERE id = ?",
      [feedbackId],
    );
    assert.equal((openFeedback as { status: string }[])[0]?.status, "open");
    assert.equal(await resolveFeedback(mod, feedbackId), true);
    audit += 1;
    assert.equal(await resolveFeedback(mod, feedbackId), false);

    /* ---- Audit: action counts match expectations one by one ---- */
    assert.equal(await auditCount(), audit);
    const log = await getModerationLog();
    assert.ok(log.rows.some((r) => r.action === "hard_delete" && r.targetType === "post"));
    assert.ok(log.rows.some((r) => r.action === "mute" && r.targetType === "user"));
    assert.ok(log.rows.every((r) => r.actorHandle !== null));

    console.log("moderation integration: passed");
  } finally {
    for (const id of postIds) await pool.query("DELETE FROM posts WHERE id = ?", [id]);
    for (const id of workIds) await pool.query("DELETE FROM works WHERE id = ?", [id]);
    if (userIds.length) {
      await pool.query("DELETE FROM moderation_actions WHERE actor_id IN (?)", [userIds]);
      await pool.query("DELETE FROM users WHERE id IN (?)", [userIds]);
    }
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
