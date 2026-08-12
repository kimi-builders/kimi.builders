"use server";

/* 社区写操作 + UI 偏好切换。UI 对未登录用户不渲染入口,这里再兜底一次(session 为空即拒)。
   mutation 统一返回 MutationResult({ ok, error? }):客户端按结果 toast 反馈并
   router.refresh() 换当前页数据;同时这里用 revalidatePath 作废受影响路径的
   预取缓存(Next 16:Link 预取会被后续导航复用,只有 revalidate* 能 silently 刷新),
   否则删帖后回 feed 会看到旧卡片。
   顶/踩走纯乐观更新(只落库、不作废路径):分数展示本来就是客户端态,避免每票都刷新全站。 */
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { setUserLocale } from "@/src/lib/auth/users";
import {
  canModerate,
  clearPostFeatured,
  FEATURED_REASON_MAX,
  normalizeFeaturedReason,
  setPostFeatured,
} from "@/src/lib/featured";
import { HOME_CACHE_TAG } from "@/src/lib/home";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { enqueueAiReply } from "@/src/lib/ai-reply";
import { getActiveMute, muteMessage } from "@/src/lib/moderation";
import { consumeCommunityRateLimit } from "@/src/lib/rate-limit";
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
import {
  loadCommentPage,
  type CommentPageData,
} from "./_components/comment-page";
import {
  loadFeedCards,
  type FeedPageData,
} from "./_components/feed-page";

export interface PostFormState {
  error?: string;
  /* 限流(P1-5):超限时带上的等待秒数,客户端可直接展示 error 文案 */
  retryAfterSeconds?: number;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export async function createPostAction(
  _prev: PostFormState | null,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  /* 禁言(20260830):到期自动解除;提示带截止日期 */
  const muted = await getActiveMute(user.id);
  if (muted) return { error: muteMessage(locale, muted) };

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

  /* 限流(P1-5):校验通过后、写库前消耗额度——校验失败不烧配额 */
  const rate = await consumeCommunityRateLimit(user.id, "post");
  if (!rate.allowed)
    return {
      error: t(locale, "err.ratePost", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };

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
  revalidatePath("/community");
  redirect(`/community/${postId}`);
}

export async function createCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  /* 禁言(20260830):到期自动解除 */
  const muted = await getActiveMute(user.id);
  if (muted) return { ok: false, error: muteMessage(locale, muted) };
  const postId = Number(formData.get("post_id"));
  const body = String(formData.get("body") || "").trim();
  const parentId = Number(formData.get("parent_id")) || null;
  if (!postId) return { ok: false, error: t(locale, "err.generic") };
  if (!body) return { ok: false, error: t(locale, "err.commentEmpty") };
  /* 楼中楼:parent 必须存在、属于同帖、未删除;层级不限,展示侧拍平到两层 */
  let parent: { id: number; isAi: boolean; userId: number | null } | null = null;
  if (parentId) {
    parent = await getCommentForReply(parentId, postId);
    if (!parent) return { ok: false, error: t(locale, "err.generic") };
  }
  /* 限流(P1-5):parent 校验通过后、写库前消耗额度 */
  const rate = await consumeCommunityRateLimit(user.id, "comment");
  if (!rate.allowed)
    return {
      ok: false,
      error: t(locale, "err.rateComment", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  const commentId = await createComment(postId, user.id, body, parentId);
  /* 回复了 AI 的评论 → 触发 AI 接话(带对话链上下文)。
     门槛:帖子允许 AI + 回帖人全局允许 AI;链路深度上限在执行侧。 */
  if (parent?.isAi && user.aiRepliesEnabled) {
    const post = await getPost(postId);
    if (post?.aiReply) await enqueueAiReply(postId, commentId);
  }
  revalidatePath(`/community/${postId}`);
  revalidatePath("/community"); /* feed 卡片上的评论数 */
  return { ok: true };
}

/* 评论「加载更多」:只读,不落库不作废缓存。返回服务端渲染好的一页
   (ReactNode 随 RSC 序列化),客户端直接追加;私密帖仅作者可翻页(同详情页)。 */
export async function loadMoreCommentsAction(
  postId: number,
  after: number,
): Promise<({ ok: true } & CommentPageData) | { ok: false }> {
  const user = await getSessionUser();
  if (
    !Number.isInteger(postId) ||
    postId <= 0 ||
    !Number.isInteger(after) ||
    after < 0
  )
    return { ok: false };
  const post = await getPost(postId);
  if (!post) return { ok: false };
  if (post.visibility !== "public" && post.userId !== user?.id)
    return { ok: false };
  const locale = await getLocale(user);
  const data = await loadCommentPage(postId, user, locale, after);
  return { ok: true, ...data };
}

/* feed「加载更多」(P1-4):只读,不落库不作废缓存。返回服务端渲染好的一页卡片
   (ReactNode 随 RSC 序列化),客户端直接追加;私密/点踩/订阅过滤与首屏同口径
   (都在 getFeedPage 里),游标非法时拿到空页,按钮自然收起。 */
export async function loadMorePostsAction(
  scope: { sort: string; cat: string | null; sub: boolean },
  after: string,
): Promise<({ ok: true } & FeedPageData) | { ok: false }> {
  if (typeof after !== "string" || after.length === 0 || after.length > 64)
    return { ok: false };
  const user = await getSessionUser();
  const sort = scope.sort === "new" ? "new" : "hot";
  const sub = scope.sub && !!user;
  const locale = await getLocale(user);
  const data = await loadFeedCards(
    {
      sort,
      category: scope.cat ?? undefined,
      subscriberId: sub && user ? user.id : undefined,
      viewerId: user?.id,
      after,
    },
    locale,
  );
  return { ok: true, ...data };
}

/* 顶/踩:乐观更新路径,只落库;同向再点=取消,反向=换边。
   限流(P1-5):post/comment 投票共享 vote 配额;超限返回结构化错误,
   客户端据 !ok 回滚乐观态并 toast。 */
export async function setPostReactionAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  const kind = formData.get("kind") === "down" ? "down" : "up";
  if (!postId) return { ok: false };
  const rate = await consumeCommunityRateLimit(user.id, "vote");
  if (!rate.allowed) {
    const locale = await getLocale(user);
    return {
      ok: false,
      error: t(locale, "err.rateVote", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }
  await setPostReaction(user.id, postId, kind);
  return { ok: true };
}

export async function setCommentReactionAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const commentId = Number(formData.get("comment_id"));
  const kind = formData.get("kind") === "down" ? "down" : "up";
  if (!commentId) return { ok: false };
  const rate = await consumeCommunityRateLimit(user.id, "vote");
  if (!rate.allowed) {
    const locale = await getLocale(user);
    return {
      ok: false,
      error: t(locale, "err.rateVote", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }
  await setCommentReaction(user.id, commentId, kind);
  return { ok: true };
}

/* 订阅:乐观更新路径;作废旧 feed 预取(「订阅」页签内容会变)。 */
export async function toggleSubscribeAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  if (!postId) return;
  await toggleSubscribe(user.id, postId);
  revalidatePath("/community");
}

export async function votePollAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  const optionId = Number(formData.get("option_id"));
  if (!postId || !optionId) return { ok: false };
  const r = await votePoll(user.id, postId, optionId);
  if (r === "ok") revalidatePath(`/community/${postId}`);
  return { ok: r === "ok" };
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
  const category = String(formData.get("category") || "chat");
  if (!postId) return { error: t(locale, "err.unknownType") };
  if (!title && !body) return { error: t(locale, "err.empty") };
  if (title.length > 200) return { error: t(locale, "err.titleLong") };
  if (linkUrl && !/^https?:\/\/.+/.test(linkUrl))
    return { error: t(locale, "err.linkInvalid") };
  if (!CATEGORIES.some((c) => c.id === category))
    return { error: t(locale, "err.unknownCat") };
  const ok = await updatePost(user.id, postId, { title, bodyMd: body, linkUrl, category });
  if (!ok) return { error: t(locale, "err.notOwner") };
  revalidatePath(`/community/${postId}`);
  revalidatePath("/community");
  redirect(`/community/${postId}`);
}

/* 删除不 redirect:由客户端 toast 后自行跳转;作废 feed 预取,否则回列表看到旧卡片。 */
export async function deletePostAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  if (!postId) return { ok: false };
  const ok = await deletePost(user.id, postId);
  if (ok) revalidatePath("/community");
  return { ok };
}

export async function setPostVisibilityAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  const visibility = formData.get("visibility") === "private" ? "private" : "public";
  if (!postId) return { ok: false };
  const ok = await setPostVisibility(user.id, postId, visibility);
  if (ok) {
    revalidatePath(`/community/${postId}`);
    revalidatePath("/community");
  }
  return { ok };
}

/* 评论改/删只有 commentId,取 postId 要多查一次 —— 用动态路由模式整体作废详情页。 */
export async function updateCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const commentId = Number(formData.get("comment_id"));
  const body = String(formData.get("body") || "").trim();
  if (!commentId || !body) return { ok: false };
  const ok = await updateComment(user.id, commentId, body);
  if (ok) revalidatePath("/community/[id]", "page");
  return { ok };
}

export async function deleteCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const commentId = Number(formData.get("comment_id"));
  if (!commentId) return { ok: false };
  const ok = await deleteComment(user.id, commentId);
  if (ok) {
    revalidatePath("/community/[id]", "page");
    revalidatePath("/community");
  }
  return { ok };
}

/* ---- 编辑精选(admin/mod 定夺,署名到编辑本人;每周精选 v0)---- */

export async function featurePostAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  if (!canModerate(user.role))
    return { ok: false, error: t(locale, "err.forbidden") };
  const postId = Number(formData.get("post_id"));
  if (!postId) return { ok: false, error: t(locale, "err.generic") };
  const raw = String(formData.get("reason") || "");
  if (raw.trim().length > FEATURED_REASON_MAX)
    return { ok: false, error: t(locale, "err.reasonLong") };
  const reason = normalizeFeaturedReason(raw);
  if (!reason) return { ok: false, error: t(locale, "err.reasonRequired") };
  const ok = await setPostFeatured(user.id, postId, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  /* 首页数据走 tag 缓存(updateTag 即时作废),详情页/首页路径缓存一并清 */
  updateTag(HOME_CACHE_TAG);
  revalidatePath(`/community/${postId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function unfeaturePostAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  if (!canModerate(user.role))
    return { ok: false, error: t(locale, "err.forbidden") };
  const postId = Number(formData.get("post_id"));
  if (!postId) return { ok: false, error: t(locale, "err.generic") };
  const ok = await clearPostFeatured(postId);
  if (ok) {
    updateTag(HOME_CACHE_TAG);
    revalidatePath(`/community/${postId}`);
    revalidatePath("/");
  }
  return { ok };
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
