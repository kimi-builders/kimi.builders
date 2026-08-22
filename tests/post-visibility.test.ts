import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canViewPost, postMetadataTitle } from "../src/lib/posts";

const publicPost = {
  visibility: "public",
  userId: 7,
  hiddenAt: null,
  title: "Public title",
  bodyMd: "Public body",
};

test("private post: only its author can view it or receive its metadata title", () => {
  const post = { ...publicPost, visibility: "private", title: "PRIVATE-SENTINEL" };
  assert.equal(canViewPost(post, null), false);
  assert.equal(canViewPost(post, { id: 9, role: "member" }), false);
  assert.equal(canViewPost(post, { id: 9, role: "admin" }), false);
  assert.equal(postMetadataTitle(post, null), "kimi.builders");
  assert.doesNotMatch(postMetadataTitle(post, null), /PRIVATE-SENTINEL/);
  assert.equal(canViewPost(post, { id: 7, role: "member" }), true);
  assert.equal(postMetadataTitle(post, { id: 7, role: "member" }), "PRIVATE-SENTINEL — kimi.builders");
});

test("hidden post: author and management can view it, other viewers get generic metadata", () => {
  const post = {
    ...publicPost,
    hiddenAt: new Date("2026-08-12T00:00:00Z"),
    title: "HIDDEN-SENTINEL",
  };
  assert.equal(canViewPost(post, null), false);
  assert.equal(canViewPost(post, { id: 9, role: "member" }), false);
  assert.equal(postMetadataTitle(post, { id: 9, role: "member" }), "kimi.builders");
  assert.doesNotMatch(postMetadataTitle(post, null), /HIDDEN-SENTINEL/);
  assert.equal(canViewPost(post, { id: 7, role: "member" }), true);
  assert.equal(canViewPost(post, { id: 9, role: "mod" }), true);
  assert.equal(canViewPost(post, { id: 9, role: "admin" }), true);
});

test("public post remains visible and untitled posts use a plain body excerpt", () => {
  assert.equal(canViewPost(publicPost, null), true);
  assert.equal(postMetadataTitle(publicPost, null), "Public title — kimi.builders");
  assert.equal(
    postMetadataTitle({ ...publicPost, title: "", bodyMd: "**Readable** body" }, null),
    "Readable body — kimi.builders",
  );
});

/* ---- Post body cap (action-layer error + lib-layer slice backstop)
   ---- */

test("POST_BODY_MAX = 100k,create/update 两处写路径都按它 slice 兜底", async () => {
  const { POST_BODY_MAX } = await import("../src/lib/posts");
  assert.equal(POST_BODY_MAX, 100_000);
  const lib = readFileSync(new URL("../src/lib/posts.ts", import.meta.url), "utf8");
  assert.equal(lib.match(/\.slice\(0, POST_BODY_MAX\)/g)?.length ?? 0, 2);
  /* The action layer errors with the same rule: one site each for create
     + edit. */
  const actions = readFileSync(
    new URL("../app/(app)/community/actions.ts", import.meta.url),
    "utf8",
  );
  assert.equal(actions.match(/body\.length > POST_BODY_MAX/g)?.length ?? 0, 2);
  assert.match(actions, /err\.bodyLong/);
});

test("作品创建限流(20260822 P1-5):work 档 10/小时,写库前消耗", async () => {
  const { COMMUNITY_RATE_LIMITS, communityRateScope } = await import("../src/lib/rate-limit");
  assert.equal(COMMUNITY_RATE_LIMITS.work, 10);
  assert.equal(communityRateScope("work"), "community:work");
  const actions = readFileSync(
    new URL("../app/(app)/works/actions.ts", import.meta.url),
    "utf8",
  );
  const create = actions.slice(actions.indexOf("export async function createWorkAction"));
  assert.ok(create.indexOf('consumeCommunityRateLimit(user.id, "work")') >= 0);
  /* The rate-limit consumption precedes the write. */
  assert.ok(
    create.indexOf('consumeCommunityRateLimit(user.id, "work")') <
      create.indexOf("await createWork(user.id"),
  );
  assert.match(actions, /err\.rateWork/);
});
