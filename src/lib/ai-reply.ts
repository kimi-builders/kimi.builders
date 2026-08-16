/* AI 回帖:新帖/对 AI 的评论入库 → ai_reply_jobs 排队 → after() 里调 Kimi(Moonshot)API
   → 以 bot 身份写 comments(is_ai=1, user_id NULL)。
   任务类型 kind(20260816 召唤改造):
   - auto    = 新帖自动回帖;
   - chain   = 回复 AI 评论后的接话(带对话链上下文,链路 AI 发言超
               MAX_AI_CHAIN 条就礼貌闭嘴,防无限接龙);
   - mention = @kimi 召唤。comment_id NULL 且正文含召唤词 = 发帖召唤
               (与自动回帖合并为一条,不会再产生 auto 任务);comment_id 非空
               = 评论召唤(回答被 @ 的那条评论,对话链上下文同 chain);
               work_id 非空(PR2)= 作品/Awesome 评论区召唤,写 work_comments,
               上下文 = 作品 name/tagline/kind/agents + description_md 节选
               + 触发评论前最多 10 条评论,单作品 AI 评论封顶 MAX_AI_WORK_COMMENTS。
   两级开关在入队前(发帖/评论动作)和执行前(这里)各查一次:
   帖子 ai_reply=0 或作者全局关了 ai_replies_enabled 都跳过(地盘规则:
   帖主关了 AI 参与,其帖内召唤也不响应)。作品侧同理:works.ai_reply +
   作者 ai_replies_enabled;works.user_id NULL 的 awesome 站外条目
   无地盘主,跳过作者检查(仅作品开关)。
   失败恢复:after() 可能被杀,由 /api/cron/ai-reply-retry 周期调用
   recoverAiReplyJobs 兜底(指数退避、封顶 AI_REPLY_MAX_ATTEMPTS 次);
   单个任务也可手动 retryAiReplyJob(scripts/ai-reply-retry.ts)。
   after 用动态 import:保持本文件可被 Next 之外的普通 Node 脚本引用
   (如手动重跑任务),顶层静态 import "next/server" 在裸 Node 下解析不了。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { notifyOnComment } from "./posts";
import { notifyOnWorkComment } from "./works";

/* 身份常量的唯一定义在 ./bot-identity(客户端可用);这里 re-export 兼容旧引用 */
export { BOT_AVATAR, BOT_NAME } from "./bot-identity";
import { BOT_NAME } from "./bot-identity";

/* 一条对话链里 AI 最多接话次数(到顶就停在最后一条,不再接) */
const MAX_AI_CHAIN = 8;

/* 同一作品评论区 AI 评论总数上限(20260816 PR2):防单作品被刷爆 */
export const MAX_AI_WORK_COMMENTS = 50;

const SYSTEM_PROMPT = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。你在社区里回帖,规则:
- {LANG_RULE}
- 像一位懂 Kimi 产品、也懂工程的老群友:直接、具体、有帮助;
- 不要「你好呀」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;
- 求助帖给可执行的下一步;晒作品帖给一个真诚点评加一个延伸建议;闲聊帖自然接话;
- 拿不准就说不确定,不编造。`;

/* 评论接话版:有效、有趣、友好、有价值;结合帖子上下文与对话链。 */
const SYSTEM_PROMPT_COMMENT = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。现在你在一条评论对话里接话,规则:
- {LANG_RULE}
- 结合帖子内容和对话链回应最后一条:给有效、具体的信息,或真诚有价值的观点;
- 语气友好自然,像老朋友接话;可以适度幽默,但别油、别强行玩梗;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 220 字;对方只是闲聊就轻松接住,不必强行给建议;
- 拿不准就说不确定,不编造。`;

/* 评论召唤版(20260816):用户 @kimi 显式提问,直接回答问题本身。 */
const SYSTEM_PROMPT_MENTION = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。有用户在评论里 @ 了你并提问,规则:
- {LANG_RULE}
- 优先直接回答最后一条评论(召唤你的那条)里的问题:先给答案,再给依据或下一步;
- 开头用「@对方名字」称呼召唤你的人(对话链最后一条的作者名);
- 结合帖子内容与对话链,别答非所问;问题与帖子无关也照常回答,但可以一句带过;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;给可执行的下一步;拿不准就说不确定,不编造。`;

/* 发帖召唤版(20260816):作者发帖时 @kimi,回应帖子并重点回答 @ 的问题;
   与自动回帖合并为这一条,不另发。 */
const SYSTEM_PROMPT_POST_MENTION = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。作者发帖时在正文里 @ 了你,规则:
- {LANG_RULE}
- 重点回答正文里 @ 你之后提出的问题:先给答案,再给依据或可执行的下一步;
- 开头用「@作者」称呼(作者名见下方「作者」一行);
- 顺带回应帖子本身(一个真诚观点或建议),两部分自然衔接成一条回复;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 300 字;拿不准就说不确定,不编造。`;

/* 作品评论召唤版(20260816 PR2):作品/Awesome 评论区 @kimi,点评/答疑口吻。 */
const SYSTEM_PROMPT_WORK_MENTION = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里展示用 Kimi 构建的作品。有用户在作品评论区 @ 了你,规则:
- {LANG_RULE}
- 优先回应召唤你的那条评论:提问就先给答案再给依据;求点评就给一个真诚具体的点评加一个延伸建议;
- 开头用「@对方名字」称呼召唤你的人(对话链最后一条的作者名);
- 结合作品介绍与已有评论,别答非所问;
- 不要「你好」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;拿不准就说不确定,不编造。`;

/* 回帖语言优先级:用户账号语言(手动切换 UI 语言时会写入)> 内容语言 > 默认中文。 */
function replyLang(job: { locale?: string; content?: string }): "zh" | "en" {
  if (job.locale === "zh" || job.locale === "en") return job.locale;
  if (job.content && !/[一-鿿]/.test(job.content)) return "en";
  return "zh";
}

export type AiReplyKind = "auto" | "chain" | "mention";

/* 在 server action 里调用:登记任务并把执行挂到响应之后。
   commentId 非空 = 这条评论触发(chain:它的 direct parent 是 AI 评论;
   mention:评论里 @kimi 召唤)。kind 语义见文件头。
   mention 入队前按触发评论去重(20260816):同一评论重复 @ 只回一次。 */
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

/* 作品/Awesome 评论区召唤(20260816 PR2):评论里 @kimi 时由
   createWorkCommentAction 调用。去重同 post 侧:同一条作品评论只入队一次。 */
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

/* 从触发评论沿 parent 链走到根,返回 根→…→触发评论 的有序对话(截断兜底) */
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

export async function processAiReply(jobId: number): Promise<void> {
  const pool = getPool();
  const mark = (status: "done" | "failed" | "skipped", error = "") =>
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
    /* work 任务的 post_id 是 NULL(20260816 PR2):JOIN 放宽为 LEFT 并带上
       work 目标列;post 分支语义不变(FK 兜底,post 任务恒能联上)。 */
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT j.post_id, j.comment_id, j.kind, j.work_id, j.work_comment_id,
              p.title, p.body_md, p.category, p.ai_reply,
              p.lang AS post_lang, u.ai_replies_enabled, u.locale, u.handle AS author_handle
       FROM ai_reply_jobs j
       LEFT JOIN posts p ON p.id = j.post_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE j.id = ? AND j.status = 'pending' LIMIT 1`,
      [jobId],
    );
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
    if (!job.ai_reply || !job.ai_replies_enabled) {
      await mark("skipped", "ai reply disabled");
      return;
    }

    const triggerCommentId: number | null =
      job.comment_id === null ? null : Number(job.comment_id);
    const kind: AiReplyKind =
      job.kind === "chain" || job.kind === "mention" ? job.kind : "auto";

    if (triggerCommentId) {
      /* ---- 评论触发:chain=接话 / mention=召唤,共用对话链上下文 ---- */
      const got = await getCommentChain(triggerCommentId);
      if (!got) {
        await mark("skipped", "trigger comment gone");
        return;
      }
      if (got.aiCount >= MAX_AI_CHAIN) {
        await mark("skipped", "ai chain depth cap");
        return;
      }
      /* 语言:触发者(最后一条作者)的账号偏好 > 其评论内容语言 > 中文 */
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
      const [ins] = await pool.query<ResultSetHeader>(
        "INSERT INTO comments (post_id, parent_id, user_id, is_ai, body_md) VALUES (?, ?, NULL, 1, ?)",
        [job.post_id, triggerCommentId, reply.slice(0, 5000)],
      );
      await pool.query(
        "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
        [job.post_id],
      );
      await notifyOnComment({
        postId: Number(job.post_id),
        commentId: Number(ins.insertId),
        actorId: null,
        parentId: triggerCommentId,
      });
      await mark("done");
      return;
    }

    /* ---- 回帖(顶层):auto=常规回帖 / mention=发帖召唤(正文 @kimi)---- */
    const reply = await callKimi(
      apiKey,
      kind === "mention" ? SYSTEM_PROMPT_POST_MENTION : SYSTEM_PROMPT,
      replyLang({ locale: job.locale, content: job.title + job.body_md }),
      {
        category: job.category,
        title: job.title,
        body: String(job.body_md ?? "").slice(0, 4000),
        convo: null,
        /* 发帖召唤:带上作者名,prompt 让它开头 @ 回作者 */
        author:
          kind === "mention" && job.author_handle
            ? `@${job.author_handle}`
            : undefined,
      },
    );
    const [ins] = await pool.query<ResultSetHeader>(
      "INSERT INTO comments (post_id, user_id, is_ai, body_md) VALUES (?, NULL, 1, ?)",
      [job.post_id, reply.slice(0, 5000)],
    );
    await pool.query(
      "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
      [job.post_id],
    );
    await notifyOnComment({
      postId: Number(job.post_id),
      commentId: Number(ins.insertId),
      actorId: null,
      parentId: null,
    });
    await mark("done");
  } catch (e) {
    await mark("failed", e instanceof Error ? e.message : String(e));
  }
}

/* 作品/Awesome 评论区召唤执行(20260816 PR2):gating(作品 ai_reply +
   作者 ai_replies_enabled,站外条目跳过作者检查)→ 单作品 AI 评论封顶 →
   组上下文(作品信息 + 触发评论及之前最多 10 条)→ 写 work_comments
   (is_ai=1, user_id NULL)+ comment_count+1 + 通知。 */
async function processAiWorkMention(
  jobId: number,
  apiKey: string,
  workId: number,
  workCommentId: number,
): Promise<void> {
  const pool = getPool();
  const mark = (status: "done" | "failed" | "skipped", error = "") =>
    pool.query(
      "UPDATE ai_reply_jobs SET status = ?, error = ?, processed_at = NOW() WHERE id = ?",
      [status, error.slice(0, 500), jobId],
    );
  try {
    const [wrows] = await pool.query<RowDataPacket[]>(
      `SELECT w.user_id, w.name, w.tagline, w.kind, w.agents, w.description_md,
              w.ai_reply, u.ai_replies_enabled
       FROM works w LEFT JOIN users u ON u.id = w.user_id
       WHERE w.id = ? LIMIT 1`,
      [workId],
    );
    const work = wrows[0];
    if (!work) {
      await mark("skipped", "work gone");
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
    /* 触发评论必须还在(AI 不响应 AI:AI 评论的 @kimi 一并按 gone 跳过) */
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
    /* 单作品 AI 评论总数封顶(防单作品被刷爆) */
    const [cnt] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM work_comments WHERE work_id = ? AND is_ai = 1 AND deleted_at IS NULL",
      [workId],
    );
    if (Number(cnt[0]?.n ?? 0) >= MAX_AI_WORK_COMMENTS) {
      await mark("skipped", "work ai comments cap");
      return;
    }
    /* 上下文:触发评论及之前最多 10 条(新的在后,与社区对话链同序) */
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
      /* 语言:触发者账号偏好 > 其评论内容语言 > 中文(同 post 侧) */
      replyLang({ locale: trigger.locale, content: String(trigger.body) }),
      {
        category: String(work.kind),
        title: String(work.name),
        body: `一句话介绍:${work.tagline}\n参与构建:${agents.join(", ") || "未标注"}\n详细介绍(节选):\n${String(work.description_md ?? "").slice(0, 2000)}`,
        convo,
      },
      "作品",
    );
    const [ins] = await pool.query<ResultSetHeader>(
      "INSERT INTO work_comments (work_id, user_id, is_ai, body) VALUES (?, NULL, 1, ?)",
      [workId, reply.slice(0, 5000)],
    );
    await pool.query(
      "UPDATE works SET comment_count = comment_count + 1 WHERE id = ?",
      [workId],
    );
    await notifyOnWorkComment({
      workId,
      workCommentId: Number(ins.insertId),
      actorId: null,
      triggerCommentId: workCommentId,
    });
    await mark("done");
  } catch (e) {
    await mark("failed", e instanceof Error ? e.message : String(e));
  }
}

async function callKimi(
  apiKey: string,
  systemPrompt: string,
  lang: "zh" | "en",
  post: { category: string; title: string; body: string; convo: string | null; author?: string },
  /* 语境名词(20260816 PR2):帖子(post 任务)/ 作品(work 任务);
     默认「帖子」,post 分支文案与之前逐字一致 */
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
      // 不传 temperature:k2.6/k2.7 只允许 temperature=1,显式传其他值直接 400
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

/* 对话链总长兜底(防超长 prompt) */
function convoGuard(convo: string): string {
  return convo.length > 3000 ? `…${convo.slice(-3000)}` : convo;
}

/* ---------- 失败恢复(手动重跑 + cron 批量) ---------- */

/* 同一任务最多执行次数(首发 + 重试合计);到顶后保持 failed 终态并保留 error */
export const AI_REPLY_MAX_ATTEMPTS = 3;
/* 退避基数:第 n 次重试(n = 已执行次数)至少间隔 10 * 2^n 分钟;
   n=0 即 pending 卡住 10 分钟未动就接管 */
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

/* 任务是否到点该重试:次数到顶(pending 残留 = 执行器认领后崩溃)不再动;
   其余按指数退避看最近一次尝试(没尝试过就看入队时间)。 */
export function isAiReplyRetryDue(job: AiReplyRetryCandidate, now: Date): boolean {
  if (job.status !== "pending" && job.status !== "failed") return false;
  if (job.attempts >= AI_REPLY_MAX_ATTEMPTS) return false;
  const reference = job.lastAttemptAt ?? job.createdAt;
  return now.getTime() - reference.getTime() >= aiReplyRetryDelayMs(job.attempts);
}

/* 两级开关:帖子 ai_reply + 作者 ai_replies_enabled,都为真才允许回 */
export function aiReplySwitchesAllow(flags: {
  aiReply: unknown;
  aiRepliesEnabled: unknown;
}): boolean {
  return Boolean(flags.aiReply) && Boolean(flags.aiRepliesEnabled);
}

/* 作品侧两级开关(20260816 PR2):作品 ai_reply + 作者 ai_replies_enabled;
   awesome 站外条目(works.user_id NULL)无地盘主,只看作品开关。 */
export function aiWorkReplySwitchesAllow(flags: {
  aiReply: unknown;
  /* 作者全局开关;无作者(站外条目)传 null = 跳过作者检查 */
  authorEnabled: unknown;
}): boolean {
  if (!flags.aiReply) return false;
  if (flags.authorEnabled === null || flags.authorEnabled === undefined)
    return true;
  return Boolean(flags.authorEnabled);
}

/* 手动重跑单个任务(scripts/ai-reply-retry.ts 是它的薄封装):
   非 done 重置为 pending、计一次尝试,再走真实 processAiReply,返回最终状态。 */
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
  /* 通过退避判断、本轮该处理的 */
  due: number;
  /* 两级开关不满足,直接标记 skipped */
  skipped: number;
  /* 实际重跑次数 */
  retried: number;
  done: number;
  failed: number;
  /* 达到次数上限,保持 failed 终态(error 已在 processAiReply 里保留) */
  failedTerminal: number;
}

/* cron 批量恢复(/api/cron/ai-reply-retry):扫 pending 卡住 / failed 未到顶的
   任务,退避到点的逐个重跑。单批限量,漏掉的下一轮再说。 */
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
  /* 双目标扫描(20260816 PR2):work 任务 post_id NULL,JOIN 全部放宽 LEFT,
     开关列按目标分两套别名带出(post 一套 / work 一套)。 */
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
      /* pending 残留(认领后进程被杀)且次数到顶:落 failed 终态,不再扫到 */
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
    /* 开关检查按目标分流:work 任务查 works/users(站外条目无作者,跳过作者检查) */
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
    /* 认领:计一次尝试并回到 pending(processAiReply 只接 pending);
       并发下被别的执行器动过就放弃 */
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
