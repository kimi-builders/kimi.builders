/* 评论一页的服务端组装:分页查询 + 顶/踩态 + 两层拍平 + Markdown 渲染。
   详情页首屏(SSR)与「加载更多」server action 共用,保证两种入口输出一致。
   楼中楼:parent 链由 SQL 算出可见根后拍平成「顶层 + 一层回复」,
   回复层带「回复 @xx」标注;AI 回复带品牌瓷砖头像和 AI 标。 */
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
