import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync(
  new URL("../app/(app)/community/actions.ts", import.meta.url),
  "utf8",
);

function actionSource(name: string, nextName: string): string {
  const start = actions.indexOf(`export async function ${name}`);
  const end = actions.indexOf(`export async function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source is present`);
  return actions.slice(start, end);
}

test("all post-targeting community actions retain the shared visibility gate", () => {
  assert.match(
    actionSource("createCommentAction", "loadMoreCommentsAction"),
    /getVisiblePostAccess\(postId, user\)/,
  );
  assert.match(
    actionSource("loadMoreCommentsAction", "loadMorePostsAction"),
    /getVisiblePostAccess\(postId, user\)/,
  );
  assert.match(
    actionSource("setPostReactionAction", "setCommentReactionAction"),
    /getVisiblePostAccess\(postId, user\)/,
  );
  assert.match(
    actionSource("setCommentReactionAction", "toggleSubscribeAction"),
    /getVisibleCommentAccess\(commentId, user\)/,
  );
  assert.match(
    actionSource("toggleSubscribeAction", "votePollAction"),
    /getVisiblePostAccess\(postId, user\)/,
  );
  assert.match(
    actionSource("votePollAction", "updatePostAction"),
    /getVisiblePostAccess\(postId, user\)/,
  );
});

test("write actions call transaction-backed guarded mutations after preflight", () => {
  assert.match(actions, /createCommentForVisiblePost\(user, postId, body, parentId\)/);
  assert.match(actions, /setPostReactionForViewer\(user, postId, kind\)/);
  assert.match(actions, /setCommentReactionForViewer\(user, commentId, kind\)/);
  assert.match(actions, /toggleSubscribeForViewer\(user, postId\)/);
  assert.match(actions, /votePollForViewer\(user, postId, optionId\)/);
});
