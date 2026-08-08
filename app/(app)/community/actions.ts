"use server";

/* 社区写操作 + UI 偏好切换。UI 对未登录用户不渲染表单;这里再兜底一次(session 为空即静默返回)。
   页面全是动态渲染(Header 读 cookie),action 完成后 Next 会重取数据,无需 revalidate。 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { setUserLocale } from "@/src/lib/auth/users";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { enqueueAiReply } from "@/src/lib/ai-reply";
import {
  CATEGORIES,
  createComment,
  createPost,
  deleteComment,
  deletePost,
  getCommentForReply,
  getPost,
  setCommentReaction,
  setPostReaction,
  setPostVisibility,
  toggleSubscribe,
  updateComment,
  updatePost,
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
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };

  const type = String(formData.get("type") || "text");
  if (!["text", "link", "poll"].includes(type))
    return { error: t(locale, "err.unknownType") };
  const category = String(formData.get("category") || "chat");
  if (!CATEGORIES.some((c) => c.id === category))
    return { error: t(locale, "err.unknownCat") };
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const linkUrl = String(formData.get("link_url") || "").trim();
  const aiReply = formData.get("ai_reply") === "on";
  const visibility = formData.get("private") === "on" ? "private" : "public";

  /* 标题/正文都不强制:至少填一项即可(降低发布门槛,参考 V2EX/X) */
  if (!title && !body) return { error: t(locale, "err.empty") };
  if (title.length > 200) return { error: t(locale, "err.titleLong") };
  if (type === "link" && !/^https?:\/\/.+/.test(linkUrl))
    return { error: t(locale, "err.linkInvalid") };

  let options: string[] = [];
  if (type === "poll") {
    options = formData
      .getAll("option")
      .map((v) => String(v).trim())
      .filter(Boolean)
      .slice(0, 8);
    if (options.length < 2) return { error: t(locale, "err.pollMin") };
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
    visibility,
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
  const parentId = Number(formData.get("parent_id")) || null;
  if (!postId || !body) return;
  /* 楼中楼:parent 必须存在、属于同帖、未删除;层级不限,展示侧拍平到两层 */
  let parent: { id: number; isAi: boolean; userId: number | null } | null = null;
  if (parentId) {
    parent = await getCommentForReply(parentId, postId);
    if (!parent) return;
  }
  const commentId = await createComment(postId, user.id, body, parentId);
  /* 回复了 AI 的评论 → 触发 AI 接话(带对话链上下文)。
     门槛:帖子允许 AI + 回帖人全局允许 AI;链路深度上限在执行侧。 */
  if (parent?.isAi && user.aiRepliesEnabled) {
    const post = await getPost(postId);
    if (post?.aiReply) await enqueueAiReply(postId, commentId);
  }
}

/* 顶/踩:kind 由点击的按钮携带(name="kind");同向再点=取消,反向=换边。 */
export async function setPostReactionAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  const kind = formData.get("kind") === "down" ? "down" : "up";
  if (!postId) return;
  await setPostReaction(user.id, postId, kind);
}

export async function setCommentReactionAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const commentId = Number(formData.get("comment_id"));
  const kind = formData.get("kind") === "down" ? "down" : "up";
  if (!commentId) return;
  await setCommentReaction(user.id, commentId, kind);
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

/* ---- 作者自助:编辑 / 删除 / 可见性(归属校验在 SQL WHERE 里)---- */

export async function updatePostAction(
  _prev: PostFormState | null,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  const postId = Number(formData.get("post_id"));
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const linkUrl = String(formData.get("link_url") || "").trim();
  if (!postId) return { error: t(locale, "err.unknownType") };
  if (!title && !body) return { error: t(locale, "err.empty") };
  if (title.length > 200) return { error: t(locale, "err.titleLong") };
  if (linkUrl && !/^https?:\/\/.+/.test(linkUrl))
    return { error: t(locale, "err.linkInvalid") };
  const ok = await updatePost(user.id, postId, { title, bodyMd: body, linkUrl });
  if (!ok) return { error: t(locale, "err.notOwner") };
  redirect(`/community/${postId}`);
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  if (!postId) return;
  const ok = await deletePost(user.id, postId);
  if (ok) redirect("/community");
}

export async function setPostVisibilityAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  const visibility = formData.get("visibility") === "private" ? "private" : "public";
  if (!postId) return;
  await setPostVisibility(user.id, postId, visibility);
}

export async function updateCommentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const commentId = Number(formData.get("comment_id"));
  const body = String(formData.get("body") || "").trim();
  if (!commentId || !body) return;
  await updateComment(user.id, commentId, body);
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const commentId = Number(formData.get("comment_id"));
  if (!commentId) return;
  await deleteComment(user.id, commentId);
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

/* 主题:暗 ⇄ 亮 翻转(cookie;默认暗)。 */
export async function setThemeAction(): Promise<void> {
  const store = await cookies();
  const cur = store.get("kb_theme")?.value === "light" ? "light" : "dark";
  store.set("kb_theme", cur === "light" ? "dark" : "light", PREF_COOKIE);
}

/* UI 语言:中 ⇄ EN 翻转;登录用户同步写进 users.locale
   (账号偏好同时是 AI 回帖语言的第一优先级)。 */
export async function setLocaleAction(): Promise<void> {
  const user = await getSessionUser();
  const store = await cookies();
  const cur = await getLocale(user);
  const next = cur === "zh" ? "en" : "zh";
  store.set("kb_locale", next, PREF_COOKIE);
  if (user) await setUserLocale(user.id, next);
}

/* 乐观切换的显式持久化:客户端已翻好 cookie,这里只把登录用户的
   账号偏好落库(不等界面,幂等)。 */
export async function saveLocaleAction(locale: string): Promise<void> {
  if (locale !== "zh" && locale !== "en") return;
  const user = await getSessionUser();
  if (user) await setUserLocale(user.id, locale);
}
