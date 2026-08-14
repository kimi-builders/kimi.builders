import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { feedPageQuery, type FeedPost } from "../src/lib/posts";
import {
  hydratePublicFeedPage,
  publicFeedCacheScope,
  toPublicFeedPageDto,
} from "../src/lib/public-feed";

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: 1,
    type: "text",
    category: "chat",
    title: "Public post",
    excerpt: "Excerpt",
    bodyMd: "Body",
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    score: 3,
    commentCount: 2,
    createdAt: new Date("2026-08-12T12:00:00.000Z"),
    solvedAt: null,
    handle: "builder",
    name: "Builder",
    avatarUrl: "/avatar.svg",
    role: "member",
    aiReply: false,
    ...overrides,
  };
}

test("public feed cache scope is bounded to anonymous page one", () => {
  assert.deepEqual(publicFeedCacheScope({ sort: "new", category: "showcase" }), {
    sort: "new",
    category: "showcase",
    solved: false,
  });
  assert.deepEqual(
    publicFeedCacheScope({ sort: "new", category: "showcase", solved: true }),
    { sort: "new", category: "showcase", solved: true },
  );
  assert.deepEqual(publicFeedCacheScope({ sort: "not-a-sort", category: "not-a-category" }), {
    sort: "hot",
    category: null,
    solved: false,
  });
  assert.deepEqual(publicFeedCacheScope({ sort: "hot", category: "x".repeat(10_000) }), {
    sort: "hot",
    category: null,
    solved: false,
  });
  assert.equal(publicFeedCacheScope({ sort: "hot", viewerId: 7 }), null);
  assert.equal(publicFeedCacheScope({ sort: "hot", subscriberId: 7 }), null);
  assert.equal(publicFeedCacheScope({ sort: "hot", after: "" }), null);
});

test("anonymous SQL is public and non-hidden before rows reach the DTO boundary", () => {
  const { sql, args } = feedPageQuery({
    sort: "new",
    category: "help",
  });
  assert.match(sql, /p\.visibility = 'public'/);
  assert.match(sql, /p\.hidden_at IS NULL/);
  assert.doesNotMatch(sql, /p\.visibility = 'public' OR p\.user_id/);
  assert.deepEqual(args, ["help"]);
});

test("cached DTO drops non-public rows and contains JSON primitives only", () => {
  const dto = toPublicFeedPageDto({
    posts: [
      post(),
      post({ id: 2, visibility: "private", title: "private sentinel" }),
      post({ id: 3, hiddenAt: new Date("2026-08-12T13:00:00.000Z"), title: "hidden sentinel" }),
    ],
    nextCursor: "1",
  });
  assert.equal(dto.posts.length, 1);
  assert.equal(dto.posts[0].title, "Public post");
  assert.equal(dto.posts[0].createdAt, "2026-08-12T12:00:00.000Z");
  assert.equal(dto.posts[0].hiddenAt, null);
  assert.equal(dto.posts[0].hiddenReason, null);
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto);

  const hydrated = hydratePublicFeedPage(dto);
  assert.ok(hydrated.posts[0].createdAt instanceof Date);
  assert.equal(hydrated.posts[0].createdAt.toISOString(), dto.posts[0].createdAt);
});

test("cache adapter and feed renderer keep the shared-cache boundary explicit", () => {
  const cacheSource = readFileSync(
    new URL("../src/lib/public-feed-cache.ts", import.meta.url),
    "utf8",
  );
  const feedSource = readFileSync(
    new URL("../app/(app)/community/_components/feed-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cacheSource, /unstable_cache\(/);
  assert.match(cacheSource, /revalidate: PUBLIC_FEED_REVALIDATE_SECONDS/);
  assert.match(cacheSource, /tags: \[PUBLIC_POSTS_CACHE_TAG, PUBLIC_USERS_CACHE_TAG\]/);
  assert.match(cacheSource, /return toPublicFeedPageDto\(page\)/);
  assert.match(
    feedSource,
    /publicScope\s*\? await getPublicFeedFirstPage\(publicScope\)\s*:\s*await getFeedPage\(opts\)/,
  );
});

test("public feed mutations invalidate tags without coupling the bare Node AI worker", () => {
  const community = readFileSync(
    new URL("../app/(app)/community/actions.ts", import.meta.url),
    "utf8",
  );
  const admin = readFileSync(
    new URL("../app/(app)/admin/actions.ts", import.meta.url),
    "utf8",
  );
  const settings = readFileSync(
    new URL("../app/(app)/settings/actions.ts", import.meta.url),
    "utf8",
  );
  const aiReply = readFileSync(
    new URL("../src/lib/ai-reply.ts", import.meta.url),
    "utf8",
  );
  for (const action of [
    "createPostAction",
    "createCommentAction",
    "setPostReactionAction",
    "updatePostAction",
    "deletePostAction",
    "setPostVisibilityAction",
    "deleteCommentAction",
  ]) {
    const start = community.indexOf(`export async function ${action}`);
    const end = community.indexOf("export async function ", start + 1);
    assert.ok(start >= 0, `${action} is present`);
    assert.match(
      community.slice(start, end < 0 ? community.length : end),
      /updateTag\(PUBLIC_POSTS_CACHE_TAG\)/,
      `${action} invalidates the anonymous feed`,
    );
  }
  assert.match(admin, /type === "post" \|\| type === "comment"/);
  assert.match(admin, /updateTag\(PUBLIC_POSTS_CACHE_TAG\)/);
  assert.match(settings, /updateTag\(PUBLIC_USERS_CACHE_TAG\)/);
  assert.doesNotMatch(aiReply, /next\/cache/);
});
