import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 作品 action 门禁(源码断言,同 community-action-guards 模式):
   @kimi 召唤(20260816 PR2)——召唤分支在 duplicate 守卫内、门禁先于限流、
   限流先于入队、三态 aiNote 齐备;删除 action 把治理标记透传到 SQL 层。 */

const actions = readFileSync(
  new URL("../app/(app)/works/actions.ts", import.meta.url),
  "utf8",
);

function actionSource(name: string, nextName: string): string {
  const start = actions.indexOf(`export async function ${name}`);
  const end = actions.indexOf(`export async function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} source is present`);
  return actions.slice(start, end);
}

function assertOrder(src: string, a: string, b: string, label: string) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  assert.ok(ia >= 0, `${label}: 缺少 ${a}`);
  assert.ok(ib >= 0, `${label}: 缺少 ${b}`);
  assert.ok(ia < ib, `${label}: ${a} 必须先于 ${b}`);
}

test("comment action keeps the visibility gate before any write", () => {
  const src = actionSource("createWorkCommentAction", "deleteWorkCommentAction");
  assertOrder(
    src,
    "canViewWork(work, user)",
    "createWorkComment(workId, user.id, body)",
    "可见性门禁先于写库",
  );
});

test("summon branch stays behind the duplicate guard", () => {
  const src = actionSource("createWorkCommentAction", "deleteWorkCommentAction");
  /* duplicate(60s 同人同文命中)不再触发召唤——网络重试不刷双倍 AI 回复 */
  assert.match(
    src,
    /!created\.duplicate && hasKimiMention\(body\) && user\.aiRepliesEnabled/,
  );
  assertOrder(
    src,
    "createWorkComment(workId, user.id, body)",
    "hasKimiMention(body)",
    "写库(去重)先于召唤判定",
  );
});

test("summon gating order: work switch → rate limit → enqueue; three aiNote states", () => {
  const src = actionSource("createWorkCommentAction", "deleteWorkCommentAction");
  const branch = src.slice(src.indexOf("hasKimiMention(body)"));
  /* 地盘规则:作品关了 AI 参与 → aiDisabled,不烧召唤配额 */
  assertOrder(
    branch,
    'aiNote = "aiDisabled"',
    'consumeCommunityRateLimit(user.id, "ai_summon")',
    "作品开关判定先于限流",
  );
  assertOrder(
    branch,
    'consumeCommunityRateLimit(user.id, "ai_summon")',
    "enqueueAiWorkMention(workId, created.id)",
    "限流先于入队",
  );
  assert.match(branch, /aiNote = "rate"/);
  assert.match(branch, /aiNote = "summoned"/);
  /* MutationResult 与社区同形:aiNote 三态 */
  assert.match(actions, /aiNote\?: "summoned" \| "aiDisabled" \| "rate"/);
});

test("delete comment action passes the moderator flag down to the SQL layer", () => {
  const src = actionSource("deleteWorkCommentAction", "loadMoreWorkCommentsAction");
  assert.match(src, /canModerate\(user\.role\)/);
  assert.match(src, /deleteWorkComment\(user\.id, commentId, \{/);
});

test("work form fields parse the ai_reply checkbox (default off when absent)", () => {
  assert.match(actions, /aiReply: formData\.get\("ai_reply"\) === "on"/);
});
