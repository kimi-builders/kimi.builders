/* @kimi 召唤(20260816)的路由/库级源码断言——与 api-auth-routes.test.ts 同约定:
   断言关键结构顺序,不起服务;逻辑细节由 mention-kimi.test.ts 单测覆盖。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const aiReply = readFileSync(
  new URL("../src/lib/ai-reply.ts", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../app/(app)/community/actions.ts", import.meta.url),
  "utf8",
);

function assertOrder(src: string, a: string, b: string, label: string) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  assert.ok(ia >= 0, `${label}: 缺少 ${a}`);
  assert.ok(ib >= 0, `${label}: 缺少 ${b}`);
  assert.ok(ia < ib, `${label}: ${a} 必须先于 ${b}`);
}

test("enqueue: mention 按触发评论去重,重复 @ 只回一次", () => {
  assertOrder(
    aiReply,
    'kind === "mention" && commentId !== null',
    "INSERT INTO ai_reply_jobs",
    "mention 去重先于入队",
  );
  assert.match(aiReply, /WHERE comment_id = \? AND kind = 'mention'/);
  /* kind 落库:三种任务类型齐备 */
  assert.match(aiReply, /INSERT INTO ai_reply_jobs \(post_id, comment_id, kind\)/);
  assert.match(aiReply, /"auto" \| "chain" \| "mention"/);
});

test("process: mention 走专属 prompt,与 chain/auto 分支清晰", () => {
  assert.match(aiReply, /SYSTEM_PROMPT_MENTION/);
  assert.match(aiReply, /SYSTEM_PROMPT_POST_MENTION/);
  assertOrder(
    aiReply,
    'kind === "mention" ? SYSTEM_PROMPT_MENTION : SYSTEM_PROMPT_COMMENT',
    "INSERT INTO comments",
    "评论召唤 prompt 先于写评论",
  );
});

test("发帖:@kimi 与自动回帖合并(勾选与否都回,合并为 mention 一条)", () => {
  assert.match(actions, /hasKimiMention\(body\)/);
  assertOrder(
    actions,
    "(aiReply || mentioned) && user.aiRepliesEnabled",
    'enqueueAiReply(postId, null, mentioned ? "mention" : "auto")',
    "合并判定先于入队",
  );
});

test("评论召唤:与 chain 互斥、duplicate 不触发、限流先于入队", () => {
  /* chain 分支在前(else if 召唤):回复 AI 且 @kimi 只接话 */
  assertOrder(
    actions,
    'enqueueAiReply(postId, created.id, "chain")',
    'hasKimiMention(body) && user.aiRepliesEnabled',
    "chain 先于 mention",
  );
  const mentionBranch = actions.slice(
    actions.indexOf('hasKimiMention(body) && user.aiRepliesEnabled'),
  );
  assertOrder(
    mentionBranch,
    'consumeCommunityRateLimit(user.id, "ai_summon")',
    'enqueueAiReply(postId, created.id, "mention")',
    "召唤限流先于入队",
  );
  /* 地盘规则:帖主关了 AI → aiDisabled;三态 aiNote 齐备 */
  assert.match(mentionBranch, /aiNote = "aiDisabled"/);
  assert.match(mentionBranch, /aiNote = "rate"/);
  assert.match(mentionBranch, /aiNote = "summoned"/);
});

test("召唤限流额度登记:ai_summon 20/小时", () => {
  const rateLimit = readFileSync(
    new URL("../src/lib/rate-limit.ts", import.meta.url),
    "utf8",
  );
  assert.match(rateLimit, /ai_summon: 20/);
  assert.match(rateLimit, /\| "ai_summon"/);
});

/* ---- PR2:作品/Awesome 评论区召唤 ---- */

test("enqueueAiWorkMention:同 work_comment_id 的 mention 只入队一次", () => {
  const fn = aiReply.slice(aiReply.indexOf("enqueueAiWorkMention"));
  assertOrder(
    fn,
    "WHERE work_comment_id = ? AND kind = 'mention'",
    "INSERT INTO ai_reply_jobs (work_id, work_comment_id, kind)",
    "work 召唤去重先于入队",
  );
});

test("processAiReply 双目标:work 任务(post_id NULL)LEFT JOIN 后单独分支,post 分支不变", () => {
  assert.match(aiReply, /LEFT JOIN posts p ON p\.id = j\.post_id/);
  /* work 分支在 post 开关检查之前分流,post 侧 gating 不被 work 任务误触 */
  assertOrder(
    aiReply,
    "job.work_id !== null",
    "if (!job.ai_reply || !job.ai_replies_enabled)",
    "work 分流先于 post 开关检查",
  );
});

test("work 召唤执行:专属 prompt、≤50 封顶先于写入、AI 评论 is_ai=1 + user_id NULL", () => {
  assert.match(aiReply, /SYSTEM_PROMPT_WORK_MENTION/);
  assert.match(aiReply, /MAX_AI_WORK_COMMENTS = 50/);
  const fn = aiReply.slice(aiReply.indexOf("processAiWorkMention"));
  assertOrder(
    fn,
    "COUNT(*) AS n FROM work_comments WHERE work_id = ? AND is_ai = 1",
    "INSERT INTO work_comments (work_id, user_id, is_ai, body) VALUES (?, NULL, 1, ?)",
    "50 条上限判定先于 AI 评论写入",
  );
  /* 冗余计数 + 通知(召唤触发者 + 作品作者)随写路径维护 */
  assertOrder(
    fn,
    "UPDATE works SET comment_count = comment_count + 1",
    "notifyOnWorkComment({",
    "计数维护先于通知",
  );
});

test("work gating:works.user_id NULL 的 awesome 站外条目跳过作者检查", () => {
  assert.match(aiReply, /export function aiWorkReplySwitchesAllow/);
  /* 无作者(null)→ 只看作品开关;有作者 → 作者全局开关一并参与 */
  const fn = aiReply.slice(aiReply.indexOf("aiWorkReplySwitchesAllow"));
  assert.match(fn, /authorEnabled === null/);
  const exec = aiReply.slice(aiReply.indexOf("async function processAiWorkMention"));
  assertOrder(
    exec,
    "work.user_id === null ? null : work.ai_replies_enabled",
    'mark("skipped", "ai reply disabled")',
    "站外条目放行逻辑在执行侧 gating",
  );
});

test("recoverAiReplyJobs 双目标:开关检查同时覆盖 post 与 work 任务", () => {
  const fn = aiReply.slice(aiReply.indexOf("export async function recoverAiReplyJobs"));
  assert.match(fn, /LEFT JOIN works w ON w\.id = j\.work_id/);
  assert.match(fn, /aiWorkReplySwitchesAllow\(\{/);
  assert.match(fn, /aiReplySwitchesAllow\(\{/);
});

test("aiWorkReplySwitchesAllow 行为:开关矩阵(纯函数)", async () => {
  const { aiWorkReplySwitchesAllow } = await import("../src/lib/ai-reply");
  /* 作品关 → 恒不回 */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 0, authorEnabled: 1 }),
    false,
  );
  /* 作品开 + 作者关 → 不回 */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 1, authorEnabled: 0 }),
    false,
  );
  /* 作品开 + 作者开 → 回 */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 1, authorEnabled: 1 }),
    true,
  );
  /* 站外条目(无作者,null)→ 只看作品开关 */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 1, authorEnabled: null }),
    true,
  );
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 0, authorEnabled: null }),
    false,
  );
});
