/* AI replies: new posts / comments landing in the DB queue ai_reply_jobs,
   an after() callback calls the Kimi (Moonshot) API, and the reply lands
   in comments as the bot (is_ai=1, user_id NULL). Job kinds:
   - auto    = automatic reply to a new post;
   - chain   = follow-up when someone replies to an AI comment (dialog-chain
               context; the AI politely stops after MAX_AI_CHAIN turns to
               avoid infinite self-talk);
   - mention = an explicit @kimi summon. comment_id NULL + summon phrase in
               the body = post summon (merged with the auto reply — no
               separate auto job); comment_id set = comment summon (answers
               the @-ed comment, chain context as chain); work_id set (PR2)
               = summon in a work/Awesome comment section, writing
               work_comments with context = name/tagline/kind/agents + a
               description_md excerpt + up to 10 comments before the
               trigger, capped at MAX_AI_WORK_COMMENTS per work.
   Two-level switches are checked twice — at enqueue (post/comment actions)
   and here before execution: a post with ai_reply=0 or an author who
   disabled ai_replies_enabled is skipped (territory rule: when the owner
   turns AI participation off, summons inside their content are ignored).
   Works mirror this: works.ai_reply + the author's ai_replies_enabled;
   awesome external entries (works.user_id NULL) have no territory owner,
   so only the work switch applies.
   Target liveness: deleted/hidden posts and non-public works get no reply
   (predicates inlined in the claim SQL, extracted as pure functions in
   aiReplyPostClaimSql / aiReplyWorkClaimSql); comment insert + counters +
   mark('done') commit in one transaction — a crash rolls everything back
   and leaves the job pending for retry, never duplicating a comment;
   notifications always fire after commit.
   Failure recovery: after() can be killed, so /api/cron/ai-reply-retry
   periodically calls recoverAiReplyJobs (exponential backoff, capped at
   AI_REPLY_MAX_ATTEMPTS); single jobs can also be rerun manually via
   retryAiReplyJob (scripts/ai-reply-retry.ts).
   after() is imported dynamically: this file must stay importable by
   plain Node scripts outside Next (manual reruns) — a top-level static
   import of "next/server" does not resolve under bare Node. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db";
import { notifyOnComment } from "./posts";
import { notifyOnWorkComment } from "./works";

/* Identity constants are defined once in ./bot-identity (client-safe);
   re-exported here for legacy imports. */
export { BOT_AVATAR, BOT_NAME } from "./bot-identity";
import { BOT_NAME } from "./bot-identity";

/* Max AI turns per dialog chain (at the cap it stops at the last
   message). */
const MAX_AI_CHAIN = 8;

/* Total AI comments allowed per work comment section: keeps a single
   work from being flooded. */
export const MAX_AI_WORK_COMMENTS = 50;

const SYSTEM_PROMPT = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的非商业 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。你在社区里回帖,规则:
- {LANG_RULE}
- 像一位懂 Kimi 产品、也懂工程的老群友:直接、具体、有帮助;
- 不要「你好呀」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;
- 求助帖给可执行的下一步;晒作品帖给一个真诚点评加一个延伸建议;闲聊帖自然接话;
- 拿不准就说不确定,不编造。`;

/* Chain-reply prompt: useful, interesting, friendly, valuable; grounded
   in the post and the dialog chain. */
const SYSTEM_PROMPT_COMMENT = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的非商业 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。现在你在一条评论对话里接话,规则:
- {LANG_RULE}
- 结合帖子内容和对话链回应最后一条:给有效、具体的信息,或真诚有价值的观点;
- 语气友好自然,像老朋友接话;可以适度幽默,但别油、别强行玩梗;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 220 字;对方只是闲聊就轻松接住,不必强行给建议;
- 拿不准就说不确定,不编造。`;

/* Comment-summon prompt: the user asked @kimi explicitly — answer the
   question itself. */
const SYSTEM_PROMPT_MENTION = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的非商业 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。有用户在评论里 @ 了你并提问,规则:
- {LANG_RULE}
- 优先直接回答最后一条评论(召唤你的那条)里的问题:先给答案,再给依据或下一步;
- 开头用「@对方名字」称呼召唤你的人(对话链最后一条的作者名);
- 结合帖子内容与对话链,别答非所问;问题与帖子无关也照常回答,但可以一句带过;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;给可执行的下一步;拿不准就说不确定,不编造。`;

/* Post-summon prompt: the author @-ed kimi in a new post; respond to the
   post and prioritize the @-ed question; merged with the auto reply,
   never a second message. */
const SYSTEM_PROMPT_POST_MENTION = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的非商业 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。作者发帖时在正文里 @ 了你,规则:
- {LANG_RULE}
- 重点回答正文里 @ 你之后提出的问题:先给答案,再给依据或可执行的下一步;
- 开头用「@作者」称呼(作者名见下方「作者」一行);
- 顺带回应帖子本身(一个真诚观点或建议),两部分自然衔接成一条回复;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 300 字;拿不准就说不确定,不编造。`;

/* Work-comment summon prompt: review/answer tone for @kimi in a work
   comment section. */
const SYSTEM_PROMPT_WORK_MENTION = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的非商业 builder 社区(非官方),成员在这里展示用 Kimi 构建的作品。有用户在作品评论区 @ 了你,规则:
- {LANG_RULE}
- 优先回应召唤你的那条评论:提问就先给答案再给依据;求点评就给一个真诚具体的点评加一个延伸建议;
- 开头用「@对方名字」称呼召唤你的人(对话链最后一条的作者名);
- 结合作品介绍与已有评论,别答非所问;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;拿不准就说不确定,不编造。`;

/* Reply language priority: the account language (set when switching UI
   language) > content language > default Chinese. */
function replyLang(job: { locale?: string; content?: string }): "zh" | "en" {
  if (job.locale === "zh" || job.locale === "en") return job.locale;
  if (job.content && !/[一-鿿]/.test(job.content)) return "en";
  return "zh";
}

export type AiReplyKind = "auto" | "chain" | "mention";

/* Called from server actions: enqueue the job and schedule execution
   after the response. commentId set = a comment triggered it (chain: its
   direct parent is an AI comment; mention: the comment summons @kimi).
   Kind semantics in the file header. mention jobs dedupe by trigger
   comment: repeated @ in the same comment gets one reply. */
export async function enqueueAiReply(
  postId: number,
  commentId: number | null = null,
  kind: AiReplyKind = "auto",
): Promise<void> {
  if (kind === "mention" && commentId !== null) {
    const [dup] = await getPool().query<RowDataPacket[]>(
      "SELECT id FROM ai_reply_jobs WHERE comment_id = ? AND kind = 'mention' LIMIT 1",
      [commentId],
    );
    if (dup.length > 0) return;
  }
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO ai_reply_jobs (post_id, comment_id, kind) VALUES (?, ?, ?)",
    [postId, commentId, kind],
  );
  const jobId = Number(res.insertId);
  const { after } = await import("next/server");
  after(() => processAiReply(jobId));
}

/* Work/Awesome comment summon: called by createWorkCommentAction when a
   comment @-s kimi. Deduped like the post side: one job per work
   comment. */
export async function enqueueAiWorkMention(
  workId: number,
  workCommentId: number,
): Promise<void> {
  const [dup] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM ai_reply_jobs WHERE work_comment_id = ? AND kind = 'mention' LIMIT 1",
    [workCommentId],
  );
  if (dup.length > 0) return;
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO ai_reply_jobs (work_id, work_comment_id, kind) VALUES (?, ?, 'mention')",
    [workId, workCommentId],
  );
  const jobId = Number(res.insertId);
  const { after } = await import("next/server");
  after(() => processAiReply(jobId));
}

interface ChainEntry {
  author: string;
  isAi: boolean;
  body: string;
}

/* Walk from the trigger comment up the parent chain to the root; return
   the ordered dialog root -> ... -> trigger (with a truncation guard). */
async function getCommentChain(
  triggerCommentId: number,
): Promise<{ chain: ChainEntry[]; aiCount: number } | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT c.id, c.parent_id, c.is_ai, c.body_md, u.handle
     FROM comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.id IN (
       SELECT id FROM comments WHERE post_id = (SELECT post_id FROM comments WHERE id = ?) AND deleted_at IS NULL
     ) ORDER BY c.created_at ASC`,
    [triggerCommentId],
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  let cur = byId.get(triggerCommentId);
  if (!cur) return null;
  const chain: ChainEntry[] = [];
  const seen = new Set<number>();
  while (cur && !seen.has(Number(cur.id))) {
    seen.add(Number(cur.id));
    chain.unshift({
      author: cur.is_ai ? BOT_NAME : `@${cur.handle}`,
      isAi: !!cur.is_ai,
      body: String(cur.body_md).slice(0, 500),
    });
    cur = cur.parent_id === null ? undefined : byId.get(Number(cur.parent_id));
  }
  return { chain, aiCount: chain.filter((e) => e.isAi).length };
}

/* Claim query (extracted for pinning): the post liveness predicate lives
   inline in the JOIN — deleted (deleted_at) or hidden (hidden_at) posts
   get no reply; private posts still do (the author's territory, matching
   the enqueue side). The post_alive flag distinguishes "target not
   visible" (JOIN misses, p.* all NULL) from "switched off", so the
   skipped reason is accurate. */
export function aiReplyPostClaimSql(): string {
  return `SELECT j.post_id, j.comment_id, j.kind, j.work_id, j.work_comment_id,
              p.title, p.body_md, p.category, p.ai_reply,
              p.lang AS post_lang, u.ai_replies_enabled, u.locale, u.handle AS author_handle,
              (p.id IS NOT NULL) AS post_alive
       FROM ai_reply_jobs j
       LEFT JOIN posts p ON p.id = j.post_id
            AND p.deleted_at IS NULL AND p.hidden_at IS NULL
       LEFT JOIN users u ON u.id = p.user_id
       WHERE j.id = ? AND j.status = 'pending' LIMIT 1`;
}

/* Single-transaction write path: comment insert + redundant counters +
   mark('done') in one commit; any crash rolls back wholly and leaves the
   job pending (retry covers it — no duplicated comments); notifications
   fire only after commit (a rollback must never notify). */
async function commitAiReplyWrite(
  writes: (conn: PoolConnection) => Promise<unknown>,
): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await writes(conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function processAiReply(jobId: number): Promise<void> {
  const pool = getPool();
  /* done only lands via the in-transaction UPDATE; only skipped/failed
     exit here. */
  const mark = (status: "failed" | "skipped", error = "") =>
    pool.query(
      "UPDATE ai_reply_jobs SET status = ?, error = ?, processed_at = NOW() WHERE id = ?",
      [status, error.slice(0, 500), jobId],
    );
  try {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      await mark("skipped", "KIMI_API_KEY not set");
      return;
    }
    /* Work jobs carry NULL post_id (PR2): the JOIN relaxes to LEFT and
       also carries the work target columns; the post branch keeps its
       semantics (FK-backed — post jobs always join). */
    const [rows] = await pool.query<RowDataPacket[]>(aiReplyPostClaimSql(), [jobId]);
    const job = rows[0];
    if (!job) return;
    if (job.work_id !== null && job.work_id !== undefined) {
      await processAiWorkMention(
        jobId,
        apiKey,
        Number(job.work_id),
        Number(job.work_comment_id),
      );
      return;
    }
    /* Target not visible: the post was deleted/hidden after enqueue; the
       JOIN misses. */
    if (!job.post_alive) {
      await mark("skipped", "post gone or hidden");
      return;
    }
    if (!job.ai_reply || !job.ai_replies_enabled) {
      await mark("skipped", "ai reply disabled");
      return;
    }

    const triggerCommentId: number | null =
      job.comment_id === null ? null : Number(job.comment_id);
    const kind: AiReplyKind =
      job.kind === "chain" || job.kind === "mention" ? job.kind : "auto";

    if (triggerCommentId) {
      /* ---- Comment-triggered: chain = follow-up / mention = summon,
         sharing the chain context ---- */
      const got = await getCommentChain(triggerCommentId);
      if (!got) {
        await mark("skipped", "trigger comment gone");
        return;
      }
      if (got.aiCount >= MAX_AI_CHAIN) {
        await mark("skipped", "ai chain depth cap");
        return;
      }
      /* Language: the trigger's (last author's) account preference >
         their comment's language > Chinese. */
      const [cu] = await pool.query<RowDataPacket[]>(
        `SELECT u.locale FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
        [triggerCommentId],
      );
      const last = got.chain[got.chain.length - 1];
      const lang = replyLang({ locale: cu[0]?.locale, content: last?.body });
      const convo = got.chain
        .map((e) => `${e.author}${e.isAi ? "(你)" : ""}:${e.body}`)
        .join("\n");
      const reply = await callKimi(
        apiKey,
        kind === "mention" ? SYSTEM_PROMPT_MENTION : SYSTEM_PROMPT_COMMENT,
        lang,
        {
          category: job.category,
          title: job.title,
          body: String(job.body_md ?? "").slice(0, 2000),
          convo,
        },
      );
      let replyCommentId = 0;
      await commitAiReplyWrite(async (conn) => {
        const [ins] = await conn.query<ResultSetHeader>(
          "INSERT INTO comments (post_id, parent_id, user_id, is_ai, body_md) VALUES (?, ?, NULL, 1, ?)",
          [job.post_id, triggerCommentId, reply.slice(0, 5000)],
        );
        replyCommentId = Number(ins.insertId);
        await conn.query(
          "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
          [job.post_id],
        );
        await conn.query(
          "UPDATE ai_reply_jobs SET status = 'done', error = '', processed_at = NOW() WHERE id = ?",
          [jobId],
        );
      });
      await notifyOnComment({
        postId: Number(job.post_id),
        commentId: replyCommentId,
        actorId: null,
        parentId: triggerCommentId,
      });
      return;
    }

    /* ---- Top-level reply: auto = regular / mention = post summon (body
       @kimi) ---- */
    const reply = await callKimi(
      apiKey,
      kind === "mention" ? SYSTEM_PROMPT_POST_MENTION : SYSTEM_PROMPT,
      replyLang({ locale: job.locale, content: job.title + job.body_md }),
      {
        category: job.category,
        title: job.title,
        body: String(job.body_md ?? "").slice(0, 4000),
        convo: null,
        /* Post summon: include the author name; the prompt opens with an
           @ back to them. */
        author:
          kind === "mention" && job.author_handle
            ? `@${job.author_handle}`
            : undefined,
      },
    );
    let replyCommentId = 0;
    await commitAiReplyWrite(async (conn) => {
      const [ins] = await conn.query<ResultSetHeader>(
        "INSERT INTO comments (post_id, user_id, is_ai, body_md) VALUES (?, NULL, 1, ?)",
        [job.post_id, reply.slice(0, 5000)],
      );
      replyCommentId = Number(ins.insertId);
      await conn.query(
        "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
        [job.post_id],
      );
      await conn.query(
        "UPDATE ai_reply_jobs SET status = 'done', error = '', processed_at = NOW() WHERE id = ?",
        [jobId],
      );
    });
    await notifyOnComment({
      postId: Number(job.post_id),
      commentId: replyCommentId,
      actorId: null,
      parentId: null,
    });
  } catch (e) {
    await mark("failed", e instanceof Error ? e.message : String(e));
  }
}

/* Work-side claim query: liveness predicates match the works.ts public
   rules (hidden_at IS NULL + visibility='public'); invisible and missing
   are both skipped. */
export function aiReplyWorkClaimSql(): string {
  return `SELECT w.user_id, w.name, w.tagline, w.kind, w.agents, w.description_md,
              w.ai_reply, u.ai_replies_enabled
       FROM works w LEFT JOIN users u ON u.id = w.user_id
       WHERE w.id = ? AND w.hidden_at IS NULL AND w.visibility = 'public' LIMIT 1`;
}

/* Work summon execution: gating (work ai_reply + author
   ai_replies_enabled, external entries skip the author check) -> per-work
   AI cap -> context (work info + up to 10 comments up to the trigger) ->
   write work_comments (is_ai=1, user_id NULL) + comment_count+1 +
   notify. */
async function processAiWorkMention(
  jobId: number,
  apiKey: string,
  workId: number,
  workCommentId: number,
): Promise<void> {
  const pool = getPool();
  /* done only lands via the in-transaction UPDATE; only skipped/failed
     exit here. */
  const mark = (status: "failed" | "skipped", error = "") =>
    pool.query(
      "UPDATE ai_reply_jobs SET status = ?, error = ?, processed_at = NOW() WHERE id = ?",
      [status, error.slice(0, 500), jobId],
    );
  try {
    const [wrows] = await pool.query<RowDataPacket[]>(aiReplyWorkClaimSql(), [workId]);
    const work = wrows[0];
    if (!work) {
      await mark("skipped", "work gone or not public");
      return;
    }
    if (
      !aiWorkReplySwitchesAllow({
        aiReply: work.ai_reply,
        authorEnabled: work.user_id === null ? null : work.ai_replies_enabled,
      })
    ) {
      await mark("skipped", "ai reply disabled");
      return;
    }
    /* The trigger comment must still exist (AI ignores AI: @kimi inside
       an AI comment counts as gone). */
    const [crows] = await pool.query<RowDataPacket[]>(
      `SELECT c.is_ai, c.body, u.locale
       FROM work_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND c.work_id = ? AND c.deleted_at IS NULL LIMIT 1`,
      [workCommentId, workId],
    );
    const trigger = crows[0];
    if (!trigger || trigger.is_ai) {
      await mark("skipped", "trigger comment gone");
      return;
    }
    /* Per-work AI comment cap (flood guard). */
    const [cnt] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM work_comments WHERE work_id = ? AND is_ai = 1 AND deleted_at IS NULL",
      [workId],
    );
    if (Number(cnt[0]?.n ?? 0) >= MAX_AI_WORK_COMMENTS) {
      await mark("skipped", "work ai comments cap");
      return;
    }
    /* Context: up to 10 comments up to and including the trigger (newest
       last, same order as the community chain). */
    const [prev] = await pool.query<RowDataPacket[]>(
      `SELECT c.is_ai, c.body, u.handle
       FROM work_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.work_id = ? AND c.deleted_at IS NULL AND c.id <= ?
       ORDER BY c.id DESC LIMIT 10`,
      [workId, workCommentId],
    );
    const convo = prev
      .reverse()
      .map(
        (c) =>
          `${c.is_ai ? BOT_NAME : `@${c.handle}`}${c.is_ai ? "(你)" : ""}:${String(c.body).slice(0, 500)}`,
      )
      .join("\n");
    const agents = ((): string[] => {
      try {
        const v = JSON.parse(String(work.agents ?? "[]"));
        return Array.isArray(v)
          ? v.filter((a): a is string => typeof a === "string")
          : [];
      } catch {
        return [];
      }
    })();
    const reply = await callKimi(
      apiKey,
      SYSTEM_PROMPT_WORK_MENTION,
      /* Language: trigger's account preference > their comment's language
         > Chinese (same as posts). */
      replyLang({ locale: trigger.locale, content: String(trigger.body) }),
      {
        category: String(work.kind),
        title: String(work.name),
        body: `一句话介绍:${work.tagline}\n参与构建:${agents.join(", ") || "未标注"}\n详细介绍(节选):\n${String(work.description_md ?? "").slice(0, 2000)}`,
        convo,
      },
      "作品",
    );
    let workReplyId = 0;
    await commitAiReplyWrite(async (conn) => {
      const [ins] = await conn.query<ResultSetHeader>(
        "INSERT INTO work_comments (work_id, user_id, is_ai, body) VALUES (?, NULL, 1, ?)",
        [workId, reply.slice(0, 5000)],
      );
      workReplyId = Number(ins.insertId);
      await conn.query(
        "UPDATE works SET comment_count = comment_count + 1 WHERE id = ?",
        [workId],
      );
      await conn.query(
        "UPDATE ai_reply_jobs SET status = 'done', error = '', processed_at = NOW() WHERE id = ?",
        [jobId],
      );
    });
    await notifyOnWorkComment({
      workId,
      workCommentId: workReplyId,
      actorId: null,
      triggerCommentId: workCommentId,
    });
  } catch (e) {
    await mark("failed", e instanceof Error ? e.message : String(e));
  }
}

async function callKimi(
  apiKey: string,
  systemPrompt: string,
  lang: "zh" | "en",
  post: { category: string; title: string; body: string; convo: string | null; author?: string },
  /* Context noun: Chinese for post vs work jobs — the system prompts are
     Chinese; the default keeps post-branch copy verbatim. */
  noun: "帖子" | "作品" = "帖子",
): Promise<string> {
  const model = process.env.KIMI_MODEL || "kimi-k2.6";
  const langRule =
    lang === "en"
      ? "用英文回复(即使帖子是中文写的)"
      : "用中文回复(即使帖子是英文写的)";
  const catLabel = noun === "作品" ? "类型" : "板块";
  const userContent =
    post.convo === null
      ? `${catLabel}:${post.category}\n标题:${post.title || "(无标题)"}\n${post.author ? `作者:${post.author}\n` : ""}正文:\n${post.body}`
      : `${catLabel}:${post.category}\n${noun}标题:${post.title || "(无标题)"}\n${noun}正文(节选):\n${post.body}\n\n对话链(从旧到新,最后一条是最新回复,你要接这条):\n${convoGuard(post.convo)}`;
  const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      // No temperature: k2.6/k2.7 only accept temperature=1; any other
      // explicit value 400s.
      messages: [
        { role: "system", content: systemPrompt.replace("{LANG_RULE}", langRule) },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`kimi api ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("kimi api returned empty reply");
  return text;
}

/* Dialog-chain length guard (bounds the prompt). */
function convoGuard(convo: string): string {
  return convo.length > 3000 ? `…${convo.slice(-3000)}` : convo;
}

/* ---------- Failure recovery (manual rerun + cron batches) ---------- */

/* Max executions per job (first run + retries); at the cap it stays
   failed with its error preserved. */
export const AI_REPLY_MAX_ATTEMPTS = 3;
/* Backoff base: retry n (n = executions so far) waits at least
   10 * 2^n minutes; n=0 means a pending job untouched for 10 minutes gets
   adopted. */
export const AI_REPLY_RETRY_BASE_MINUTES = 10;

export function aiReplyRetryDelayMs(attempts: number): number {
  return AI_REPLY_RETRY_BASE_MINUTES * 2 ** attempts * 60_000;
}

export interface AiReplyRetryCandidate {
  status: string;
  attempts: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
}

/* Whether a retry is due: at the attempt cap (a pending leftover =
   executor crashed after claiming) never again; otherwise exponential
   backoff from the last attempt (or enqueue time if never attempted). */
export function isAiReplyRetryDue(job: AiReplyRetryCandidate, now: Date): boolean {
  if (job.status !== "pending" && job.status !== "failed") return false;
  if (job.attempts >= AI_REPLY_MAX_ATTEMPTS) return false;
  const reference = job.lastAttemptAt ?? job.createdAt;
  return now.getTime() - reference.getTime() >= aiReplyRetryDelayMs(job.attempts);
}

/* Two-level switch: post ai_reply + author ai_replies_enabled — both
   must hold. */
export function aiReplySwitchesAllow(flags: {
  aiReply: unknown;
  aiRepliesEnabled: unknown;
}): boolean {
  return Boolean(flags.aiReply) && Boolean(flags.aiRepliesEnabled);
}

/* Work-side two-level switch: work ai_reply + author ai_replies_enabled;
   awesome external entries (works.user_id NULL) have no territory owner —
   the work switch alone decides. */
export function aiWorkReplySwitchesAllow(flags: {
  aiReply: unknown;
  /* Author's global switch; null (external entry) = skip the author
     check. */
  authorEnabled: unknown;
}): boolean {
  if (!flags.aiReply) return false;
  if (flags.authorEnabled === null || flags.authorEnabled === undefined)
    return true;
  return Boolean(flags.authorEnabled);
}

/* Manual single-job rerun (scripts/ai-reply-retry.ts wraps it): anything
   not done resets to pending, counts one attempt, then runs the real
   processAiReply and returns the final status. */
export async function retryAiReplyJob(
  jobId: number,
): Promise<{ retried: boolean; job: { id: number; status: string; error: string } | null }> {
  const pool = getPool();
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE ai_reply_jobs
     SET status = 'pending', error = '', attempts = attempts + 1, last_attempt_at = NOW()
     WHERE id = ? AND status != 'done'`,
    [jobId],
  );
  if (res.affectedRows > 0) await processAiReply(jobId);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, status, error FROM ai_reply_jobs WHERE id = ?",
    [jobId],
  );
  const row = rows[0];
  return {
    retried: res.affectedRows > 0,
    job: row
      ? { id: Number(row.id), status: String(row.status), error: String(row.error) }
      : null,
  };
}

export interface AiReplyRecoveryStats {
  candidates: number;
  /* Passed the backoff check and due this round. */
  due: number;
  /* Switches unsatisfied — marked skipped directly. */
  skipped: number;
  /* Actual reruns. */
  retried: number;
  done: number;
  failed: number;
  /* At the attempt cap: stays failed terminally (error already preserved
     by processAiReply). */
  failedTerminal: number;
}

/* Cron batch recovery (/api/cron/ai-reply-retry): scans stuck pending /
   failed-under-cap jobs and reruns the due ones. Batches are bounded;
   leftovers wait for the next round. */
export async function recoverAiReplyJobs(
  now: Date = new Date(),
  batchLimit = 100,
): Promise<AiReplyRecoveryStats> {
  const pool = getPool();
  const stats: AiReplyRecoveryStats = {
    candidates: 0,
    due: 0,
    skipped: 0,
    retried: 0,
    done: 0,
    failed: 0,
    failedTerminal: 0,
  };
  /* Dual-target scan: work jobs have NULL post_id, all JOINs relax to
     LEFT, and the switch columns come in two aliased sets (post / work). */
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT j.id, j.status, j.attempts, j.last_attempt_at, j.created_at, j.work_id,
            p.ai_reply, u.ai_replies_enabled,
            w.ai_reply AS work_ai_reply, w.user_id AS work_user_id,
            wu.ai_replies_enabled AS work_author_enabled
     FROM ai_reply_jobs j
     LEFT JOIN posts p ON p.id = j.post_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN works w ON w.id = j.work_id
     LEFT JOIN users wu ON wu.id = w.user_id
     WHERE j.status = 'pending' OR (j.status = 'failed' AND j.attempts < ?)
     ORDER BY j.id
     LIMIT ?`,
    [AI_REPLY_MAX_ATTEMPTS, batchLimit],
  );
  stats.candidates = rows.length;
  for (const row of rows) {
    const jobId = Number(row.id);
    const attempts = Number(row.attempts);
    if (attempts >= AI_REPLY_MAX_ATTEMPTS) {
      /* Pending leftover (process killed after claiming) at the attempt
         cap: mark failed terminally so it stops being scanned. */
      await pool.query(
        `UPDATE ai_reply_jobs SET status = 'failed', error = 'attempts exhausted',
         processed_at = NOW() WHERE id = ? AND status = 'pending'`,
        [jobId],
      );
      stats.failedTerminal += 1;
      continue;
    }
    const due = isAiReplyRetryDue(
      {
        status: String(row.status),
        attempts,
        lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
        createdAt: new Date(row.created_at),
      },
      now,
    );
    if (!due) continue;
    stats.due += 1;
    /* Switch check forks by target: work jobs read works/users (external
       entries skip the author check). */
    const allowed =
      row.work_id !== null && row.work_id !== undefined
        ? aiWorkReplySwitchesAllow({
            aiReply: row.work_ai_reply,
            authorEnabled:
              row.work_user_id === null || row.work_user_id === undefined
                ? null
                : row.work_author_enabled,
          })
        : aiReplySwitchesAllow({
            aiReply: row.ai_reply,
            aiRepliesEnabled: row.ai_replies_enabled,
          });
    if (!allowed) {
      await pool.query(
        `UPDATE ai_reply_jobs SET status = 'skipped', error = 'ai reply disabled',
         processed_at = NOW() WHERE id = ? AND status IN ('pending', 'failed')`,
        [jobId],
      );
      stats.skipped += 1;
      continue;
    }
    /* Claim: count one attempt and return to pending (processAiReply only
       accepts pending); if another executor touched it concurrently, give
       up. */
    const [claim] = await pool.query<ResultSetHeader>(
      `UPDATE ai_reply_jobs
       SET status = 'pending', error = '', attempts = attempts + 1, last_attempt_at = NOW()
       WHERE id = ? AND status IN ('pending', 'failed')`,
      [jobId],
    );
    if (claim.affectedRows === 0) continue;
    stats.retried += 1;
    await processAiReply(jobId);
    const [after] = await pool.query<RowDataPacket[]>(
      "SELECT status, attempts FROM ai_reply_jobs WHERE id = ?",
      [jobId],
    );
    const finalStatus = after[0] ? String(after[0].status) : "";
    if (finalStatus === "done") {
      stats.done += 1;
    } else if (finalStatus === "skipped") {
      stats.skipped += 1;
    } else if (finalStatus === "failed") {
      if (Number(after[0].attempts) >= AI_REPLY_MAX_ATTEMPTS) stats.failedTerminal += 1;
      else stats.failed += 1;
    }
  }
  return stats;
}
