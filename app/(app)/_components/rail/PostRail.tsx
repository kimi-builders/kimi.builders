/* 帖子详情右栏(/community/[id]):帖子元数据卡(作者/发布时间/板块/顶·评论数)
   + 同板块近期相关帖子 + AI 召唤预留卡位(默认不渲染,见 AiSummonSlot)。
   帖子数据复用详情页的 getPost(React cache 按请求去重,不重查一套)。
   私密帖:详情页对非作者 404,右栏同样不渲染(布局壳在 notFound 时仍会渲染,
   不能借右栏把私密帖元数据漏给外人)。 */
import Link from "next/link";
import { ArrowBigUp, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getPost, getRelatedPosts } from "@/src/lib/posts";
import AiSummonSlot from "./AiSummonSlot";
import Widget from "./Widget";

export default async function PostRail({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  const post = await getPost(id);
  if (!post) return null;
  if (post.visibility !== "public") {
    const user = await getSessionUser();
    if (user?.id !== post.userId) return null;
  }
  const related = await getRelatedPosts(post.id, post.category);

  return (
    <>
      <Widget title={t(locale, "rail.postMeta")}>
        <Link
          href={`/u/${post.handle}`}
          className="flex items-center gap-2.5 transition-colors hover:text-blue"
        >
          <Avatar
            url={post.avatarUrl}
            handle={post.handle}
            size={28}
            className="shrink-0"
          />
          <span className="min-w-0">
            <span className="block truncate text-xs text-paper">
              @{post.handle}
            </span>
            <span className="block truncate font-mono text-[11px] text-grey">
              {relTime(post.createdAt, locale)}
            </span>
          </span>
        </Link>
        <div className="mt-3 space-y-1.5 border-t border-line pt-3 font-mono text-[11px] text-grey">
          <div className="flex items-center justify-between gap-2">
            <span>{t(locale, "rail.board")}</span>
            <Link
              href={`/community?cat=${post.category}`}
              className="text-paper transition-colors hover:text-blue"
            >
              {categoryLabel(locale, post.category)}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1">
              <ArrowBigUp size={12} />
              {post.score}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={11} />
              {post.commentCount}
            </span>
          </div>
        </div>
      </Widget>

      <Widget title={t(locale, "rail.relatedPosts")}>
        {related.length === 0 ? (
          <p className="text-xs text-grey">
            {t(locale, "rail.relatedPostsEmpty")}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {related.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 text-xs">
                <Link
                  href={`/community/${r.id}`}
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-blue"
                >
                  {r.title}
                </Link>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-grey">
                  <MessageCircle size={11} />
                  {r.commentCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      {/* AI 召唤卡位:AI-Native L1 开工前不渲染(组件内开关) */}
      <AiSummonSlot postId={post.id} locale={locale} />
    </>
  );
}
