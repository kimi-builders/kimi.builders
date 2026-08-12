import assert from "node:assert/strict";
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
