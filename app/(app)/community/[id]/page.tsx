/* 帖子详情:正文(Markdown)+ 链接卡 / 投票块 + 动作条(赞/评论/订阅/分享)+ 评论区。
   评论按浏览者 show_ai_replies 过滤(v2 决策 3);AI 回复带品牌瓷砖头像和 AI 标。
   楼中楼:parent 链在服务端拍平成「顶层 + 一层回复」,回复层带「回复 @xx」标注。
   标题非强制:无标题帖正文直接当主体。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowBigUp, Bookmark, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import { categoryLabel } from "@/src/lib/categories";
import { plainExcerpt, relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  getComments,
  getPoll,
  getPost,
  hasUpVoted,
  isSubscribed,
  type CommentRow,
} from "@/src/lib/posts";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import CommentSection, {
  type CommentThread,
  type CommentView,
} from "../_components/CommentSection";
import {
  toggleSubscribeAction,
  toggleUpAction,
  votePollAction,
} from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(Number(id) || 0);
  if (!post) return { title: "kimi.builders" };
  const name = post.title || plainExcerpt(post.bodyMd, 60);
  return { title: `${name} — kimi.builders` };
}

/* parent 链 → 根评论 id(带环保护;parent 缺失时退化自身为根) */
function rootIdOf(c: CommentRow, byId: Map<number, CommentRow>): number {
  let cur = c;
  const seen = new Set<number>();
  while (cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const p = byId.get(cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur.id;
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();
  const post = await getPost(postId);
  if (!post) notFound();

  const user = await getSessionUser();
  const locale = await getLocale(user);
  const [poll, comments, upVoted, subscribed] = await Promise.all([
    post.type === "poll" ? getPoll(postId, user?.id ?? null) : null,
    getComments(postId, { showAi: user ? user.showAiReplies : true }),
    user ? hasUpVoted(user.id, postId) : false,
    user ? isSubscribed(user.id, postId) : false,
  ]);

  /* 组装两级楼中楼:顶层按时间升序;任何深度的回复拍平进根的一层列表 */
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootEntries = new Map<number, CommentThread>();
  const threads: CommentThread[] = [];
  const view = (
    c: CommentRow,
    replyToAuthor: string | null,
  ): CommentView => ({
    id: c.id,
    isAi: c.isAi,
    author: c.isAi ? BOT_NAME : `@${c.handle}`,
    avatarUrl: c.isAi ? BOT_AVATAR : (c.avatarUrl ?? ""),
    time: relTime(c.createdAt, locale),
    replyToAuthor,
    body: <Markdown source={c.bodyMd} />,
  });
  for (const c of comments) {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (!c.parentId || !parent) {
      const entry: CommentThread = { ...view(c, null), replies: [] };
      threads.push(entry);
      rootEntries.set(c.id, entry);
      continue;
    }
    const replyToAuthor = parent.isAi ? BOT_NAME : `@${parent.handle}`;
    const entry = rootEntries.get(rootIdOf(c, byId));
    if (entry) entry.replies.push(view(c, replyToAuthor));
    else {
      /* 兜底:根不在本页(评论被过滤)时按顶层显示 */
      const fallback: CommentThread = { ...view(c, replyToAuthor), replies: [] };
      threads.push(fallback);
      rootEntries.set(c.id, fallback);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-wider text-grey">
        <Link href="/community" className="hover:text-paper">
          ← {t(locale, "nav.community")}
        </Link>
        <span>{categoryLabel(locale, post.category)}</span>
      </div>

      {post.title && (
        <h1 className="mt-4 text-2xl font-semibold leading-snug">{post.title}</h1>
      )}
      <div
        className={`flex items-center gap-3 font-mono text-[11px] text-grey ${
          post.title ? "mt-3" : "mt-4"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
        <span className="text-paper">@{post.handle}</span>
        <span>{relTime(post.createdAt, locale)}</span>
      </div>

      {post.bodyMd && (
        <div className={post.title ? "mt-8" : "mt-6"}>
          <Markdown source={post.bodyMd} />
        </div>
      )}

      {post.linkUrl && (
        <a
          href={post.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block border border-line p-4 font-mono text-xs text-blue underline-offset-4 transition-colors hover:border-blue hover:underline"
        >
          {post.linkUrl}
        </a>
      )}

      {poll && (
        <div className="mt-6 border border-line p-5">
          {user && poll.myOptionId === null ? (
            <form action={votePollAction} className="space-y-3">
              <input type="hidden" name="post_id" value={post.id} />
              {poll.options.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-3 text-sm text-paper"
                >
                  <input
                    type="radio"
                    name="option_id"
                    value={o.id}
                    className="accent-blue"
                    required
                  />
                  {o.label}
                </label>
              ))}
              <button
                type="submit"
                className="border border-blue px-4 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
              >
                {t(locale, "post.vote")}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              {poll.options.map((o) => {
                const pct = poll.total ? Math.round((o.voteCount / poll.total) * 100) : 0;
                const mine = o.id === poll.myOptionId;
                return (
                  <div key={o.id}>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className={mine ? "text-blue" : "text-paper"}>
                        {o.label}
                        {mine && " ✓"}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-grey">
                        {o.voteCount} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1 bg-moon">
                      <div
                        className={`h-full ${mine ? "bg-blue" : "bg-grey/50"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="font-mono text-[11px] text-grey">
                {t(locale, "post.votesTotal", { n: poll.total })}
                {!user && ` · ${t(locale, "post.loginToVote")}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 动作条:X 风格图标行(赞 / 评论 / 订阅 / 分享),硬边细线承品牌 */}
      <div className="mt-8 flex items-center gap-6 border-y border-line py-3">
        {user ? (
          <form action={toggleUpAction}>
            <input type="hidden" name="post_id" value={post.id} />
            <button
              type="submit"
              aria-label={t(locale, upVoted ? "post.unup" : "post.up")}
              className={`inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
                upVoted ? "text-blue" : "text-grey hover:text-blue"
              }`}
            >
              <ArrowBigUp size={16} fill={upVoted ? "currentColor" : "none"} />
              {post.score}
            </button>
          </form>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-xs text-grey"
            title={t(locale, "post.loginToUpvote")}
          >
            <ArrowBigUp size={16} />
            {post.score}
          </span>
        )}
        <a
          href="#comments"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-blue"
        >
          <MessageCircle size={14} />
          {post.commentCount}
        </a>
        {user && (
          <form action={toggleSubscribeAction}>
            <input type="hidden" name="post_id" value={post.id} />
            <button
              type="submit"
              aria-label={t(locale, subscribed ? "post.unsubscribe" : "post.subscribe")}
              className={`inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
                subscribed ? "text-blue" : "text-grey hover:text-blue"
              }`}
            >
              <Bookmark size={14} fill={subscribed ? "currentColor" : "none"} />
              {t(locale, subscribed ? "post.subscribed" : "post.subscribe")}
            </button>
          </form>
        )}
        <span className="ml-auto">
          <ShareButton
            path={`/community/${post.id}`}
            title={post.title || plainExcerpt(post.bodyMd, 60)}
            locale={locale}
          />
        </span>
      </div>

      <CommentSection
        postId={post.id}
        locale={locale}
        loggedIn={!!user}
        total={comments.length}
        threads={threads}
      />
    </div>
  );
}
