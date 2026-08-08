"use server";

/* 社区写操作 + UI 偏好切换。UI 对未登录用户不渲染表单;这里再兜底一次(session 为空即静默返回)。
   页面全是动态渲染(Header 读 cookie),action 完成后 Next 会重取数据,无需 revalidate。 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { enqueueAiReply } from "@/src/lib/ai-reply";
import {
  CATEGORIES,
  createComment,
  createPost,
  toggleSubscribe,
  toggleUp,
  votePoll,
} from "@/src/lib/posts";

export interface PostFormState {
  error?: string;
}

export async function createPostAction(
  _prev: PostFormState | null,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "请先登录" };

  const type = String(formData.get("type") || "text");
  if (!["text", "link", "poll"].includes(type)) return { error: "未知帖子类型" };
  const category = String(formData.get("category") || "chat");
  if (!CATEGORIES.some((c) => c.id === category)) return { error: "未知板块" };
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const linkUrl = String(formData.get("link_url") || "").trim();
  const aiReply = formData.get("ai_reply") === "on";

  if (!title) return { error: "标题不能为空" };
  if (title.length > 200) return { error: "标题太长了(200 字以内)" };
  if (type === "link" && !/^https?:\/\/.+/.test(linkUrl))
    return { error: "链接需要以 http(s):// 开头" };
  if (!body && type === "text") return { error: "正文不能为空" };

  let options: string[] = [];
  if (type === "poll") {
    options = formData
      .getAll("option")
      .map((v) => String(v).trim())
      .filter(Boolean)
      .slice(0, 8);
    if (options.length < 2) return { error: "投票至少需要 2 个选项" };
  }

  const lang = /[一-鿿]/.test(title + body) ? "zh" : "en";
  const postId = await createPost({
    userId: user.id,
    type: type as "text" | "link" | "poll",
    category: category as (typeof CATEGORIES)[number]["id"],
    title,
    bodyMd: body,
    linkUrl,
    lang,
    aiReply,
    options,
  });
  /* 入队 AI 回帖:本帖开关 + 作者全局开关都开才排(v2 决策 3)。
     enqueue 内部用 after(),必须在 redirect 抛出前调用。 */
  if (aiReply && user.aiRepliesEnabled) await enqueueAiReply(postId);
  redirect(`/community/${postId}`);
}

export async function createCommentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  const body = String(formData.get("body") || "").trim();
  if (!postId || !body) return;
  await createComment(postId, user.id, body);
}

export async function toggleUpAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  if (!postId) return;
  await toggleUp(user.id, postId);
}

export async function toggleSubscribeAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  if (!postId) return;
  await toggleSubscribe(user.id, postId);
}

export async function votePollAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  const optionId = Number(formData.get("option_id"));
  if (!postId || !optionId) return;
  await votePoll(user.id, postId, optionId);
}

/* ---- UI 偏好(cookie,一年期;语义见 src/lib/prefs.ts)---- */

const PREF_COOKIE = { path: "/", maxAge: 365 * 86400, sameSite: "lax" } as const;

export async function toggleNavAction(): Promise<void> {
  const store = await cookies();
  const collapsed = store.get("kb_nav")?.value === "1";
  store.set("kb_nav", collapsed ? "0" : "1", PREF_COOKIE);
}

export async function toggleSidebarAction(): Promise<void> {
  const store = await cookies();
  const shown = store.get("kb_sidebar")?.value !== "0";
  store.set("kb_sidebar", shown ? "0" : "1", PREF_COOKIE);
}
