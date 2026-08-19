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
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowBigUp, ArrowLeft, Check, ExternalLink, MessageCircle } from "lucide-react";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { canModerate, getPostFeatured } from "@/src/lib/featured";
import { plainExcerpt, relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  canViewPost,
  getPoll,
  getPost,
  getPostReactions,
  incrementViewCount,
  isSubscribed,
  postMetadataTitle,
} from "@/src/lib/posts";
import Avatar from "@/components/Avatar";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import CommentSection from "../_components/CommentSection";
import { loadCommentPage } from "../_components/comment-page";
import FeaturedToggle from "../_components/FeaturedToggle";
import PollVoteForm from "../_components/PollVoteForm";
import PostOwnerActions from "../_components/PostOwnerActions";
import SubscribeButton from "../_components/SubscribeButton";
import VoteCluster from "../_components/VoteCluster";
import ModToolbar from "../../admin/_components/ModToolbar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [post, user] = await Promise.all([
    getPost(Number(id) || 0),
    getSessionUser(),
  ]);
  if (!post) return { title: "kimi.builders" };
  return { title: postMetadataTitle(post, user) };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();
  const [post, user] = await Promise.all([getPost(postId), getSessionUser()]);
  if (!post) notFound();
  if (!canViewPost(post, user)) notFound();
  const requestHeaders = await headers();
  trackEvent("post_view", { kind: "post", id: postId }, { headers: requestHeaders });
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
  const isOwner = !!user && post.userId === user.id;

  return (
    <div>
      <article className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      {post.hiddenAt && (
        <p className="mb-4 rounded-xl border border-status-danger/30 bg-status-danger/[0.06] px-3 py-2 text-xs leading-relaxed text-status-danger-fg">
          {t(locale, "mod.hiddenBanner")}
          {post.hiddenReason ? ` — ${post.hiddenReason}` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-grey">
        <Link href="/community" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper">
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.community")}
        </Link>
        <span className="font-mono text-xs text-grey"># {categoryLabel(locale, post.category)}</span>
        {/* 已解决(20260907):安静的蓝字 token,同精选同级 */}
        {post.solvedAt && (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-ui-blue">
            ✓ {t(locale, "post.solved")}
          </span>
        )}
        {post.visibility === "private" && (
          <span
            className="rounded-md border border-line px-1.5 py-px text-xs text-paper"
            title={t(locale, "post.privateHint")}
          >
            {t(locale, "post.private")}
          </span>
        )}
        {post.hiddenAt && (
          <span
            className="rounded-md border border-status-danger/60 px-1.5 py-px text-xs text-status-danger-fg"
            title={post.hiddenReason ?? undefined}
          >
            {t(locale, "mod.hiddenBadge")}
          </span>
        )}
        {/* 编辑精选徽章:理由 + 定夺编辑放在 title(硬边描边芯片,对齐「私密」标) */}
        {postFeatured && (
          <span
            className="rounded-md border border-blue/60 px-1.5 py-px text-xs text-blue"
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
        <h1 className="mt-5 text-2xl font-semibold leading-snug sm:text-3xl">{post.title}</h1>
      )}
      <div
        className={`flex items-center gap-3 font-mono text-xs text-grey ${
          post.title ? "mt-3" : "mt-4"
        }`}
      >
        <Avatar url={post.avatarUrl} handle={post.handle} size={20} />
        <Link
          href={`/u/${post.handle}`}
          className="text-paper transition-colors hover:text-ui-blue"
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
          className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-bg/40 p-4 font-mono text-xs text-ui-blue transition-colors hover:border-ui-blue"
        >
          <span className="min-w-0 flex-1 truncate">{post.linkUrl}</span>
          <ExternalLink size={15} className="shrink-0" aria-hidden="true" />
        </a>
      )}

      {poll && (
        <div className="mt-6 rounded-xl border border-line bg-bg/40 p-5">
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
                      <span className={mine ? "text-ui-blue" : "text-paper"}>
                        <span className="inline-flex items-center gap-1.5">
                          {o.label}
                          {mine && <Check size={13} aria-hidden="true" />}
                        </span>
                      </span>
                      <span className="ml-auto font-mono text-xs text-grey">
                        {o.voteCount} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-moon">
                      <div
                        className={`h-full rounded-full ${mine ? "bg-blue" : "bg-grey/50"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="font-mono text-xs text-grey">
                {t(locale, "post.votesTotal", { n: poll.total })}
                {!user && ` · ${t(locale, "post.loginToVote")}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 动作条:顶/踩 + 评论 + 订阅 + 分享 + 作者操作(编辑/可见性/删除) */}
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
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
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-ui-blue"
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
        {isOwner && (
          <PostOwnerActions
            postId={post.id}
            visibility={post.visibility}
            solved={!!post.solvedAt}
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
        {/* 治理工具条:admin/mod(屏蔽/软删;硬删仅 admin),action 层再鉴权 */}
        {canFeature && (
          <ModToolbar
            targetType="post"
            targetId={post.id}
            hidden={!!post.hiddenAt}
            isAdmin={user?.role === "admin"}
            showSoftDelete={!isOwner}
            locale={locale}
            redirectAfter="/community"
          />
        )}
        <span className="ml-auto">
          <ShareButton
            path={`/community/${post.id}`}
            title={post.title || plainExcerpt(post.bodyMd, 60)}
            locale={locale}
            /* 私密帖海报路由 404 不渲染,按钮也不给 */
            posterHref={post.visibility === "public" ? `/api/share/post/${post.id}` : undefined}
            posterSurface={post.visibility === "public" ? "post" : undefined}
          />
        </span>
      </div>
      </article>

      <CommentSection
        postId={post.id}
        locale={locale}
        meId={user?.id ?? null}
        moderator={canFeature}
        total={commentPage.total}
        threads={commentPage.threads}
        nextCursor={commentPage.nextCursor}
        upIds={commentPage.upIds}
        downIds={commentPage.downIds}
      />
    </div>
  );
}
