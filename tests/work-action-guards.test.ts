import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Work action guards (source assertions, the community-action-guards
   pattern): @kimi summons — the summon branch sits behind the duplicate
   guard, the gate precedes the rate limit, the rate limit precedes
   enqueue, all three aiNote states exist; the delete action passes the
   moderator flag down to SQL. */

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

test("comment action: 可见性门禁收进 withVisibleWorkLock 事务,不再先查后写", () => {
  const src = actionSource("createWorkCommentAction", "deleteWorkCommentAction");
  /* Check and write share one lock (works.ts); the action only sees a
     null result. */
  assert.match(src, /createWorkComment\(user, workId, body\)/);
  assert.match(src, /if \(!created\) return \{ ok: false, error: t\(locale, "err\.generic"\) \}/);
  assert.doesNotMatch(src, /canViewWork\(work, user\)/);
  const lib = readFileSync(new URL("../src/lib/works.ts", import.meta.url), "utf8");
  const fn = lib.slice(lib.indexOf("export async function createWorkComment"));
  assertOrder(fn, "withVisibleWorkLock(workId, viewer", "workCommentInsertQuery", "锁定判定先于插入");
});

test("summon branch stays behind the duplicate guard", () => {
  const src = actionSource("createWorkCommentAction", "deleteWorkCommentAction");
  /* A duplicate (60s same-user same-text hit) never triggers a summon —
     a network retry must not double the AI replies. */
  assert.match(
    src,
    /!created\.duplicate && hasKimiMention\(body\) && user\.aiRepliesEnabled/,
  );
  assertOrder(
    src,
    "createWorkComment(user, workId, body)",
    "hasKimiMention(body)",
    "写库(去重)先于召唤判定",
  );
});

test("summon gating order: work switch → rate limit → enqueue; three aiNote states", () => {
  const src = actionSource("createWorkCommentAction", "deleteWorkCommentAction");
  const branch = src.slice(src.indexOf("hasKimiMention(body)"));
  /* Territory rule: AI participation off on the work -> aiDisabled,
     burning no summon quota. */
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
  /* MutationResult matches the community shape: three aiNote states. */
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
