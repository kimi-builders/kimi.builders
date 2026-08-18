/* feed 帖子卡片(Kimi Design 改造):社区页首屏(SSR)与「加载更多」server action
   共用同一份渲染,两种入口输出一致(同 comment-page.tsx 的模式)。
   头行 = 头像 + @handle(官方带 BadgeCheck)+ 时间 + #话题 chip + 私密标;
   正文摘要为格式化渲染(react-markdown,.md-feed 紧凑截断,图片位已预留);
   动作行 = 顶/踩 pill + 评论 + 分享 + 小筑标记。标题非强制:无标题帖由摘要 + 阅读全文承接。 */
import Link from "next/link";
import { ArrowBigUp, BadgeCheck, Bot, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import Markdown from "@/components/Markdown";
import { categoryLabel } from "@/src/lib/categories";
import { relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import type { FeedPost } from "@/src/lib/posts";
import FeedShareButton from "./FeedShareButton";
import VoteCluster from "./VoteCluster";

/* 话题 tab 的色点(active 态用)。 */
export const CATEGORY_DOT: Record<string, string> = {
  chat: "bg-blue",
  showcase: "bg-blue",
  help: "bg-blue",
  feedback: "bg-blue",
  announcement: "bg-grey",
};

export default function PostCard({
  post: p,
  locale,
  loggedIn,
  up,
  down,
}: {
  post: FeedPost;
  locale: Locale;
  loggedIn: boolean;
  up: boolean;
  down: boolean;
}) {
  const official = p.role === "admin" || p.role === "moderator";
  /* 前缀基本用满 ≈ 正文被截断;无标题帖始终给「阅读全文」主链接位 */
  const truncated = p.bodyMd.length >= 499;
  return (
    <article className="rounded-2xl border border-line bg-card px-5 pb-4 pt-5 transition-colors hover:border-paper/20">
      <div className="flex items-center gap-2.5">
        <Link href={`/u/${p.handle}`} className="shrink-0">
          <Avatar url={p.avatarUrl} handle={p.handle} size={34} />
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link
            href={`/u/${p.handle}`}
            className="flex items-center gap-1 text-[15px] font-semibold text-paper transition-colors hover:text-blue"
          >
            @{p.handle}
            {official && (
              <BadgeCheck
                size={13}
                className="text-blue"
                aria-label={t(locale, "post.official")}
                role="img"
              />
            )}
          </Link>
          <span className="text-[13px] text-grey/80">· {relTime(p.createdAt, locale)}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
          {p.visibility === "private" && (
            <span className="rounded-md border border-line px-1.5 py-px text-xs text-paper">
              {t(locale, "post.private")}
            </span>
          )}
          {/* 被屏蔽标:feed 只向作者本人放行被屏蔽帖,徽章天然只有作者可见 */}
          {p.hiddenAt && (
            <span
              className="rounded-md border border-red-400/60 px-1.5 py-px font-mono text-xs text-red-400"
              title={p.hiddenReason ?? undefined}
            >
              {t(locale, "mod.hiddenBadge")}
            </span>
          )}
          {/* 已解决:安静的蓝字 token(20260907) */}
          {p.solvedAt && (
            <span className="inline-flex items-center gap-1 text-blue">
              ✓ {t(locale, "post.solved")}
            </span>
          )}
          {/* 类别:纯文本 token,不再是 pill */}
          <span className="text-grey"># {categoryLabel(locale, p.category)}</span>
        </div>
      </div>

      {p.title && (
        <Link
          href={`/community/${p.id}`}
          className="mt-3 block text-[16px] font-semibold leading-snug text-paper transition-colors hover:text-blue"
        >
          {p.title}
          {p.type !== "text" && (
            <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 align-middle font-mono text-xs font-normal text-grey">
              {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
            </span>
          )}
        </Link>
      )}

      {p.bodyMd && (
        <div className="mt-1.5">
          <div className="md-feed md-feed-clamp">
            <Markdown source={p.bodyMd} />
          </div>
          {(truncated || !p.title) && (
            <Link
              href={`/community/${p.id}`}
              className="mt-1 inline-block font-mono text-xs text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, "feed.readMore")}
            </Link>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        {loggedIn ? (
          <VoteCluster
            target="post"
            id={p.id}
            score={p.score}
            up={up}
            down={down}
            locale={locale}
            size={14}
          />
        ) : (
          <span
            className="inline-flex items-center gap-1.5 min-h-9 rounded-lg px-2.5 py-2 font-mono text-xs text-grey"
            title={t(locale, "post.loginToUpvote")}
          >
            <ArrowBigUp size={14} />
            {p.score}
          </span>
        )}
        <Link
          href={`/community/${p.id}#comments`}
          title={t(locale, "post.comments", { n: p.commentCount })}
          className="inline-flex items-center gap-1.5 min-h-9 rounded-lg px-2.5 py-2 font-mono text-xs text-grey transition-colors hover:bg-paper/[0.05] hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <MessageCircle size={13} />
          {p.commentCount}
        </Link>
        <FeedShareButton
          id={p.id}
          label={t(locale, "post.share")}
          copiedLabel={t(locale, "post.copied")}
        />
        {p.aiReply && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-blue">
            <Bot size={12} aria-hidden="true" />
            {t(locale, "post.aiJoin")}
          </span>
        )}
      </div>
    </article>
  );
}
