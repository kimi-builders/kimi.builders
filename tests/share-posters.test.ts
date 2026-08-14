import assert from "node:assert/strict";
import test from "node:test";
import type { PollData, PostDetail } from "../src/lib/posts";
import {
  buildPostShareSnapshot,
  buildProfileShareSnapshot,
  PROFILE_SHARE_CACHE_CONTROL,
  buildWorkShareSnapshot,
  clip,
  linkDomainOf,
  pollForPoster,
  posterInitials,
  posterYmd,
  userWorksCountQuery,
  POSTER_EXCERPT_MAX,
  POSTER_POLL_OPTIONS_MAX,
} from "../src/lib/share-posters";
import type { UserProfile } from "../src/lib/users";
import type { WorkRow } from "../src/lib/works";
import {
  POSTER_WIDTH,
  postPosterSize,
  profilePosterSize,
  workPosterSize,
} from "../app/api/share/poster-sizes";

function postDetail(overrides: Partial<PostDetail> = {}): PostDetail {
  return {
    id: 7,
    type: "text",
    category: "showcase",
    title: "用 Kimi 三天上线了一个小程序",
    excerpt: "",
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    score: 12,
    commentCount: 5,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    handle: "aklman",
    name: "Aklman Zhapar",
    avatarUrl: "",
    role: "member",
    userId: 3,
    bodyMd: "正文 **加粗** 还有 `代码` 和 [链接](https://example.com)。",
    linkUrl: "",
    lang: "zh",
    aiReply: false,
    editedAt: null,
    viewCount: 100,
    ...overrides,
  };
}

test("clip collapses whitespace and truncates with ellipsis", () => {
  assert.equal(clip("  你好   世界\n", 20), "你好 世界");
  assert.equal(clip("a".repeat(30), 10), `${"a".repeat(9)}…`);
  assert.equal(clip("", 10), "");
});

test("posterInitials: two words -> first letters, single word -> first two chars", () => {
  assert.equal(posterInitials("Aklman Zhapar", "aklman"), "AZ");
  assert.equal(posterInitials("张小明", "zxm"), "张小");
  assert.equal(posterInitials("", "aklman"), "AK");
  assert.equal(posterInitials("", ""), "KB");
});

test("linkDomainOf strips www and rejects invalid urls", () => {
  assert.equal(linkDomainOf("https://www.example.com/path?q=1"), "example.com");
  assert.equal(linkDomainOf("https://blog.foo.bar"), "blog.foo.bar");
  assert.equal(linkDomainOf("not a url"), null);
  assert.equal(linkDomainOf(""), null);
});

test("posterYmd formats UTC date", () => {
  assert.equal(posterYmd(new Date("2026-08-01T23:00:00Z")), "2026-08-01");
});

test("post snapshot: markdown body stripped and excerpt capped at 140 chars", () => {
  const long = `${"这是一段很长的正文,".repeat(30)}`;
  const s = buildPostShareSnapshot(postDetail({ bodyMd: long }), null);
  assert.ok(s);
  assert.ok(s.excerpt.length <= POSTER_EXCERPT_MAX + 1);
  assert.ok(s.excerpt.endsWith("…"));
  /* markdown 语法被 strip */
  const s2 = buildPostShareSnapshot(postDetail(), null);
  assert.ok(s2);
  assert.equal(s2.excerpt.includes("**"), false);
  assert.equal(s2.excerpt.includes("](https"), false);
});

test("post snapshot: private post is rejected (route renders 404)", () => {
  assert.equal(buildPostShareSnapshot(postDetail({ visibility: "private" }), null), null);
});

test("post snapshot: title clipped; no-title post falls back to body excerpt as title", () => {
  const s = buildPostShareSnapshot(postDetail({ title: "题".repeat(100) }), null);
  assert.ok(s);
  assert.equal(s.title.length, 66);
  /* 无标题帖:正文摘要坐到主标题位,excerpt 留空避免重复 */
  const s2 = buildPostShareSnapshot(postDetail({ title: "" }), null);
  assert.ok(s2);
  assert.equal(s2.title, "正文 加粗 还有 代码 和 链接。");
  assert.equal(s2.excerpt, "");
});

test("post snapshot: excerpt identical to title is dropped (short post dedupe)", () => {
  const s = buildPostShareSnapshot(
    postDetail({ title: "hello kimi builders", bodyMd: "hello kimi builders" }),
    null,
  );
  assert.ok(s);
  assert.equal(s.title, "hello kimi builders");
  assert.equal(s.excerpt, "");
});

test("post snapshot: link domain only for link posts with url", () => {
  const link = buildPostShareSnapshot(
    postDetail({ type: "link", linkUrl: "https://www.kimi.com/blog/x" }),
    null,
  );
  assert.equal(link?.linkDomain, "kimi.com");
  const text = buildPostShareSnapshot(postDetail({ type: "text", linkUrl: "" }), null);
  assert.equal(text?.linkDomain, null);
});

test("poll options capped at 4 with vote counts and overflow, null when no poll", () => {
  const poll: PollData = {
    options: [
      { id: 1, label: "选项一", voteCount: 5 },
      { id: 2, label: "选项二", voteCount: 3 },
      { id: 3, label: "选项三", voteCount: 2 },
      { id: 4, label: "选项四", voteCount: 1 },
      { id: 5, label: "选项五", voteCount: 9 },
      { id: 6, label: "选项六", voteCount: 0 },
    ],
    total: 20,
    myOptionId: null,
  };
  const p = pollForPoster(poll);
  assert.ok(p);
  assert.equal(p.options.length, POSTER_POLL_OPTIONS_MAX);
  assert.equal(p.more, 2);
  assert.equal(p.totalVotes, 20);
  assert.deepEqual(
    p.options.map((o) => o.votes),
    [5, 3, 2, 1],
  );
  assert.equal(pollForPoster(null), null);
  assert.equal(pollForPoster({ options: [], total: 0, myOptionId: null }), null);
});

test("poll snapshot only attached for poll-type posts", () => {
  const poll: PollData = {
    options: [{ id: 1, label: "好", voteCount: 2 }],
    total: 2,
    myOptionId: null,
  };
  const s = buildPostShareSnapshot(postDetail({ type: "poll" }), poll);
  assert.equal(s?.poll?.options.length, 1);
  const text = buildPostShareSnapshot(postDetail({ type: "text" }), poll);
  assert.equal(text?.poll, null);
});

function workRow(overrides: Partial<WorkRow> = {}): WorkRow {
  return {
    id: 9,
    name: "月面账本",
    tagline: "一人公司记账工具",
    url: "https://moon.example.com",
    repoUrl: "",
    screenshotUrl: "",
    tags: [],
    agents: ["kimi", "cursor"],
    source: "site",
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    userId: 3,
    handle: "aklman",
    avatarUrl: "",
    authorLabel: "",
    featuredAt: null,
    featuredReason: null,
    voteCount: 10,
    commentCount: 2,
    claimedTokens: null,
    status: "released",
    models: [],
    kind: "app",
    descriptionMd: "",
    scope: "",
    alsoAwesome: false,
    logoKey: "",
    imageKeys: [],
    ...overrides,
  };
}

test("work snapshot: claimed tokens gated by the display invariant", () => {
  /* 声明制(20260822_work_claims):hero 数字 = 本作品 claimed_tokens,
     且作者 Σ声明 ≤ 可验证总量;未声明 → 无 hero */
  const noClaim = buildWorkShareSnapshot(workRow(), new Map([[3, 5_000_000]]), new Map());
  assert.equal(noClaim.claimedTokens, null);
  /* 已声明且不变式满足(Σ300万 ≤ 总量500万)→ hero 带声明值 */
  const withClaim = buildWorkShareSnapshot(
    workRow({ claimedTokens: 2_000_000 }),
    new Map([[3, 5_000_000]]),
    new Map([[3, 3_000_000]]),
  );
  assert.equal(withClaim.claimedTokens, 2_000_000);
  /* 总量缩水:Σ声明 > 可验证总量 → 不渲染(无负面标记) */
  const over = buildWorkShareSnapshot(
    workRow({ claimedTokens: 2_000_000 }),
    new Map([[3, 1_000_000]]),
    new Map([[3, 3_000_000]]),
  );
  assert.equal(over.claimedTokens, null);
});

test("work snapshot: awesome entry falls back to author label without handle", () => {
  const s = buildWorkShareSnapshot(
    workRow({ source: "awesome", userId: null, handle: null, authorLabel: "外部作者" }),
    new Map(),
    new Map(),
  );
  assert.equal(s.author.handle, "");
  assert.equal(s.author.name, "外部作者");
  assert.equal(s.claimedTokens, null);
});

test("work snapshot: agents mapped to display names and capped", () => {
  const s = buildWorkShareSnapshot(
    workRow({ agents: ["kimi", "claude-code", "codex", "cursor", "copilot", "windsurf"] }),
    new Map(),
    new Map(),
  );
  assert.deepEqual(s.agents, ["Kimi Code", "Claude Code", "Codex", "Cursor", "GitHub Copilot"]);
  assert.equal(s.agentsMore, 1);
});

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 3,
    handle: "aklman",
    name: "Aklman Zhapar",
    avatarUrl: "",
    bio: "独立开发者。",
    showAvatar: true,
    showName: true,
    showBio: true,
    role: "member",
    createdAt: new Date("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

test("profile snapshot: usage line gated and sanitized", () => {
  const base = { profile: profile(), stats: { posts: 1, comments: 2, likes: 3 }, works: 4 };
  const noUsage = buildProfileShareSnapshot({ ...base, usage: null });
  assert.equal(noUsage.usage, null);
  const zeroTokens = buildProfileShareSnapshot({
    ...base,
    usage: { totalTokens: 0, activeDays: 5 },
  });
  assert.equal(zeroTokens.usage, null);
  const withUsage = buildProfileShareSnapshot({
    ...base,
    usage: { totalTokens: 1_000_000, activeDays: 12 },
  });
  assert.deepEqual(withUsage.usage, { totalTokens: 1_000_000, activeDays: 12, activity: {} });
});

test("profile snapshot: stats include works count, joined is YYYY-MM", () => {
  const s = buildProfileShareSnapshot({
    profile: profile(),
    stats: { posts: 47, comments: 231, likes: 1280 },
    works: 6,
    usage: null,
  });
  assert.deepEqual(s.stats, { posts: 47, comments: 231, likes: 1280, works: 6 });
  assert.equal(s.joinedAt, "2025-12");
  assert.equal(s.url, "https://kimi.builders/u/aklman");
});

test("profile snapshot: each privacy switch is applied with the visitor display rules", () => {
  const base = { stats: { posts: 1, comments: 2, likes: 3 }, works: 4, usage: null };
  const avatarHidden = buildProfileShareSnapshot({
    ...base,
    profile: profile({ avatarUrl: "https://cdn.kimi.builders/avatar/private.webp", showAvatar: false }),
  });
  assert.equal(avatarHidden.avatarUrl, "");

  const nameHidden = buildProfileShareSnapshot({
    ...base,
    profile: profile({ name: "PRIVATE NAME", showName: false }),
  });
  assert.equal(nameHidden.name, "@aklman");
  assert.equal(nameHidden.initials, "AK");
  assert.doesNotMatch(`${nameHidden.name} ${nameHidden.initials}`, /PRIVATE|PN/);

  const bioHidden = buildProfileShareSnapshot({
    ...base,
    profile: profile({ bio: "PRIVATE BIO", showBio: false }),
  });
  assert.equal(bioHidden.bio, "");
});

test("profile poster disables storage caches so privacy toggles take effect next request", () => {
  assert.equal(PROFILE_SHARE_CACHE_CONTROL, "private, no-store, max-age=0");
});

test("works count query scopes to member works of the user", () => {
  const { sql, args } = userWorksCountQuery(3);
  assert.match(sql, /source = 'site'/);
  assert.match(sql, /user_id = \?/);
  assert.deepEqual(args, [3]);
});

/* ---- 分档自适应高度(poster-sizes.ts) ---- */

const POSTER_STEPS = [960, 1080, 1200, 1320, 1440];

test("post poster height follows content: short sparse shortest, long title/poll taller", () => {
  const short = buildPostShareSnapshot(postDetail({ title: "hello", bodyMd: "" }), null);
  assert.ok(short);
  const shortSize = postPosterSize(short);
  assert.equal(shortSize.width, POSTER_WIDTH);
  assert.equal(shortSize.height, 960);

  /* 长标题稀疏帖(截图里的情形):66 字上档,不再硬撑 1440 */
  const longTitle = buildPostShareSnapshot(postDetail({ title: "长".repeat(60), bodyMd: "" }), null);
  assert.ok(longTitle);
  const longSize = postPosterSize(longTitle);
  assert.ok(longSize.height > shortSize.height);
  assert.ok(longSize.height <= 1440);

  const withPoll = buildPostShareSnapshot(
    postDetail({ type: "poll" }),
    {
      options: [
        { id: 1, label: "选项一", voteCount: 5 },
        { id: 2, label: "选项二", voteCount: 3 },
        { id: 3, label: "选项三", voteCount: 2 },
        { id: 4, label: "选项四", voteCount: 1 },
      ],
      total: 11,
      myOptionId: null,
    },
  );
  assert.ok(withPoll?.poll);
  const pollSize = postPosterSize(withPoll);
  assert.ok(pollSize.height >= 1080 && pollSize.height <= 1440);
});

test("work/profile poster heights follow their content blocks", () => {
  const noClaim = workPosterSize(buildWorkShareSnapshot(workRow(), new Map(), new Map()));
  const withClaim = workPosterSize(
    buildWorkShareSnapshot(
      workRow({ claimedTokens: 2_000_000 }),
      new Map([[3, 5_000_000]]),
      new Map([[3, 3_000_000]]),
    ),
  );
  assert.ok(withClaim.height > noClaim.height);

  const base = { profile: profile(), stats: { posts: 1, comments: 2, likes: 3 }, works: 4 };
  const noUsage = profilePosterSize(buildProfileShareSnapshot({ ...base, usage: null }));
  assert.equal(noUsage.height, 960);
  const withUsage = profilePosterSize(
    buildProfileShareSnapshot({ ...base, usage: { totalTokens: 1_000_000, activeDays: 12 } }),
  );
  assert.ok(withUsage.height > noUsage.height);

  for (const size of [noClaim, withClaim, noUsage, withUsage]) {
    assert.ok(POSTER_STEPS.includes(size.height), `height ${size.height} is a valid step`);
    assert.equal(size.width, POSTER_WIDTH);
  }
});
