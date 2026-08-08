/* AI 回帖:新帖/对 AI 的评论入库 → ai_reply_jobs 排队 → after() 里调 Kimi(Moonshot)API
   → 以 bot 身份写 comments(is_ai=1, user_id NULL)。
   两级开关在入队前(发帖/评论动作)和执行前(这里)各查一次:
   帖子 ai_reply=0 或作者全局关了 ai_replies_enabled 都跳过。
   评论触发(comment_id 非空)时带对话链上下文接话,链路里 AI 发言超过
   MAX_AI_CHAIN 条就礼貌闭嘴(防无限接龙)。
   after 用动态 import:保持本文件可被 Next 之外的普通 Node 脚本引用
   (如手动重跑任务),顶层静态 import "next/server" 在裸 Node 下解析不了。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";
import { notifyOnComment } from "./posts";

export const BOT_NAME = "Kimi 小筑";
/* 小尺寸瓷砖标(月牙+双星放大,暗底):评论里 20px 也可辨,双主题稳定。 */
export const BOT_AVATAR = "/brand/logo-tile.svg";

/* 一条对话链里 AI 最多接话次数(到顶就停在最后一条,不再接) */
const MAX_AI_CHAIN = 8;

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

/* 回帖语言优先级:用户账号语言(手动切换 UI 语言时会写入)> 内容语言 > 默认中文。 */
function replyLang(job: { locale?: string; content?: string }): "zh" | "en" {
  if (job.locale === "zh" || job.locale === "en") return job.locale;
  if (job.content && !/[一-鿿]/.test(job.content)) return "en";
  return "zh";
}

/* 在 server action 里调用:登记任务并把执行挂到响应之后。
   commentId 非空 = 这条评论触发(它的 direct parent 是 AI 评论)。 */
export async function enqueueAiReply(
  postId: number,
  commentId: number | null = null,
): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO ai_reply_jobs (post_id, comment_id) VALUES (?, ?)",
    [postId, commentId],
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
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT j.post_id, j.comment_id, p.title, p.body_md, p.category, p.ai_reply,
              p.lang AS post_lang, u.ai_replies_enabled, u.locale
       FROM ai_reply_jobs j
       JOIN posts p ON p.id = j.post_id
       JOIN users u ON u.id = p.user_id
       WHERE j.id = ? AND j.status = 'pending' LIMIT 1`,
      [jobId],
    );
    const job = rows[0];
    if (!job) return;
    if (!job.ai_reply || !job.ai_replies_enabled) {
      await mark("skipped", "ai reply disabled");
      return;
    }

    const triggerCommentId: number | null =
      job.comment_id === null ? null : Number(job.comment_id);

    if (triggerCommentId) {
      /* ---- 评论接话:对话链上下文 ---- */
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
      const reply = await callKimi(apiKey, SYSTEM_PROMPT_COMMENT, lang, {
        category: job.category,
        title: job.title,
        body: String(job.body_md ?? "").slice(0, 2000),
        convo,
      });
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

    /* ---- 回帖(顶层)---- */
    const reply = await callKimi(apiKey, SYSTEM_PROMPT, replyLang({ locale: job.locale, content: job.title + job.body_md }), {
      category: job.category,
      title: job.title,
      body: String(job.body_md ?? "").slice(0, 4000),
      convo: null,
    });
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

async function callKimi(
  apiKey: string,
  systemPrompt: string,
  lang: "zh" | "en",
  post: { category: string; title: string; body: string; convo: string | null },
): Promise<string> {
  const model = process.env.KIMI_MODEL || "kimi-k2.6";
  const langRule =
    lang === "en"
      ? "用英文回复(即使帖子是中文写的)"
      : "用中文回复(即使帖子是英文写的)";
  const userContent =
    post.convo === null
      ? `板块:${post.category}\n标题:${post.title || "(无标题)"}\n正文:\n${post.body}`
      : `板块:${post.category}\n帖子标题:${post.title || "(无标题)"}\n帖子正文(节选):\n${post.body}\n\n对话链(从旧到新,最后一条是最新回复,你要接这条):\n${convoGuard(post.convo)}`;
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
