/* 社区治理集成测试(20260830_moderation)。只在隔离库运行
   (DATABASE_URL 必须含 kbu-mysql)。覆盖:
   - 屏蔽:帖子/评论/作品 hide → 公开面不可见、作者可见;unhide 恢复;重复操作幂等拒绝;
   - 海报快照:被屏蔽帖/作品 → null(路由 404);被屏蔽不可设精选;
   - 软删(管理路径):帖/评论 deleted_at + 计数;硬删:仅 admin 语义,
     目标必须存在且未删;评论硬删整棵子树 + 帖计数按活条数减;帖硬删级联评论;
   - 禁言:mute → getActiveMute 生效;过期自动解除;unmute;admin 目标拒绝;
   - 资料重置:清空头像/名字/简介;admin 目标拒绝;
   - 角色:setUserRole 往返;admin 目标拒绝;
   - 审计:每个动作都在 moderation_actions 落行。 */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import { setPostFeatured } from "../src/lib/featured";
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
  setUserRole,
  unhideContent,
  unmuteUser,
} from "../src/lib/moderation";
import { createComment, createPost, getCommentsPage, getFeedPage } from "../src/lib/posts";
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

    /* ---- 屏蔽帖子:公开面消失、作者仍见、解除恢复 ---- */
    const postId = await createPost({
      userId: member, type: "text", category: "chat", title: "治理测试帖",
      bodyMd: "body", linkUrl: "", lang: "zh", aiReply: false, visibility: "public", options: [],
    });
    postIds.push(postId);
    const commentId = await createComment(postId, member, "一楼");
    await createComment(postId, member, "一楼回复", commentId);

    assert.equal(await hideContent(mod, "post", postId, "违规"), true);
    audit += 1;
    assert.equal(await hideContent(mod, "post", postId, "重复"), false); /* 幂等:已屏蔽 */
    const anonFeed = await getFeedPage({ sort: "new" });
    assert.ok(!anonFeed.posts.some((p) => p.id === postId));
    const authorFeed = await getFeedPage({ sort: "new", viewerId: member });
    const ownHidden = authorFeed.posts.find((p) => p.id === postId);
    assert.ok(ownHidden && ownHidden.hiddenAt !== null);
    /* 被屏蔽不可设精选;海报快照 null */
    assert.equal(await setPostFeatured(mod, postId, "x"), false);
    assert.equal(await getPostShareSnapshot(postId), null);
    assert.equal(await unhideContent(mod, "post", postId), true);
    audit += 1;
    assert.ok((await getFeedPage({ sort: "new" })).posts.some((p) => p.id === postId));
    assert.ok(await getPostShareSnapshot(postId));

    /* ---- 屏蔽评论:公开面消失(回复升级为顶层),作者仍见 ---- */
    assert.equal(await hideContent(mod, "comment", commentId, "引战"), true);
    audit += 1;
    const anonComments = await getCommentsPage(postId, { showAi: true });
    assert.ok(!anonComments.comments.some((c) => c.id === commentId));
    /* 父被屏蔽 → 回复升级为顶层(与软删同语义) */
    assert.equal(anonComments.comments.length, 1);
    const authorComments = await getCommentsPage(postId, { showAi: true, viewerId: member });
    assert.ok(authorComments.comments.some((c) => c.id === commentId && c.hiddenAt !== null));
    assert.equal(await unhideContent(mod, "comment", commentId), true);
    audit += 1;

    /* ---- 屏蔽作品:墙/海报口径 ---- */
    const wFields: WorkFields = {
      name: "治理测试作品", tagline: "", url: "https://example.com", repoUrl: "",
      screenshotUrl: "", tags: [], agents: ["kimi"], authorLabel: "", visibility: "public",
      claimedTokens: null, status: "released", models: [], kind: "app",
      descriptionMd: "", scope: null, logoKey: "", imageKeys: [],
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

    /* ---- 管理软删 + 硬删 ---- */
    assert.equal(await adminDeleteComment(mod, commentId, "清理"), true);
    audit += 1;
    assert.equal(await hardDeleteComment(admin, commentId, "x"), false); /* 已软删不可硬删 */
    const replyIdRow = await pool.query(
      "SELECT id FROM comments WHERE post_id = ? AND deleted_at IS NULL", [postId],
    );
    const replyId = Number((replyIdRow[0] as { id: number }[])[0].id);
    assert.equal(await hardDeleteComment(admin, replyId, "硬删回复"), true);
    audit += 1;
    const [cnt] = await pool.query("SELECT comment_count AS n FROM posts WHERE id = ?", [postId]);
    assert.equal(Number((cnt as { n: number }[])[0]?.n), 0); /* 两条评论都已清掉 */

    assert.equal(await adminDeletePost(mod, postId, "违规"), true);
    audit += 1;
    assert.equal(await hardDeletePost(admin, postId, "x"), false); /* 已删目标拒硬删 */
    const post2 = await createPost({
      userId: member, type: "text", category: "chat", title: "硬删测试帖",
      bodyMd: "b", linkUrl: "", lang: "zh", aiReply: false, visibility: "public", options: [],
    });
    postIds.push(post2);
    await createComment(post2, member, "随帖级联");
    assert.equal(await hardDeletePost(admin, post2, "硬删"), true);
    audit += 1;
    const [orphans] = await pool.query("SELECT COUNT(*) AS n FROM comments WHERE post_id = ?", [post2]);
    assert.equal(Number((orphans as { n: number }[])[0]?.n), 0); /* 级联 */
    assert.equal(await hardDeletePost(admin, post2, "再来"), false); /* 不存在 */

    /* ---- 禁言:生效/到期自动解除/解禁/admin 目标拒绝 ---- */
    const until = muteUntilFor(7);
    assert.ok(until);
    assert.equal(await muteUser(mod, member, until, "刷屏"), true);
    audit += 1;
    assert.ok(await getActiveMute(member));
    assert.equal(await muteUser(mod, admin, until, "x"), false); /* admin 不可被禁言 */
    assert.equal(await unmuteUser(mod, member), true);
    audit += 1;
    assert.equal(await getActiveMute(member), null);
    await pool.query("UPDATE users SET muted_until = '2020-01-01 00:00:00' WHERE id = ?", [member]);
    assert.equal(await getActiveMute(member), null); /* 过期自动解除 */

    /* ---- 资料重置 ---- */
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

    /* ---- 角色:提 mod ⇄ 降 member;admin 目标拒绝 ---- */
    assert.equal(await setUserRole(admin, member, "mod"), true);
    audit += 1;
    assert.equal(await setUserRole(admin, member, "member"), true);
    audit += 1;
    assert.equal(await setUserRole(admin, admin, "member"), false); /* admin 不可被降 */

    /* ---- 审计:动作数与预期逐一对应 ---- */
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
