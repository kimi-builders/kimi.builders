import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLAPSED_REPLY_LIMIT,
  readCommunityDraft,
  visibleReplyCount,
  writeCommunityDraft,
} from "../src/lib/community-draft";

test("community drafts round-trip and retain the authored fields", () => {
  const raw = writeCommunityDraft({
    type: "poll",
    category: "feedback",
    title: "Ship it?",
    linkUrl: "",
    body: "Context",
    options: ["Yes", "Not yet"],
  }, 123);
  assert.deepEqual(readCommunityDraft(raw), {
    version: 1,
    type: "poll",
    category: "feedback",
    title: "Ship it?",
    linkUrl: "",
    body: "Context",
    options: ["Yes", "Not yet"],
    savedAt: 123,
  });
});

test("community drafts reject malformed or unsupported payloads", () => {
  assert.equal(readCommunityDraft("not-json"), null);
  assert.equal(readCommunityDraft(JSON.stringify({ version: 2, type: "text" })), null);
  assert.equal(readCommunityDraft(JSON.stringify({ version: 1, type: "video", category: "chat", savedAt: 1 })), null);
});

test("reply groups expose a compact first set until expanded", () => {
  assert.equal(visibleReplyCount(10, false), COLLAPSED_REPLY_LIMIT);
  assert.equal(visibleReplyCount(2, false), 2);
  assert.equal(visibleReplyCount(10, true), 10);
  assert.equal(visibleReplyCount(-2, false), 0);
});
