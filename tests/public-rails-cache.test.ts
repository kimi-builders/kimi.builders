import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { FeaturedItem } from "../src/lib/featured";
import {
  toPublicAwesomeRailDto,
  toPublicCommunitySidebarDto,
  toPublicFeaturedRailDto,
  toPublicWorksRailDto,
} from "../src/lib/public-rails";
import type { WorkRow } from "../src/lib/works";

function work(): WorkRow {
  return {
    id: 8,
    name: "Small cached row",
    tagline: "Must not enter the rail DTO",
    url: "https://example.com",
    repoUrl: "https://example.com/repo",
    screenshotUrl: "/large.png",
    tags: ["demo"],
    agents: ["kimi"],
    source: "site",
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    createdAt: new Date("2026-08-12T12:00:00.000Z"),
    userId: 3,
    handle: "builder",
    avatarUrl: "/avatar.svg",
    authorLabel: "",
    featuredAt: null,
    featuredReason: null,
    voteCount: 9,
    commentCount: 4,
    claimedTokens: 500,
    status: "released",
    models: ["kimi-k2"],
    kind: "app",
    descriptionMd: "A long description",
    scope: "",
    logoKey: "logo.png",
    imageKeys: ["one.png"],
  };
}

test("right-rail DTOs whitelist JSON-only rendered fields", () => {
  const sidebar = toPublicCommunitySidebarDto({
    hot: [{ id: 1, title: "Hot", commentCount: 2, score: 3 }],
    stats: { members: 4, posts: 5, comments: 6 },
    newMembers: [{ handle: "new", avatarUrl: "/new.svg" }],
  });
  const featuredItem: FeaturedItem = {
    kind: "post",
    id: 1,
    href: "/community/1",
    external: false,
    title: "Featured",
    excerpt: "not rendered",
    author: "@author",
    authorHref: "/u/author",
    reason: "Useful",
    editorHandle: "editor",
    featuredAt: new Date("2026-08-12T13:00:00.000Z"),
  };
  const featured = toPublicFeaturedRailDto([featuredItem]);
  const works = toPublicWorksRailDto({
    stats: { works: 1, authors: 1, claimedSum: 500, weeklyNew: 1 },
    agents: [{ agent: "kimi", count: 1 }],
    kinds: [{ kind: "app", count: 1 }],
    top: [work()],
  });
  const awesome = toPublicAwesomeRailDto({
    stats: { items: 1, agents: 1, weeklyNew: 1, recommenders: 1 },
    scopeStats: { base: 1, eco: 0, part: 0 },
    agents: [{ agent: "kimi", count: 1 }],
  });

  assert.deepEqual(featured[0], {
    kind: "post",
    id: 1,
    href: "/community/1",
    external: false,
    title: "Featured",
    reason: "Useful",
    editorHandle: "editor",
  });
  assert.deepEqual(works.top[0], {
    id: 8,
    name: "Small cached row",
    voteCount: 9,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify({ sidebar, featured, works, awesome })),
    { sidebar, featured, works, awesome },
  );
  assert.doesNotMatch(JSON.stringify(featured), /featuredAt|excerpt|authorHref/);
  assert.doesNotMatch(
    JSON.stringify(works.top),
    /descriptionMd|imageKeys|createdAt|visibility/,
  );
});

test("public rail caches use bounded TTLs and purpose-specific tags", () => {
  const source = readFileSync(
    new URL("../src/lib/public-rails-cache.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /unstable_cache/);
  assert.match(source, /PUBLIC_COMMUNITY_RAIL_REVALIDATE_SECONDS = 120/);
  assert.match(source, /PUBLIC_FEATURED_RAIL_REVALIDATE_SECONDS = 300/);
  assert.match(source, /PUBLIC_WORKS_RAIL_REVALIDATE_SECONDS = 120/);
  assert.match(
    source,
    /tags: \[PUBLIC_POSTS_CACHE_TAG, PUBLIC_USERS_CACHE_TAG\]/,
  );
  assert.match(
    source,
    /tags: \[PUBLIC_FEATURED_CACHE_TAG, PUBLIC_USERS_CACHE_TAG\]/,
  );
  assert.equal(
    source.match(/tags: \[PUBLIC_WORKS_CACHE_TAG\]/g)?.length,
    2,
  );
  assert.doesNotMatch(
    source,
    /getSessionUser|getLocale|cookies\(|headers\(|ReactNode/,
  );
});

test("rail renderers keep session, locale, and interactive state outside cache", () => {
  const community = readFileSync(
    new URL(
      "../app/(app)/_components/rail/CommunityWidgets.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const works = readFileSync(
    new URL("../app/(app)/_components/rail/WorksRail.tsx", import.meta.url),
    "utf8",
  );
  const awesome = readFileSync(
    new URL("../app/(app)/_components/rail/AwesomeRail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(community, /getPublicCommunitySidebar\(\)/);
  assert.match(community, /getPublicFeaturedRail\(\)/);
  assert.match(community, /getSessionUser\(\)/);
  assert.match(community, /getUpcomingSummary\(user\?\.id \?\? null\)/);
  assert.match(community, /getUsageLeaderboard\("30d"\)/);
  assert.match(works, /getPublicWorksRail\(\)/);
  assert.match(works, /loggedIn &&/);
  assert.match(awesome, /getPublicAwesomeRail\(\)/);
  assert.match(awesome, /loggedIn &&/);
});

test("featured mutations invalidate their independent tag after successful writes", () => {
  const community = readFileSync(
    new URL("../app/(app)/community/actions.ts", import.meta.url),
    "utf8",
  );
  const works = readFileSync(
    new URL("../app/(app)/works/actions.ts", import.meta.url),
    "utf8",
  );
  for (const [source, actions] of [
    [
      community,
      [
        "updatePostAction",
        "deletePostAction",
        "setPostVisibilityAction",
        "featurePostAction",
        "unfeaturePostAction",
      ],
    ],
    [
      works,
      [
        "updateWorkAction",
        "deleteWorkAction",
        "featureWorkAction",
        "unfeatureWorkAction",
      ],
    ],
  ] as const) {
    for (const action of actions) {
      const start = source.indexOf(`export async function ${action}`);
      const end = source.indexOf("export async function ", start + 1);
      assert.ok(start >= 0, `${action} is present`);
      assert.match(
        source.slice(start, end < 0 ? source.length : end),
        /updateTag\(PUBLIC_FEATURED_CACHE_TAG\)/,
        `${action} invalidates the featured rail`,
      );
    }
  }
  const admin = readFileSync(
    new URL("../app/(app)/admin/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(admin, /type === "post" \|\| type === "work"/);
  assert.match(admin, /updateTag\(PUBLIC_FEATURED_CACHE_TAG\)/);
});
