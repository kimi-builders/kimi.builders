"use server";

/* Community write operations + UI preference toggles. The UI hides
   entries from signed-out users; this re-checks (empty session =
   reject). Mutations uniformly return a MutationResult ({ ok, error? }):
   clients toast on the result and router.refresh() for fresh page data;
   revalidatePath here also invalidates the affected paths' prefetched
   caches (in Next 16, Link prefetches are reused by later navigations —
   only revalidate* refreshes them silently), or a deleted post would
   still show on the feed after returning. Votes are purely optimistic
   (write only, no path invalidation): scores are client state anyway,
   and every vote shouldn't refresh the site. */
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { getSessionUser } from "@/src/lib/auth/session";
import { setUserLocale } from "@/src/lib/auth/users";
import {
  PUBLIC_FEATURED_CACHE_TAG,
  PUBLIC_POSTS_CACHE_TAG,
} from "@/src/lib/cache-tags";
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
import { hasKimiMention } from "@/src/lib/mention-kimi";
import { getActiveMute, muteMessage } from "@/src/lib/moderation";
import { consumeCommunityRateLimit } from "@/src/lib/rate-limit";
import {
  CATEGORIES,
  createCommentForVisiblePost,
  createPost,
  deleteComment,
  deletePost,
  getPost,
  getVisibleCommentAccess,
  getVisiblePostAccess,
  POST_BODY_MAX,
  setCommentReactionForViewer,
  setPostReactionForViewer,
  setPostVisibility,
  setPostSolved,
  toggleSubscribeForViewer,
  updateComment,
  updatePost,
  votePollForViewer,
} from "@/src/lib/posts";
import { normalizeVibe } from "@/src/lib/vibe";
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
  /* Rate limit: wait seconds carried on rejection; clients can show the
     error copy directly. */
  retryAfterSeconds?: number;
  /* Success lands on the detail page via client router.push — redirect()
     inside the action only moves the background page; the intercepted
     @modal slot doesn't unmount (verified 2026-08-14). */
  ok?: boolean;
  postId?: number;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
  /* AI summon outcome: client toast material when a comment @-s kimi;
     the comment publishes either way and this field only says whether
     the summon took. */
  aiNote?: "summoned" | "aiDisabled" | "rate";
  /* New comment id: after a successful summon the client polls for the
     reply against it. */
  commentId?: number;
}

export async function createPostAction(
  _prev: PostFormState | null,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  /* Mutes lift automatically at expiry; the message carries the
     deadline. */
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

  /* Neither title nor body is required — at least one (a low posting
     bar, after V2EX/X). */
  if (!title && !body) return { error: t(locale, "err.empty") };
  if (title.length > 200) return { error: t(locale, "err.titleLong") };
  /* Body cap: over the limit is a direct error; the lib layer keeps a
     slice backstop. */
  if (body.length > POST_BODY_MAX) return { error: t(locale, "err.bodyLong") };
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

  /* Rate limit: consumed after validation but before the write — a
     failed validation never burns quota. */
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
  /* Queue the AI reply: the post's switch checked, or an @kimi in the
     body (the author is the summoner; it replies either way — merged
     with the auto reply as one, kind=mention); the author's global
     switch outranks everything. enqueue uses after() internally and
     must run before the return. */
  const mentioned = hasKimiMention(body);
  if ((aiReply || mentioned) && user.aiRepliesEnabled)
    await enqueueAiReply(postId, null, mentioned ? "mention" : "auto");
  updateTag(PUBLIC_POSTS_CACHE_TAG);
  revalidatePath("/community");
  /* Land on the detail page: no redirect() in the action (the modal
     slot doesn't follow); the client router.pushes. */
  return { ok: true, postId };
}

export async function createCommentAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  /* Mutes lift automatically at expiry. */
  const muted = await getActiveMute(user.id);
  if (muted) return { ok: false, error: muteMessage(locale, muted) };
  const postId = Number(formData.get("post_id"));
  const body = String(formData.get("body") || "").trim();
  const parentId = Number(formData.get("parent_id")) || null;
  if (!postId) return { ok: false, error: t(locale, "err.generic") };
  if (!body) return { ok: false, error: t(locale, "err.commentEmpty") };
  /* Invisible/missing unify into a generic error, rejected before
     consuming rate-limit quota — no side channels, no wasted writes. */
  if (!(await getVisiblePostAccess(postId, user)))
    return { ok: false, error: t(locale, "err.generic") };
  const parent = parentId
    ? await getVisibleCommentAccess(parentId, user)
    : null;
  if (parentId && (!parent || parent.postId !== postId))
    return { ok: false, error: t(locale, "err.generic") };
  /* Rate limit: consumed after the parent validates, before the write. */
  const rate = await consumeCommunityRateLimit(user.id, "comment");
  if (!rate.allowed)
    return {
      ok: false,
      error: t(locale, "err.rateComment", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  /* Lock the post and re-run the gate inside the transaction before the
     real INSERT, closing the visibility race after the pre-check. */
  const created = await createCommentForVisiblePost(user, postId, body, parentId);
  if (!created) return { ok: false, error: t(locale, "err.generic") };
  /* Replying to an AI comment -> an AI follow-up (with the dialog-chain
     context). Gates: the post allows AI + the replier globally allows
     AI; the chain-depth cap lives at execution. Duplicates never
     trigger — a network retry must not double the AI replies. */
  let aiNote: MutationResult["aiNote"];
  if (!created.duplicate && parent?.isAi && user.aiRepliesEnabled) {
    const post = await getPost(postId);
    if (post?.aiReply) await enqueueAiReply(postId, created.id, "chain");
  } else if (!created.duplicate && hasKimiMention(body) && user.aiRepliesEnabled) {
    /* @kimi summon: mutually exclusive with chain (replying to AI with
       an @kimi just continues the thread). Territory rule: the post
       owner's AI switch off means no summon (aiNote tells the
       summoner); summons carry their own limit (ai_summon 20/hour) —
       over it, no summon but the comment still publishes. */
    const post = await getPost(postId);
    if (!post?.aiReply) {
      aiNote = "aiDisabled";
    } else {
      const summonRate = await consumeCommunityRateLimit(user.id, "ai_summon");
      if (!summonRate.allowed) {
        aiNote = "rate";
      } else {
        await enqueueAiReply(postId, created.id, "mention");
        aiNote = "summoned";
      }
    }
  }
  updateTag(PUBLIC_POSTS_CACHE_TAG);
  revalidatePath(`/community/${postId}`);
  revalidatePath("/community"); /* feed 卡片上的评论数 */
  return { ok: true, commentId: created.id, ...(aiNote ? { aiNote } : {}) };
}

/* Comment "load more": read-only — no writes, no invalidation. Returns
   a server-rendered page (ReactNode over RSC) for the client to append;
   private posts page only for the author (same gate as the detail
   page). */
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
  if (!(await getVisiblePostAccess(postId, user))) return { ok: false };
  const locale = await getLocale(user);
  const data = await loadCommentPage(postId, user, locale, after);
  return { ok: true, ...data };
}

/* Feed "load more": read-only — no writes, no invalidation. Returns a
   server-rendered page of cards (ReactNode over RSC) for the client to
   append; private/down-voted/subscribed filtering matches the first
   page exactly (all inside getFeedPage); an invalid cursor yields an
   empty page and the button naturally folds away. */
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

/* Up/down votes: the optimistic path, write only; same direction again
   = cancel, opposite = switch. Rate limit: post/comment votes share
   the vote quota; over it returns a structured error, and clients roll
   back the optimistic state on !ok and toast. */
export async function setPostReactionAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  const kind = formData.get("kind") === "down" ? "down" : "up";
  if (!postId) return { ok: false };
  if (!(await getVisiblePostAccess(postId, user))) return { ok: false };
  const rate = await consumeCommunityRateLimit(user.id, "vote");
  if (!rate.allowed) {
    const locale = await getLocale(user);
    return {
      ok: false,
      error: t(locale, "err.rateVote", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }
  const ok = await setPostReactionForViewer(user, postId, kind);
  if (ok) updateTag(PUBLIC_POSTS_CACHE_TAG);
  return { ok };
}

export async function setCommentReactionAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const commentId = Number(formData.get("comment_id"));
  const kind = formData.get("kind") === "down" ? "down" : "up";
  if (!commentId) return { ok: false };
  if (!(await getVisibleCommentAccess(commentId, user))) return { ok: false };
  const rate = await consumeCommunityRateLimit(user.id, "vote");
  if (!rate.allowed) {
    const locale = await getLocale(user);
    return {
      ok: false,
      error: t(locale, "err.rateVote", { s: rate.retryAfterSeconds }),
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }
  return { ok: await setCommentReactionForViewer(user, commentId, kind) };
}

/* Subscribe: optimistic path; invalidates stale feed prefetches (the
   "subscribed" tab's content changes). */
export async function toggleSubscribeAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const postId = Number(formData.get("post_id"));
  if (!postId) return;
  if (!(await getVisiblePostAccess(postId, user))) return;
  if (!(await toggleSubscribeForViewer(user, postId))) return;
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
  if (!(await getVisiblePostAccess(postId, user))) return { ok: false };
  const r = await votePollForViewer(user, postId, optionId);
  if (r === "ok") revalidatePath(`/community/${postId}`);
  return { ok: r === "ok" };
}

/* ---- Author self-service: edit / delete / visibility (ownership
   pinned in SQL WHERE) ---- */

export async function updatePostAction(
  _prev: PostFormState | null,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  /* Mute check on edit too — editing is also a speaking surface, the
     same bar as creating. */
  const muted = await getActiveMute(user.id);
  if (muted) return { error: muteMessage(locale, muted) };
  const postId = Number(formData.get("post_id"));
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const linkUrl = String(formData.get("link_url") || "").trim();
  const category = String(formData.get("category") || "chat");
  if (!postId) return { error: t(locale, "err.unknownType") };
  if (!title && !body) return { error: t(locale, "err.empty") };
  if (title.length > 200) return { error: t(locale, "err.titleLong") };
  /* Body cap: same rule as creating. */
  if (body.length > POST_BODY_MAX) return { error: t(locale, "err.bodyLong") };
  if (linkUrl && !/^https?:\/\/.+/.test(linkUrl))
    return { error: t(locale, "err.linkInvalid") };
  if (!CATEGORIES.some((c) => c.id === category))
    return { error: t(locale, "err.unknownCat") };
  const ok = await updatePost(user.id, postId, { title, bodyMd: body, linkUrl, category });
  if (!ok) return { error: t(locale, "err.notOwner") };
  updateTag(PUBLIC_POSTS_CACHE_TAG);
  updateTag(PUBLIC_FEATURED_CACHE_TAG);
  revalidatePath(`/community/${postId}`);
  revalidatePath("/community");
  return { ok: true, postId };
}

/* Delete doesn't redirect: the client toasts and navigates itself;
   stale feed prefetches are invalidated or the list shows old cards. */
export async function deletePostAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  if (!postId) return { ok: false };
  const ok = await deletePost(user.id, postId);
  if (ok) {
    updateTag(PUBLIC_POSTS_CACHE_TAG);
    updateTag(PUBLIC_FEATURED_CACHE_TAG);
    revalidatePath("/community");
  }
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
    updateTag(PUBLIC_POSTS_CACHE_TAG);
    updateTag(PUBLIC_FEATURED_CACHE_TAG);
    revalidatePath(`/community/${postId}`);
    revalidatePath("/community");
  }
  return { ok };
}

/* Solved toggle: the author or moderation (decided inside
   setPostSolved); feed and detail stay in sync. */
export async function setPostSolvedAction(
  formData: FormData,
): Promise<MutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const postId = Number(formData.get("post_id"));
  if (!postId) return { ok: false };
  const ok = await setPostSolved(user, postId, formData.get("solved") === "1");
  if (ok) {
    updateTag(PUBLIC_POSTS_CACHE_TAG);
    revalidatePath(`/community/${postId}`);
    revalidatePath("/community");
  }
  return { ok };
}

/* Comment edit/delete only carry commentId — fetching postId would
   cost another query, so the dynamic-route pattern invalidates the
   whole detail page. */
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
    updateTag(PUBLIC_POSTS_CACHE_TAG);
    revalidatePath("/community/[id]", "page");
    revalidatePath("/community");
  }
  return { ok };
}

/* ---- Editorial featuring (admin/mod ruling, attributed to the
   editor; weekly featured v0) ---- */

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
  /* Home data goes through tag caches (updateTag invalidates now);
     detail/home path caches are cleared alongside. */
  updateTag(HOME_CACHE_TAG);
  updateTag(PUBLIC_FEATURED_CACHE_TAG);
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
    updateTag(PUBLIC_FEATURED_CACHE_TAG);
    revalidatePath(`/community/${postId}`);
    revalidatePath("/");
  }
  return { ok };
}

/* ---- UI preferences (cookies, one year; semantics in
   src/lib/prefs.ts) ---- */

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

/* Theme: dark <-> light flip (cookie; dark by default). */
export async function setThemeAction(): Promise<void> {
  const store = await cookies();
  const cur = store.get("kb_theme")?.value === "light" ? "light" : "dark";
  store.set("kb_theme", cur === "light" ? "dark" : "light", PREF_COOKIE);
}

/* Visual vibe: angular poster <-> rounded classic soft (the default is
   configurable via DEFAULT_VIBE in src/lib/vibe.ts); flips the cookie
   only — vibes are pure CSS-variable followers (globals.css data-vibe
   blocks). */
export async function setVibeAction(): Promise<void> {
  const store = await cookies();
  const cur = normalizeVibe(store.get("kb_vibe")?.value);
  store.set("kb_vibe", cur === "soft" ? "poster" : "soft", PREF_COOKIE);
}

/* UI language: zh <-> EN flip; signed-in users also persist
   users.locale (the account preference is also the first priority for
   AI reply language). */
export async function setLocaleAction(): Promise<void> {
  const user = await getSessionUser();
  const store = await cookies();
  const cur = await getLocale(user);
  const next = cur === "zh" ? "en" : "zh";
  store.set("kb_locale", next, PREF_COOKIE);
  if (user) await setUserLocale(user.id, next);
}

/* Explicit persistence for optimistic toggles: the client already
   flipped the cookie; this only persists the signed-in user's account
   preference (not waiting on the UI, idempotent). */
export async function saveLocaleAction(locale: string): Promise<void> {
  if (locale !== "zh" && locale !== "en") return;
  const user = await getSessionUser();
  if (user) await setUserLocale(user.id, locale);
}
