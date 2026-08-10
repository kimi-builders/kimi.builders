/* feed 帖子卡片:社区页首屏(SSR)与「加载更多」server action 共用同一份渲染,
   两种入口输出一致(同 comment-page.tsx 的模式)。
   标题非强制:无标题帖正文摘要占主链接位(X 式卡片)。 */
import Link from "next/link";
import { ArrowBigUp, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import { categoryLabel } from "@/src/lib/categories";
import { relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import type { FeedPost } from "@/src/lib/posts";
import VoteCluster from "./VoteCluster";

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
  return (
    <article className="border border-line bg-card p-4 transition-colors hover:border-paper/20">
      <div className="flex gap-3">
        <Link href={`/u/${p.handle}`} className="shrink-0">
          <Avatar url={p.avatarUrl} handle={p.handle} size={36} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
            <Link
              href={`/u/${p.handle}`}
              className="text-paper transition-colors hover:text-blue"
            >
              @{p.handle}
            </Link>
            <span>·</span>
            <span>{relTime(p.createdAt, locale)}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2 tracking-wider">
              {p.visibility === "private" && (
                <span className="border border-line px-1 py-px text-[10px] text-paper">
                  {t(locale, "post.private")}
                </span>
              )}
              {categoryLabel(locale, p.category)}
            </span>
          </div>
          {/* 标题非强制:无标题帖用正文摘要占主链接位(X 式卡片) */}
          {p.title ? (
            <>
              <Link
                href={`/community/${p.id}`}
                className="mt-1 block text-[15px] font-medium leading-snug text-paper transition-colors hover:text-blue"
              >
                {p.title}
                {p.type !== "text" && (
                  <span className="ml-2 border border-line px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-grey">
                    {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                  </span>
                )}
              </Link>
              {p.excerpt && (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
                  {p.excerpt}
                </p>
              )}
            </>
          ) : (
            <Link
              href={`/community/${p.id}`}
              className="mt-1 block text-[15px] leading-relaxed text-paper transition-colors hover:text-blue"
            >
              <span className="line-clamp-3">{p.excerpt}</span>
              {p.type !== "text" && (
                <span className="ml-2 border border-line px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-grey">
                  {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                </span>
              )}
            </Link>
          )}
          <div className="mt-2.5 flex items-center gap-5 font-mono text-[11px] text-grey">
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
                className="inline-flex items-center gap-1"
                title={t(locale, "post.loginToUpvote")}
              >
                <ArrowBigUp size={14} />
                {p.score}
              </span>
            )}
            <Link
              href={`/community/${p.id}#comments`}
              title={t(locale, "post.comments", { n: p.commentCount })}
              className="inline-flex items-center gap-1 transition-colors hover:text-blue"
            >
              <MessageCircle size={13} />
              {p.commentCount}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
