/* Work visibility integration. Runs only against an isolated database
   (DATABASE_URL must contain kbu-mysql). Covers the full surface:
   /works wall and /awesome list (anonymous sees public only; the
   author additionally sees their private entries); profile works tab
   and counts (getUserWorks / userWorksCountQuery self vs visitor);
   detail visibility (canViewWork: private is author-only); poster
   snapshots (private -> null, route 404s); public contexts (related
   works / rail stats / hot / featured slots all public-only); private
   works can't be featured; edit round trip (public -> private
   disappears from visitors immediately, the author still sees). Also
   covers profile-privacy (updateProfilePrivacy) round trips. */
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
import { createCommentForVisiblePost, createPost, getCommunityStats } from "../src/lib/posts";
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
    coverTone: "theme",
    coverFit: "cover",
    coverKey: "",
    aiReply: true,
    sourcePath: null,
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

    /* Public aggregate baseline: adding only private/hidden content
       afterwards must not move the visitor totals. */
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
    /* Seeding uses the safe variant: the author's view — private posts
       are self-visible. */
    const seedComment = async (postId: number, body: string): Promise<number> => {
      const created = await createCommentForVisiblePost({ id: author, role: "member" }, postId, body);
      assert.ok(created);
      return created.id;
    };
    const privateComment = await seedComment(privatePost, "private comment");
    const hiddenComment = await seedComment(hiddenPost, "hidden comment");
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

    /* Seeds: public work / private work / public awesome entry /
       private awesome entry / editor-curated (NULL author). */
    const pubWork = await createWork(author, fields({ name: "公开作品" }));
    const privWork = await createWork(author, fields({ name: "私密作品", visibility: "private" }));
    const pubAwesome = await createWork(author, fields({ name: "公开推荐", authorLabel: "外部作者", scope: "base" }));
    const privAwesome = await createWork(author, fields({ name: "私密推荐", authorLabel: "外部作者", scope: "eco", visibility: "private" }));
    workIds.push(pubWork, privWork, pubAwesome, privAwesome);
    const [ed] = await pool.query(
      "INSERT INTO works (user_id, name, tagline, url, agents, source, author_label, scope) VALUES (NULL, 'editor-curated', 'editorial', 'https://example.com', JSON_ARRAY('kimi'), 'awesome', 'editorial', 'base')",
    );
    const editorial = Number((ed as { insertId: number }).insertId);
    workIds.push(editorial);

    /* 1. Works wall: anonymous misses private; the author sees;
       strangers don't. */
    const anonWall = await getWorksPage();
    assert.ok(anonWall.works.some((w) => w.id === pubWork));
    assert.ok(!anonWall.works.some((w) => w.id === privWork));
    const authorWall = await getWorksPage({ viewerId: author });
    assert.ok(authorWall.works.some((w) => w.id === privWork));
    const strangerWall = await getWorksPage({ viewerId: stranger });
    assert.ok(!strangerWall.works.some((w) => w.id === privWork));

    /* 2. Awesome: anonymous sees public entries + editor-curated, not
       private ones; the recommender sees their own; member works stay
       off Awesome unless "also list" is checked. */
    const anonAwesome = await getAwesomeWorksPage();
    assert.ok(anonAwesome.works.some((w) => w.id === pubAwesome));
    assert.ok(anonAwesome.works.some((w) => w.id === editorial));
    assert.ok(!anonAwesome.works.some((w) => w.id === privAwesome));
    assert.ok(!anonAwesome.works.some((w) => w.id === pubWork));
    const pubListed = await createWork(
      author,
      fields({ name: "公开作品-同步收录", alsoAwesome: true }),
    );
    workIds.push(pubListed);
    const awesomeAfter = await getAwesomeWorksPage();
    assert.ok(awesomeAfter.works.some((w) => w.id === pubListed));
    const authorAwesome = await getAwesomeWorksPage({ viewerId: author });
    assert.ok(authorAwesome.works.some((w) => w.id === privAwesome));

    /* 3. Detail visibility + poster snapshot: private -> invisible to
       non-authors / snapshot null. */
    const privRow = await getWork(privWork);
    assert.ok(privRow);
    assert.equal(canViewWork(privRow, { id: author, role: "member" }), true);
    assert.equal(canViewWork(privRow, { id: stranger, role: "member" }), false);
    assert.equal(canViewWork(privRow, null), false);
    assert.equal(await getWorkShareSnapshot(privWork), null);
    assert.ok(await getWorkShareSnapshot(pubWork));

    /* 4. Profile works tab + counts: self includes private, visitors
       public only (section 2 added one also-listed public work: 3/2). */
    const selfWorks = await getUserWorks(author, true);
    const guestWorks = await getUserWorks(author, false);
    assert.ok(selfWorks.some((w) => w.id === privWork));
    assert.ok(!guestWorks.some((w) => w.id === privWork));
    const countQ = (self: boolean) => userWorksCountQuery(author, self);
    const [selfCount] = await pool.query(countQ(true).sql, countQ(true).args);
    const [guestCount] = await pool.query(countQ(false).sql, countQ(false).args);
    assert.equal(Number((selfCount as { n: number }[])[0]?.n), 3);
    assert.equal(Number((guestCount as { n: number }[])[0]?.n), 2);

    /* 5. Public contexts: related / rail hot / wall stats carry no
       private works. */
    const related = await getRelatedWorks({ id: pubWork, userId: author, agents: ["kimi"] });
    assert.ok(!related.some((w) => w.id === privWork));
    const top = await getTopWorks(20);
    assert.ok(!top.some((w) => w.id === privWork));
    const stats = await getWorksWallStats();
    const [pubOnly] = await pool.query(
      "SELECT COUNT(*) AS n FROM works WHERE source = 'site' AND visibility = 'public'",
    );
    assert.equal(stats.works, Number((pubOnly as { n: number }[])[0]?.n));

    /* 6. Featuring: private works fail to feature; a featured public
       work turned private leaves the slot. */
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
    /* The author still sees it on the wall after it turned private;
       visitors/anonymous don't. */
    assert.ok((await getWorksPage({ viewerId: author })).works.some((w) => w.id === pubWork));
    assert.ok(!(await getWorksPage()).works.some((w) => w.id === pubWork));
    await clearWorkFeatured(pubWork);

    /* 7. Profile-privacy: switch round trips + display rules. */
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
