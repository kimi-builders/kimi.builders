/* 帖子详情:正文(Markdown)+ 链接卡 / 投票块 + 动作条(顶踩/评论/订阅/分享/作者操作)+ 评论区。
   评论按浏览者 show_ai_replies 过滤(v2 决策 3);AI 回复带品牌瓷砖头像和 AI 标。
   楼中楼:parent 链在服务端拍平成「顶层 + 一层回复」,回复层带「回复 @xx」标注。
   标题非强制:无标题帖正文直接当主体。私密帖仅作者可见(外人 404)。
   浏览量只记录不展示:after() 里 +1,不阻塞渲染。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowBigUp, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import { categoryLabel } from "@/src/lib/categories";
import { plainExcerpt, relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  getCommentReactions,
  getComments,
  getPoll,
  getPost,
  getPostReactions,
  incrementViewCount,
  isSubscribed,
  type CommentRow,
} from "@/src/lib/posts";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import CommentSection, {
  type CommentThread,
  type CommentView,
} from "../_components/CommentSection";
import PollVoteForm from "../_components/PollVoteForm";
import PostOwnerActions from "../_components/PostOwnerActions";
import SubscribeButton from "../_components/SubscribeButton";
import VoteCluster from "../_components/VoteCluster";

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
  /* 私密帖仅作者可见;作者本人照常(带「私密」标) */
  if (post.visibility !== "public" && post.userId !== user?.id) notFound();
  after(() => incrementViewCount(postId));

  const locale = await getLocale(user);
  const [poll, comments, postReactions, subscribed] = await Promise.all([
    post.type === "poll" ? getPoll(postId, user?.id ?? null) : null,
    getComments(postId, { showAi: user ? user.showAiReplies : true }),
    user ? getPostReactions(user.id, [postId]) : { up: new Set<number>(), down: new Set<number>() },
    user ? isSubscribed(user.id, postId) : false,
  ]);
  const commentReactions = user
    ? await getCommentReactions(user.id, comments.map((c) => c.id))
    : { up: new Set<number>(), down: new Set<number>() };
  const upVoted = postReactions.up.has(postId);
  const downVoted = postReactions.down.has(postId);

  /* 组装两级楼中楼:顶层按时间升序;任何深度的回复拍平进根的一层列表 */
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootEntries = new Map<number, CommentThread>();
  const threads: CommentThread[] = [];
  const view = (
    c: CommentRow,
    replyToAuthor: string | null,
  ): CommentView => ({
    id: c.id,
    authorId: c.userId,
    isAi: c.isAi,
    author: c.isAi ? BOT_NAME : `@${c.handle}`,
    avatarUrl: c.isAi ? BOT_AVATAR : (c.avatarUrl ?? ""),
    time: relTime(c.createdAt, locale),
    edited: !!c.editedAt,
    score: c.score,
    replyToAuthor,
    bodyMd: c.bodyMd,
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
        {post.visibility === "private" && (
          <span
            className="border border-line px-1.5 py-px text-[10px] text-paper"
            title={t(locale, "post.privateHint")}
          >
            {t(locale, "post.private")}
          </span>
        )}
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
        {post.editedAt && <span>({t(locale, "post.edited")})</span>}
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
            <PollVoteForm
              postId={post.id}
              options={poll.options.map((o) => ({ id: o.id, label: o.label }))}
              locale={locale}
            />
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

      {/* 动作条:顶/踩 + 评论 + 订阅 + 分享 + 作者操作(编辑/可见性/删除) */}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line py-3">
        {user ? (
          <VoteCluster
            target="post"
            id={post.id}
            score={post.score}
            up={upVoted}
            down={downVoted}
            locale={locale}
            size={16}
          />
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
          title={t(locale, "post.comments", { n: post.commentCount })}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-blue"
        >
          <MessageCircle size={14} />
          {post.commentCount}
        </a>
        {user && (
          <SubscribeButton
            postId={post.id}
            subscribed={subscribed}
            locale={locale}
          />
        )}
        {user && post.userId === user.id && (
          <PostOwnerActions
            postId={post.id}
            visibility={post.visibility}
            locale={locale}
          />
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
        meId={user?.id ?? null}
        total={comments.length}
        threads={threads}
        upIds={[...commentReactions.up]}
        downIds={[...commentReactions.down]}
      />
    </div>
  );
}
