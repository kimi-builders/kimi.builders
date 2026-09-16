/* Server assembly of one page of work comments: the paged query +
   Markdown rendering + inline delete islands. Shared by the detail
   page's first render (SSR) and the "load more" server action so both
   entries emit identical output (same pattern as works-page /
   comment-page). Kept simple: single-level (no threading); the work
   author's comments carry an "author" chip; the delete entry (comment
   author or work author) renders only when the server computed
   canDelete, and the action layer re-checks via SQL. AI comments
   (summons): BOT_NAME + tile avatar + blue-edged AI badge, no profile
   link; the delete entry is visible to the work author/moderation only;
   a viewer who disabled show_ai_replies filters the rows out
   query-side. */
import type { ReactNode } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Markdown from "@/components/Markdown";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import type { SessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getWorkCommentsPage } from "@/src/lib/works";
import FeedbackButton from "@/app/(app)/_components/FeedbackButton";
import WorkCommentDelete from "./WorkCommentDelete";

export interface WorkCommentPageData {
  nodes: ReactNode[];
  total: number;
  nextCursor: number | null;
}

export async function loadWorkComments(
  workId: number,
  workAuthorId: number | null,
  user: SessionUser | null,
  locale: Locale,
  after = 0,
): Promise<WorkCommentPageData> {
  const page = await getWorkCommentsPage(workId, after, {
    showAi: user ? user.showAiReplies : true,
  });
  return {
    total: page.total,
    nextCursor: page.nextCursor,
    nodes: page.comments.map((c) => {
      const isAuthor = workAuthorId !== null && c.userId === workAuthorId;
      /* AI comments have no comment author to attribute: the delete
         entry goes to the work author/moderation only (AI-comment
         cleanup). */
      const canDelete = c.isAi
        ? !!user && (workAuthorId === user.id || canModerate(user.role))
        : !!user && (c.userId === user.id || workAuthorId === user.id);
      return (
        <div key={c.id} id={`work-comment-${c.id}`} className="scroll-mt-24 py-4">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-grey">
            {c.isAi ? (
              <>
                <Avatar
                  url={BOT_AVATAR}
                  handle={BOT_NAME}
                  size={20}
                  square
                  className="h-5 w-5"
                />
                <span className="text-paper">{BOT_NAME}</span>
                <span className="rounded-md border border-blue px-1.5 py-px text-xs tracking-wider text-blue">
                  AI
                </span>
              </>
            ) : c.handle ? (
              <>
                <Avatar url={c.avatarUrl} handle={c.handle} size={20} />
                <Link
                  href={`/u/${c.handle}`}
                  className="text-paper transition-colors hover:text-ui-blue"
                >
                  @{c.handle}
                </Link>
              </>
            ) : (
              /* Deleted-account fallback: the comment stays, the name
                 is no longer a link. */
              <span className="text-paper">#{c.userId}</span>
            )}
            {isAuthor && (
              <span className="rounded-md border border-blue/60 px-1.5 py-px text-xs tracking-wider text-blue">
                {t(locale, "works.authorChip")}
              </span>
            )}
            <span>{relTime(c.createdAt, locale)}</span>
            {/* Report entry: own/AI rows stay clean (AI rows are
                governed through the moderation tools instead). */}
            {!c.isAi && c.userId !== user?.id && (
              <span className={canDelete ? "" : "ml-auto"}>
                <FeedbackButton
                  locale={locale}
                  targetType="work_comment"
                  targetId={c.id}
                  compact
                  loggedIn={!!user}
                  returnTo={`/works/${workId}#work-comment-${c.id}`}
                />
              </span>
            )}
            {canDelete && (
              <span className="ml-auto">
                <WorkCommentDelete
                  commentId={c.id}
                  workId={workId}
                  locale={locale}
                />
              </span>
            )}
          </div>
          {/* AI comments sit on a pale blue wash (same as community comments): recognizable at a glance without stealing focus */}
          <div
            className={`mt-2 ${c.isAi ? "rounded-lg border border-blue/15 bg-blue/[0.04] px-3 py-2" : ""}`}
          >
            <Markdown source={c.body} />
          </div>
        </div>
      );
    }),
  };
}
