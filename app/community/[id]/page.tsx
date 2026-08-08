/* 帖子详情:正文(Markdown)+ 链接卡 / 投票块 + 顶 + 评论区。
   评论按浏览者 show_ai_replies 过滤(v2 决策 3);AI 回复带品牌头像和 AI 标。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowBigUp, Bookmark, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import { relTime } from "@/src/lib/format";
import {
  categoryZh,
  getComments,
  getPoll,
  getPost,
  hasUpVoted,
  isSubscribed,
} from "@/src/lib/posts";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import {
  createCommentAction,
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
  return { title: post ? `${post.title} — kimi.builders` : "kimi.builders" };
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
  const [poll, comments, upVoted, subscribed] = await Promise.all([
    post.type === "poll" ? getPoll(postId, user?.id ?? null) : null,
    getComments(postId, { showAi: user ? user.showAiReplies : true }),
    user ? hasUpVoted(user.id, postId) : false,
    user ? isSubscribed(user.id, postId) : false,
  ]);

  return (
    <div className="pt-8">
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-wider text-grey">
        <Link href="/community" className="hover:text-paper">
          ← 社区
        </Link>
        <span>{categoryZh(post.category)}</span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold leading-snug">{post.title}</h1>
      <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-grey">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
        <span className="text-paper">@{post.handle}</span>
        <span>{relTime(post.createdAt)}</span>
      </div>

      {post.bodyMd && (
        <div className="mt-8">
          <Markdown source={post.bodyMd} />
        </div>
      )}

      {post.linkUrl && (
        <a
          href={post.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block border border-moon p-4 font-mono text-xs text-blue underline-offset-4 transition-colors hover:border-blue hover:underline"
        >
          {post.linkUrl}
        </a>
      )}

      {poll && (
        <div className="mt-6 border border-moon p-5">
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
                投票
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
                        {o.voteCount} 票 · {pct}%
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
                共 {poll.total} 票{!user && " · 登录后可投票"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 动作条:X 风格图标行(赞 / 评论 / 订阅 / 分享),硬边细线承品牌 */}
      <div className="mt-8 flex items-center gap-6 border-y border-moon py-3">
        {user ? (
          <form action={toggleUpAction}>
            <input type="hidden" name="post_id" value={post.id} />
            <button
              type="submit"
              aria-label={upVoted ? "取消点赞" : "点赞"}
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
            title="登录后点赞"
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
              aria-label={subscribed ? "取消订阅" : "订阅本帖讨论"}
              className={`inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
                subscribed ? "text-blue" : "text-grey hover:text-blue"
              }`}
            >
              <Bookmark size={14} fill={subscribed ? "currentColor" : "none"} />
              {subscribed ? "已订阅" : "订阅"}
            </button>
          </form>
        )}
        <span className="ml-auto">
          <ShareButton path={`/community/${post.id}`} title={post.title} />
        </span>
      </div>

      <h2 id="comments" className="mt-10 font-mono text-sm text-grey">
        {comments.length} 条评论
      </h2>
      <ul className="mt-6 space-y-6">
        {comments.map((c) => (
          <li
            key={c.id}
            className={c.isAi ? "border-l-2 border-blue pl-4" : ""}
          >
            <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.isAi ? BOT_AVATAR : (c.avatarUrl ?? "")}
                alt=""
                className="h-5 w-5 rounded-full"
              />
              <span className="text-paper">
                {c.isAi ? BOT_NAME : `@${c.handle}`}
              </span>
              {c.isAi && (
                <span className="border border-blue px-1 py-px text-[9px] tracking-wider text-blue">
                  AI
                </span>
              )}
              <span>{relTime(c.createdAt)}</span>
            </div>
            <div className="mt-2">
              <Markdown source={c.bodyMd} />
            </div>
          </li>
        ))}
      </ul>

      {user ? (
        <form action={createCommentAction} className="mt-10 space-y-3">
          <input type="hidden" name="post_id" value={post.id} />
          <textarea
            name="body"
            rows={4}
            required
            placeholder="写下你的评论(支持 Markdown)…"
            className="w-full border border-moon bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            className="border border-blue px-5 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            评论
          </button>
        </form>
      ) : (
        <p className="mt-10 border-t border-moon pt-6 text-sm text-grey">
          登录后参与评论:
          <a href="/api/auth/github" className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue">
            GitHub
          </a>
          <a href="/api/auth/google" className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue">
            Google
          </a>
        </p>
      )}
    </div>
  );
}
