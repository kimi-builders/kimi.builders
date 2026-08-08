/* AI 回帖:新帖入库 → ai_reply_jobs 排队 → after() 里调 Kimi(Moonshot)API
   → 以 bot 身份写 comments(is_ai=1, user_id NULL)。
   两级开关在入队前(发帖动作)和执行前(这里)各查一次:
   帖子 ai_reply=0 或作者全局关了 ai_replies_enabled 都跳过。 */
import { after } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export const BOT_NAME = "Kimi 小筑";
export const BOT_AVATAR = "/brand/logo-mark.svg";

const SYSTEM_PROMPT = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。你在社区里回帖,规则:
- 用发帖人的语言回复(中文帖回中文,英文帖回英文);
- 像一位懂 Kimi 产品、也懂工程的老群友:直接、具体、有帮助;
- 不要「你好呀」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;
- 求助帖给可执行的下一步;晒作品帖给一个真诚点评加一个延伸建议;闲聊帖自然接话;
- 拿不准就说不确定,不编造。`;

/* 在 server action 里调用:登记任务并把执行挂到响应之后。 */
export async function enqueueAiReply(postId: number): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO ai_reply_jobs (post_id) VALUES (?)",
    [postId],
  );
  const jobId = Number(res.insertId);
  after(() => processAiReply(jobId));
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
      `SELECT j.post_id, p.title, p.body_md, p.category, p.ai_reply, u.ai_replies_enabled
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
    const reply = await callKimi(apiKey, {
      title: job.title,
      body: job.body_md ?? "",
      category: job.category,
    });
    await pool.query(
      "INSERT INTO comments (post_id, user_id, is_ai, body_md) VALUES (?, NULL, 1, ?)",
      [job.post_id, reply.slice(0, 5000)],
    );
    await pool.query(
      "UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?",
      [job.post_id],
    );
    await mark("done");
  } catch (e) {
    await mark("failed", e instanceof Error ? e.message : String(e));
  }
}

async function callKimi(
  apiKey: string,
  post: { title: string; body: string; category: string },
): Promise<string> {
  const model = process.env.KIMI_MODEL || "kimi-k2.6";
  const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `板块:${post.category}\n标题:${post.title}\n正文:\n${post.body.slice(0, 4000)}`,
        },
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
