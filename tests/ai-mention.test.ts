/* Source assertions for @kimi summons at the route/lib level — same
   convention as api-auth-routes.test.ts: assert key structural order,
   start no server; logic details are covered by mention-kimi.test.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Pool } from "mysql2/promise";

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
  /* kind lands in the DB: all three job types present. */
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
  /* The chain branch comes first (else-if summon): replying to AI
     with an @kimi just continues the thread. */
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
  /* Territory rule: the owner's AI off -> aiDisabled; all three
     aiNote states present. */
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

/* ---- PR2: summons in work/Awesome comment sections ---- */

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
  /* The work branch forks before the post switch check, so post-side
     gating never misfires on work jobs. */
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
  /* Redundant counters + notifications (the summoner + the work
     author) follow the write path. */
  assertOrder(
    fn,
    "UPDATE works SET comment_count = comment_count + 1",
    "notifyOnWorkComment({",
    "计数维护先于通知",
  );
});

test("work gating:works.user_id NULL 的 awesome 站外条目跳过作者检查", () => {
  assert.match(aiReply, /export function aiWorkReplySwitchesAllow/);
  /* No author (null) -> the work switch alone; with an author, the
     author's global switch joins in. */
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
  /* Work switch off -> never replies. */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 0, authorEnabled: 1 }),
    false,
  );
  /* Work on + author off -> no reply. */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 1, authorEnabled: 0 }),
    false,
  );
  /* Work on + author on -> replies. */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 1, authorEnabled: 1 }),
    true,
  );
  /* External entries (no author, null) -> the work switch alone. */
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 1, authorEnabled: null }),
    true,
  );
  assert.equal(
    aiWorkReplySwitchesAllow({ aiReply: 0, authorEnabled: null }),
    false,
  );
});

/* ---- Summon status / unread-count polling endpoints ---- */

test("status 路由:登录门禁 + 召唤者约束 + 只查 mention 任务 + no-store", () => {
  const src = readFileSync(
    new URL("../app/api/ai-reply/status/route.ts", import.meta.url),
    "utf8",
  );
  assertOrder(src, "getSessionUser()", "getPool()", "会话先于查询");
  assert.match(src, /c\.user_id = \?/);
  assert.match(src, /\[userId, target\.id\]/);
  assert.match(src, /kind = 'mention'/);
  assert.match(src, /Cache-Control/);
});

test("status 路由:帖子与作品均只向召唤者返回任务状态", async () => {
  const { findMentionJobState } = await import("../app/api/ai-reply/status/route");
  const fixtures = {
    comments: { id: 41, ownerId: 7, status: "done" },
    work_comments: { id: 52, ownerId: 9, status: "pending" },
  } as const;
  const db = {
    async query(sql: string, values: unknown[]) {
      assert.match(sql, /c\.user_id = \?/);
      const table = sql.includes("JOIN work_comments") ? "work_comments" : "comments";
      const fixture = fixtures[table];
      const [userId, id] = values.map(Number);
      const rows = userId === fixture.ownerId && id === fixture.id
        ? [{ status: fixture.status }]
        : [];
      return [rows, []];
    },
  } as unknown as Pick<Pool, "query">;

  assert.equal(
    await findMentionJobState(db, 7, { kind: "post", id: 41 }),
    "done",
  );
  assert.equal(
    await findMentionJobState(db, 8, { kind: "post", id: 41 }),
    "none",
  );
  assert.equal(
    await findMentionJobState(db, 9, { kind: "work", id: 52 }),
    "pending",
  );
  assert.equal(
    await findMentionJobState(db, 10, { kind: "work", id: 52 }),
    "none",
  );
});

test("unread 路由:登录门禁 + 未读计数来源", () => {
  const src = readFileSync(
    new URL("../app/api/notifications/unread/route.ts", import.meta.url),
    "utf8",
  );
  assertOrder(src, "getSessionUser()", "getUnreadNotificationCount(", "会话先于计数");
});

/* ---- Target-liveness predicates + single-transaction writes ---- */

test("认领查询带存活谓词(纯函数钉形态):posts deleted/hidden;works hidden+public", async () => {
  const { aiReplyPostClaimSql, aiReplyWorkClaimSql } = await import("../src/lib/ai-reply");
  const post = aiReplyPostClaimSql();
  assert.match(
    post,
    /LEFT JOIN posts p ON p\.id = j\.post_id\s+AND p\.deleted_at IS NULL AND p\.hidden_at IS NULL/,
  );
  /* The post_alive flag distinguishes "target not visible" from
     "switched off". */
  assert.match(post, /AS post_alive/);
  const work = aiReplyWorkClaimSql();
  assert.match(
    work,
    /WHERE w\.id = \? AND w\.hidden_at IS NULL AND w\.visibility = 'public' LIMIT 1/,
  );
});

test("不可见目标跳过:post/work 分支各自给出准确的 skipped 理由", () => {
  const fn = aiReply.slice(aiReply.indexOf("export async function processAiReply"));
  assertOrder(
    fn,
    "!job.post_alive",
    'mark("skipped", "post gone or hidden")',
    "post 存活检查先于跳过",
  );
  assert.match(aiReply, /mark\("skipped", "work gone or not public"\)/);
});

test("写路径单事务:插入+计数+done 同 commit,通知移到 commit 后", () => {
  const helper = aiReply.slice(aiReply.indexOf("async function commitAiReplyWrite"));
  assert.match(helper, /beginTransaction/);
  assert.match(helper, /rollback/);
  assert.match(helper, /conn\.release\(\)/);
  /* done only lands via the in-transaction UPDATE (three write paths);
     the bare mark("done") is gone. */
  assert.equal(aiReply.match(/SET status = 'done'/g)?.length ?? 0, 3);
  assert.doesNotMatch(aiReply, /mark\("done"\)/);
  const branches: [string, string][] = [
    ["INSERT INTO comments (post_id, parent_id, user_id, is_ai, body_md)", "notifyOnComment({"],
    ["INSERT INTO comments (post_id, user_id, is_ai, body_md)", "notifyOnComment({"],
    ["INSERT INTO work_comments (work_id, user_id, is_ai, body)", "notifyOnWorkComment({"],
  ];
  for (const [anchor, notify] of branches) {
    const branch = aiReply.slice(aiReply.indexOf(anchor));
    assert.ok(branch.length > 0, anchor);
    /* done commits inside the same transaction callback as the insert,
       before the out-of-transaction notification. */
    assertOrder(branch, "SET status = 'done'", notify, "done 与插入同事务,先于通知");
    assertOrder(branch, "});", notify, "事务回调先于通知");
  }
});

test("等待反馈接线:两个评论表单都轮询且都渲染占位行", () => {
  for (const p of [
    "../app/(app)/community/_components/CommentSection.tsx",
    "../app/(app)/works/_components/WorkCommentForm.tsx",
  ]) {
    const src = readFileSync(new URL(p, import.meta.url), "utf8");
    assert.match(src, /useSummonPending/, p);
    assert.match(src, /SummonPendingRow/, p);
  }
});
