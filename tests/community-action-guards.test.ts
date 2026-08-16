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

/* @kimi 召唤(20260816):duplicate 评论不得触发任何 AI 任务(chain/mention 都在
   !created.duplicate 分支内),召唤三态 aiNote 返回给客户端 */
test("comment action: AI triggers stay behind the duplicate guard", () => {
  const src = actionSource("createCommentAction", "loadMoreCommentsAction");
  const chainIdx = src.indexOf("!created.duplicate && parent?.isAi");
  const mentionIdx = src.indexOf("!created.duplicate && hasKimiMention(body)");
  assert.ok(chainIdx >= 0, "chain 分支带 duplicate 守卫");
  assert.ok(mentionIdx >= 0, "mention 分支带 duplicate 守卫");
  assert.ok(chainIdx < mentionIdx, "chain 与 mention 互斥(chain 优先)");
});
