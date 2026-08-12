/* 作品可见性(20260828_work_visibility)集成测试。只在隔离库运行
   (DATABASE_URL 必须含 kbu-mysql)。覆盖全口径:
   - /works 墙与 /awesome 列表:匿名只见公开;作者额外见自己的私密条目;
   - 个人主页作品页签与计数:getUserWorks / userWorksCountQuery 的 self/访客口径;
   - 详情可见性判定(canViewWork):私密仅作者;
   - 分享海报快照:私密作品 → null(路由 404);
   - 公共上下文:相关作品 / 右栏统计 / 热门 / 精选位 全部 public-only;
   - 私密作品不可被设精选;
   - 编辑往返:public → private 即时从访客视野消失,作者仍可见。
   附带资料展示隐私(updateProfilePrivacy)的存取往返。 */
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import { featuredWorksQuery, setWorkFeatured, clearWorkFeatured } from "../src/lib/featured";
import { getWorkShareSnapshot, userWorksCountQuery } from "../src/lib/share-posters";
import {
  getProfileByHandle,
  getProfileStats,
  profileDisplay,
  updateProfilePrivacy,
} from "../src/lib/users";
import { createComment, createPost, getCommunityStats } from "../src/lib/posts";
import {
  canViewWork,
  createWork,
  getAwesomeWorksPage,
  getRelatedWorks,
  getTopWorks,
  getUserWorks,
  getWork,
  getWorksPage,
  getWorksWallStats,
  updateWork,
  type WorkFields,
} from "../src/lib/works";

if (!process.env.DATABASE_URL?.includes("kbu-mysql")) {
  throw new Error("Refusing to run work visibility integration outside an isolated kbu-mysql database");
}

function fields(overrides: Partial<WorkFields> = {}): WorkFields {
  return {
    name: "可见性测试作品",
    tagline: "visibility test",
    url: "https://example.com",
    repoUrl: "",
    screenshotUrl: "",
    tags: [],
    agents: ["kimi"],
    authorLabel: "",
    visibility: "public",
    claimedTokens: null,
    status: "released",
    models: [],
    kind: "app",
    descriptionMd: "",
    scope: null,
    logoKey: "",
    imageKeys: [],
    ...overrides,
  };
}

async function main() {
  const pool = getPool();
  const stamp = Date.now();
  const userIds: number[] = [];
  const workIds: number[] = [];
  const postIds: number[] = [];
  const insertUser = async (suffix: string): Promise<number> => {
    const [res] = await pool.query(
      "INSERT INTO users (handle, name) VALUES (?, ?)",
      [`vis_${suffix}_${stamp}`, "Vis Test"],
    );
    const id = Number((res as { insertId: number }).insertId);
    userIds.push(id);
    return id;
  };

  try {
    const author = await insertUser("a");
    const stranger = await insertUser("b");

    /* 公开聚合基线:后续只加私密/屏蔽内容，不应改变访客社区总量。 */
    const communityBefore = await getCommunityStats();
    const privatePost = await createPost({
      userId: author, type: "text", category: "chat", title: "私密聚合",
      bodyMd: "private", linkUrl: "", lang: "zh", aiReply: false,
      visibility: "private", options: [],
    });
    const hiddenPost = await createPost({
      userId: author, type: "text", category: "chat", title: "屏蔽聚合",
      bodyMd: "hidden", linkUrl: "", lang: "zh", aiReply: false,
      visibility: "public", options: [],
    });
    postIds.push(privatePost, hiddenPost);
    const privateComment = await createComment(privatePost, author, "private comment");
    const hiddenComment = await createComment(hiddenPost, author, "hidden comment");
    await pool.query("UPDATE posts SET hidden_at = NOW() WHERE id = ?", [hiddenPost]);
    await pool.query("UPDATE comments SET hidden_at = NOW() WHERE id = ?", [hiddenComment]);
    for (const [targetType, targetId] of [
      ["post", privatePost], ["post", hiddenPost],
      ["comment", privateComment], ["comment", hiddenComment],
    ] as const) {
      await pool.query(
        "INSERT INTO reactions (user_id, target_type, target_id, kind) VALUES (?, ?, ?, 'up')",
        [stranger, targetType, targetId],
      );
    }
    assert.deepEqual(await getProfileStats(author, false), { posts: 0, comments: 0, likes: 0 });
    assert.deepEqual(await getProfileStats(author, true), { posts: 2, comments: 2, likes: 4 });
    const communityAfter = await getCommunityStats();
    assert.equal(communityAfter.posts, communityBefore.posts);
    assert.equal(communityAfter.comments, communityBefore.comments);

    /* 种子:公开作品 / 私密作品 / 公开 awesome 推荐 / 私密 awesome 推荐 / 编辑收录(NULL 作者) */
    const pubWork = await createWork(author, fields({ name: "公开作品" }));
    const privWork = await createWork(author, fields({ name: "私密作品", visibility: "private" }));
    const pubAwesome = await createWork(author, fields({ name: "公开推荐", authorLabel: "外部作者", scope: "base" }));
    const privAwesome = await createWork(author, fields({ name: "私密推荐", authorLabel: "外部作者", scope: "eco", visibility: "private" }));
    workIds.push(pubWork, privWork, pubAwesome, privAwesome);
    const [ed] = await pool.query(
      "INSERT INTO works (user_id, name, tagline, url, agents, source, author_label, scope) VALUES (NULL, '编辑收录', 'editorial', 'https://example.com', JSON_ARRAY('kimi'), 'awesome', '编辑', 'base')",
    );
    const editorial = Number((ed as { insertId: number }).insertId);
    workIds.push(editorial);

    /* 1. 作品墙:匿名不见私密;作者见;陌生人不见 */
    const anonWall = await getWorksPage();
    assert.ok(anonWall.works.some((w) => w.id === pubWork));
    assert.ok(!anonWall.works.some((w) => w.id === privWork));
    const authorWall = await getWorksPage({ viewerId: author });
    assert.ok(authorWall.works.some((w) => w.id === privWork));
    const strangerWall = await getWorksPage({ viewerId: stranger });
    assert.ok(!strangerWall.works.some((w) => w.id === privWork));

    /* 2. Awesome:匿名见公开推荐 + 编辑收录,不见私密推荐;推荐人本人见 */
    const anonAwesome = await getAwesomeWorksPage();
    assert.ok(anonAwesome.works.some((w) => w.id === pubAwesome));
    assert.ok(anonAwesome.works.some((w) => w.id === editorial));
    assert.ok(!anonAwesome.works.some((w) => w.id === privAwesome));
    const authorAwesome = await getAwesomeWorksPage({ viewerId: author });
    assert.ok(authorAwesome.works.some((w) => w.id === privAwesome));

    /* 3. 详情可见性判定 + 海报快照:私密 → 非作者不可见 / 快照 null */
    const privRow = await getWork(privWork);
    assert.ok(privRow);
    assert.equal(canViewWork(privRow, { id: author, role: "member" }), true);
    assert.equal(canViewWork(privRow, { id: stranger, role: "member" }), false);
    assert.equal(canViewWork(privRow, null), false);
    assert.equal(await getWorkShareSnapshot(privWork), null);
    assert.ok(await getWorkShareSnapshot(pubWork));

    /* 4. 个人主页作品页签 + 计数:self 含私密,访客只公开 */
    const selfWorks = await getUserWorks(author, true);
    const guestWorks = await getUserWorks(author, false);
    assert.ok(selfWorks.some((w) => w.id === privWork));
    assert.ok(!guestWorks.some((w) => w.id === privWork));
    const countQ = (self: boolean) => userWorksCountQuery(author, self);
    const [selfCount] = await pool.query(countQ(true).sql, countQ(true).args);
    const [guestCount] = await pool.query(countQ(false).sql, countQ(false).args);
    assert.equal(Number((selfCount as { n: number }[])[0]?.n), 2);
    assert.equal(Number((guestCount as { n: number }[])[0]?.n), 1);

    /* 5. 公共上下文:相关作品 / 右栏热门 / 墙统计 均不含私密 */
    const related = await getRelatedWorks({ id: pubWork, userId: author, agents: ["kimi"] });
    assert.ok(!related.some((w) => w.id === privWork));
    const top = await getTopWorks(20);
    assert.ok(!top.some((w) => w.id === privWork));
    const stats = await getWorksWallStats();
    const [pubOnly] = await pool.query(
      "SELECT COUNT(*) AS n FROM works WHERE source = 'site' AND visibility = 'public'",
    );
    assert.equal(stats.works, Number((pubOnly as { n: number }[])[0]?.n));

    /* 6. 精选:私密作品设精选失败;公开作品设上后转私密即离开精选位 */
    assert.equal(await setWorkFeatured(author, privWork, "私密不可精选"), false);
    assert.equal(await setWorkFeatured(author, pubWork, "精选测试"), true);
    let featured = await (async () => {
      const q = featuredWorksQuery(50);
      const [rows] = await pool.query(q.sql, q.args);
      return (rows as { id: number }[]).map((r) => Number(r.id));
    })();
    assert.ok(featured.includes(pubWork));
    assert.equal(
      await updateWork(author, pubWork, fields({ name: "公开作品", visibility: "private" })),
      true,
    );
    featured = await (async () => {
      const q = featuredWorksQuery(50);
      const [rows] = await pool.query(q.sql, q.args);
      return (rows as { id: number }[]).map((r) => Number(r.id));
    })();
    assert.ok(!featured.includes(pubWork));
    /* 作者仍能在墙上看到转为私密的它,访客/匿名不能 */
    assert.ok((await getWorksPage({ viewerId: author })).works.some((w) => w.id === pubWork));
    assert.ok(!(await getWorksPage()).works.some((w) => w.id === pubWork));
    await clearWorkFeatured(pubWork);

    /* 7. 资料展示隐私:开关存取往返 + 展示口径 */
    await updateProfilePrivacy(author, { showAvatar: false, showName: false, showBio: false });
    const p = await getProfileByHandle(`vis_a_${stamp}`);
    assert.ok(p);
    assert.deepEqual(
      { a: p.showAvatar, n: p.showName, b: p.showBio },
      { a: false, n: false, b: false },
    );
    const guest = profileDisplay(p, false);
    assert.equal(guest.avatarUrl, "");
    assert.equal(guest.displayName, `@vis_a_${stamp}`);
    assert.equal(guest.bio, "");
    const self = profileDisplay(p, true);
    assert.equal(self.displayName, "Vis Test");
    await updateProfilePrivacy(author, { showAvatar: true, showName: true, showBio: true });

    console.log("work visibility integration: passed");
  } finally {
    if (userIds.length) await pool.query("DELETE FROM reactions WHERE user_id IN (?)", [userIds]);
    for (const id of postIds) await pool.query("DELETE FROM posts WHERE id = ?", [id]);
    for (const id of workIds) {
      await pool.query("DELETE FROM works WHERE id = ?", [id]);
    }
    for (const id of userIds) {
      await pool.query("DELETE FROM users WHERE id = ?", [id]);
    }
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
