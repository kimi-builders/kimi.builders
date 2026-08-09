/* 帖子详情:正文(Markdown)+ 链接卡 / 投票块 + 动作条(顶踩/评论/订阅/分享/作者操作)+ 评论区。
   评论按浏览者 show_ai_replies 过滤(v2 决策 3);AI 回复带品牌瓷砖头像和 AI 标。
   评论分页:首屏 SSR 第一页(每页 50 条顶层,回复随根带出),「加载更多」由
   CommentSection 走 server action 追加;动作条与评论区标题的计数都用可见评论总数
   (与列表同口径,滤软删、随 show_ai_replies 过滤),保证计数与可见数始终吻合。
   楼中楼:parent 链在服务端拍平成「顶层 + 一层回复」,回复层带「回复 @xx」标注。
   标题非强制:无标题帖正文直接当主体。私密帖仅作者可见(外人 404)。
   浏览量只记录不展示:after() 里 +1,不阻塞渲染。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowBigUp, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { canModerate, getPostFeatured } from "@/src/lib/featured";
import { plainExcerpt, relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  getPoll,
  getPost,
  getPostReactions,
  incrementViewCount,
  isSubscribed,
} from "@/src/lib/posts";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import CommentSection from "../_components/CommentSection";
import { loadCommentPage } from "../_components/comment-page";
import FeaturedToggle from "../_components/FeaturedToggle";
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
  const [poll, commentPage, postReactions, subscribed, postFeatured] = await Promise.all([
    post.type === "poll" ? getPoll(postId, user?.id ?? null) : null,
    loadCommentPage(postId, user, locale),
    user ? getPostReactions(user.id, [postId]) : { up: new Set<number>(), down: new Set<number>() },
    user ? isSubscribed(user.id, postId) : false,
    getPostFeatured(postId),
  ]);
  const upVoted = postReactions.up.has(postId);
  const downVoted = postReactions.down.has(postId);
  /* 精选操作入口:admin/mod 可见(与是否作者无关),action 层再校验一次 */
  const canFeature = !!user && canModerate(user.role);

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
        {/* 编辑精选徽章:理由 + 定夺编辑放在 title(硬边描边芯片,对齐「私密」标) */}
        {postFeatured && (
          <span
            className="border border-blue/60 px-1.5 py-px text-[10px] text-blue"
            title={`${postFeatured.reason}${
              postFeatured.editorHandle
                ? ` ${t(locale, "featured.by", { handle: postFeatured.editorHandle })}`
                : ""
            }`}
          >
            {t(locale, "featured.badge")}
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
        <Link
          href={`/u/${post.handle}`}
          className="text-paper transition-colors hover:text-blue"
        >
          @{post.handle}
        </Link>
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
          title={t(locale, "post.comments", { n: commentPage.total })}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-blue"
        >
          <MessageCircle size={14} />
          {commentPage.total}
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
        {canFeature && (
          <FeaturedToggle
            postId={post.id}
            featured={postFeatured}
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
        total={commentPage.total}
        threads={commentPage.threads}
        nextCursor={commentPage.nextCursor}
        upIds={commentPage.upIds}
        downIds={commentPage.downIds}
      />
    </div>
  );
}
