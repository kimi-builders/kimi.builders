/* Server assembly of one comment page: the paged query + vote state +
   two-level flattening + Markdown rendering. Shared by the detail
   page's first render (SSR) and the "load more" server action so both
   entries emit identical output. Threading: the parent chain computes
   visible roots in SQL, then flattens to "top level + one reply layer"
   with "replying @x" labels; AI replies carry the brand tile avatar
   and the AI tag. */
import Markdown from "@/components/Markdown";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/ai-reply";
import type { SessionUser } from "@/src/lib/auth/session";
import { flattenCommentPage } from "@/src/lib/comment-tree";
import { relTime } from "@/src/lib/format";
import type { Locale } from "@/src/lib/i18n";
import {
  getCommentReactions,
  getCommentsPage,
  type CommentPageRow,
} from "@/src/lib/posts";
import type { CommentThread, CommentView } from "./CommentSection";

export interface CommentPageData {
  threads: CommentThread[];
  total: number;
  nextCursor: number | null;
  upIds: number[];
  downIds: number[];
}

export async function loadCommentPage(
  postId: number,
  user: SessionUser | null,
  locale: Locale,
  after = 0,
): Promise<CommentPageData> {
  const page = await getCommentsPage(postId, {
    showAi: user ? user.showAiReplies : true,
    after,
    /* Moderation hiding: hidden comments are visible only to their
       author (labeled); everyone else's view filters them out. */
    viewerId: user?.id,
  });
  const reactions = user
    ? await getCommentReactions(user.id, page.comments.map((c) => c.id))
    : { up: new Set<number>(), down: new Set<number>() };
  const byId = new Map(page.comments.map((c) => [c.id, c]));
  const view = (
    c: CommentPageRow,
    replyTo: CommentPageRow | null,
  ): CommentView => ({
    id: c.id,
    authorId: c.userId,
    isAi: c.isAi,
    author: c.isAi ? BOT_NAME : `@${c.handle}`,
    handle: c.isAi ? null : c.handle,
    avatarUrl: c.isAi ? BOT_AVATAR : (c.avatarUrl ?? ""),
    time: relTime(c.createdAt, locale),
    edited: !!c.editedAt,
    hidden: c.hiddenAt !== null,
    score: c.score,
    replyToAuthor: replyTo
      ? replyTo.isAi
        ? BOT_NAME
        : `@${replyTo.handle}`
      : null,
    bodyMd: c.bodyMd,
    body: <Markdown source={c.bodyMd} />,
  });
  const threads = flattenCommentPage(page.comments).map((node) => ({
    ...view(node.comment, null),
    replies: node.replies.map((r) =>
      view(r.comment, r.replyToId !== null ? (byId.get(r.replyToId) ?? null) : null),
    ),
  }));
  return {
    threads,
    total: page.total,
    nextCursor: page.nextCursor,
    upIds: [...reactions.up],
    downIds: [...reactions.down],
  };
}
