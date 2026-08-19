/* 作品评论一页的服务端组装(P1-2):分页查询 + Markdown 渲染 + 行内删除岛。
   详情页首屏(SSR)与「加载更多」server action 共用,保证两种入口输出一致
   (同 works-page / comment-page 的模式)。
   从简模型:单层(无楼中楼);作品作者的发言带「作者」芯片;删除入口(评论作者本人
   或作品作者)在服务端算出 canDelete 才渲染,action 层再用 SQL 权限兜底一次。
   AI 评论(20260816 召唤):BOT_NAME + 瓷砖头像 + 蓝边 AI 徽章,无主页链接;
   删除入口仅作品作者/治理可见;viewer 关了 show_ai_replies 时查询侧整行滤掉。 */
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
      /* AI 评论无「评论作者」可归属:删除入口只给作品作者/治理(清 AI 评论) */
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
              /* 账号已注销的兜底:评论还在,名字不再可点 */
              <span className="text-paper">#{c.userId}</span>
            )}
            {isAuthor && (
              <span className="rounded-md border border-blue/60 px-1.5 py-px text-xs tracking-wider text-blue">
                {t(locale, "works.authorChip")}
              </span>
            )}
            <span>{relTime(c.createdAt, locale)}</span>
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
          {/* AI 评论浅蓝衬底(20260816,与社区评论同款):一眼可辨不抢戏 */}
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
