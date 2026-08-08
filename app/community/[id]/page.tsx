/* 帖子详情:正文(Markdown)+ 链接卡 / 投票块 + 顶 + 评论区。
   评论按浏览者 show_ai_replies 过滤(v2 决策 3);AI 回复带品牌头像和 AI 标。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import { relTime } from "@/src/lib/format";
import {
  categoryZh,
  getComments,
  getPoll,
  getPost,
  hasUpVoted,
} from "@/src/lib/posts";
import Markdown from "@/components/Markdown";
import {
  createCommentAction,
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
  const [poll, comments, upVoted] = await Promise.all([
    post.type === "poll" ? getPoll(postId, user?.id ?? null) : null,
    getComments(postId, { showAi: user ? user.showAiReplies : true }),
    user ? hasUpVoted(user.id, postId) : false,
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
        <form action={toggleUpAction} className="ml-auto">
          <input type="hidden" name="post_id" value={post.id} />
          {user ? (
            <button
              type="submit"
              className={`border px-3 py-1 transition-colors ${
                upVoted
                  ? "border-blue text-blue"
                  : "border-moon text-grey hover:border-blue hover:text-blue"
              }`}
            >
              ▲ {post.score}
            </button>
          ) : (
            <span className="border border-moon px-3 py-1">▲ {post.score}</span>
          )}
        </form>
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

      <h2 className="mt-12 border-t border-moon pt-6 font-mono text-sm text-grey">
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
