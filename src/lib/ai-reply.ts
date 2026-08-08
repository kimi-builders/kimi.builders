/* AI 回帖:新帖入库 → ai_reply_jobs 排队 → after() 里调 Kimi(Moonshot)API
   → 以 bot 身份写 comments(is_ai=1, user_id NULL)。
   两级开关在入队前(发帖动作)和执行前(这里)各查一次:
   帖子 ai_reply=0 或作者全局关了 ai_replies_enabled 都跳过。
   after 用动态 import:保持本文件可被 Next 之外的普通 Node 脚本引用
   (如手动重跑任务),顶层静态 import "next/server" 在裸 Node 下解析不了。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export const BOT_NAME = "Kimi 小筑";
/* 小尺寸瓷砖标(月牙+双星放大,暗底):评论里 20px 也可辨,双主题稳定。 */
export const BOT_AVATAR = "/brand/logo-tile.svg";

const SYSTEM_PROMPT = `你是 kimi.builders 社区的 AI 助手「${BOT_NAME}」。kimi.builders 是 Kimi 用户自建的公益 builder 社区(非官方),成员在这里讨论怎么用 Kimi 构建东西。你在社区里回帖,规则:
- {LANG_RULE}
- 像一位懂 Kimi 产品、也懂工程的老群友:直接、具体、有帮助;
- 不要「你好呀」「希望对你有帮助」这类客套,不要 emoji 堆砌;
- 不超过 250 字;
- 求助帖给可执行的下一步;晒作品帖给一个真诚点评加一个延伸建议;闲聊帖自然接话;
- 拿不准就说不确定,不编造。`;

/* 回帖语言优先级:用户账号语言(手动切换 UI 语言时会写入)> 帖子语言 > 默认中文。 */
function replyLang(job: { locale?: string; post_lang?: string }): "zh" | "en" {
  if (job.locale === "zh" || job.locale === "en") return job.locale;
  if (job.post_lang === "en") return "en";
  return "zh";
}

/* 在 server action 里调用:登记任务并把执行挂到响应之后。 */
export async function enqueueAiReply(postId: number): Promise<void> {
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO ai_reply_jobs (post_id) VALUES (?)",
    [postId],
  );
  const jobId = Number(res.insertId);
  const { after } = await import("next/server");
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
      `SELECT j.post_id, p.title, p.body_md, p.category, p.ai_reply,
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
    const reply = await callKimi(apiKey, {
      title: job.title,
      body: job.body_md ?? "",
      category: job.category,
      lang: replyLang({ locale: job.locale, post_lang: job.post_lang }),
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
  post: { title: string; body: string; category: string; lang: "zh" | "en" },
): Promise<string> {
  const model = process.env.KIMI_MODEL || "kimi-k2.6";
  const langRule =
    post.lang === "en"
      ? "用英文回复(即使帖子是中文写的)"
      : "用中文回复(即使帖子是英文写的)";
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
        { role: "system", content: SYSTEM_PROMPT.replace("{LANG_RULE}", langRule) },
        {
          role: "user",
          content: `板块:${post.category}\n标题:${post.title || "(无标题)"}\n正文:\n${post.body.slice(0, 4000)}`,
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
