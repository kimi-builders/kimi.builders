/* Post detail: body (Markdown) + link card / poll block + action bar
   (votes/comments/subscribe/share/owner actions) + comment section.
   Comments filter by the viewer's show_ai_replies; AI replies carry
   the brand tile avatar and the AI tag. Comment paging: the first page
   renders SSR (50 top-level comments per page, replies ride with their
   roots), "load more" appends via CommentSection's server action; both
   the action bar and the section title count visible comments (same
   definition as the list — soft-deleted filtered, show_ai_replies
   applied) so counts always match what's visible. Threading: the
   parent chain flattens server-side into "top level + one reply layer"
   with "replying @x" labels. Titles are optional: an untitled post's
   body is the main content. Private posts are author-only (others
   404). View counts are recorded, never shown: +1 inside after(),
   never blocking render. */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowBigUp, ArrowLeft, Check, ExternalLink } from "lucide-react";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { canModerate, getPostFeatured } from "@/src/lib/featured";
import { plainExcerpt, relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { detailMetadata } from "@/src/lib/page-metadata";
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
import ModMenu from "../_components/ModMenu";
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
  if (!post || !canViewPost(post, user)) return { title: "kimi.builders" };
  const locale = await getLocale(user);
  return detailMetadata({
    title: postMetadataTitle(post, user),
    description: plainExcerpt(post.bodyMd, 160) || t(locale, "metaDesc.community"),
    path: `/community/${id}`,
    locale,
    type: "article",
  });
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
  /* Featuring entry: visible to admin/mod (authorship irrelevant);
     the action layer re-checks. */
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
      {/* Breadcrumb line stays a path: back + category + visibility
          badges. Solved is a state, not a path segment — it rides next
          to the title below (untitled posts keep it here). */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-grey">
        <Link href="/community" aria-label={t(locale, "state.backCommunity")} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper">
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.community")}
        </Link>
        <span className="font-mono text-xs text-grey"># {categoryLabel(locale, post.category)}</span>
        {!post.title && post.solvedAt && (
          <span className="inline-flex items-center gap-1 rounded-md border border-ui-blue/50 px-1.5 py-px font-mono text-xs text-ui-blue">
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
        {/* Featured badge: rationale + deciding editor in the title attribute (hard-edged outlined chip, matching the "private" badge) */}
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

      {/* Byline above the title: the author anchors the card, the title
          reads as their words — author-then-title also matches the feed
          card grammar, so list -> detail keeps one reading direction. */}
      <div className="mt-4 flex items-center gap-3 font-mono text-xs text-grey">
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

      {post.title && (
        /* The solved chip sits outside the h1 so it never pollutes the
           heading's accessible name. */
        <div className="mt-2 flex flex-wrap items-center gap-x-3">
          <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">{post.title}</h1>
          {post.solvedAt && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ui-blue/50 px-1.5 py-px font-mono text-xs text-ui-blue">
              ✓ {t(locale, "post.solved")}
            </span>
          )}
        </div>
      )}

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

      {/* Action bar: upvote/downvote + comment + subscribe + share + owner actions (edit/visibility/delete) */}
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
        {/* Moderation cluster behind one menu entry: featuring + hide/
            soft/hard delete lined up beside user actions read as noise
            (re-authorized at the action layer regardless). The comment
            count lives on the section heading below, not here. */}
        {canFeature && (
          <ModMenu locale={locale}>
            <FeaturedToggle
              postId={post.id}
              featured={postFeatured}
              locale={locale}
            />
            <ModToolbar
              targetType="post"
              targetId={post.id}
              hidden={!!post.hiddenAt}
              isAdmin={user?.role === "admin"}
              showSoftDelete={!isOwner}
              locale={locale}
              redirectAfter="/community"
            />
          </ModMenu>
        )}
        <span className="ml-auto">
          <ShareButton
            path={`/community/${post.id}`}
            title={post.title || plainExcerpt(post.bodyMd, 60)}
            locale={locale}
            /* The private-post poster route 404s — the button isn't
               offered either. */
            posterHref={post.visibility === "public" ? `/api/share/post/${post.id}?locale=${locale}` : undefined}
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
