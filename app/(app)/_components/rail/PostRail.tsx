/* Post detail rail (/community/[id]): the post metadata card
   (author/category/ups) + recent related posts in the category + the
   reserved AI summon slot (not rendered by default, see AiSummonSlot).
   The author card carries identity only — publish time lives in the
   page byline and the comment count in the section heading (same
   one-fact-one-place rule as the work/article rails). Post data reuses
   the detail page's getPost (deduped per request by React cache — no
   second query set). Private posts: the detail page 404s for
   non-authors and the rail follows (the layout shell still renders
   through notFound — the rail must never leak a private post's
   metadata). */
import Link from "next/link";
import { ArrowBigUp, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
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
          className="flex items-center gap-2.5 transition-colors hover:text-ui-blue"
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
          </span>
        </Link>
        <div className="mt-3 space-y-1.5 border-t border-line pt-3 font-mono text-xs text-grey">
          <div className="flex items-center justify-between gap-2">
            <span>{t(locale, "rail.board")}</span>
            <Link
              href={`/community?cat=${post.category}`}
              className="text-paper transition-colors hover:text-ui-blue"
            >
              {categoryLabel(locale, post.category)}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1">
              <ArrowBigUp size={12} />
              {post.score}
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
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {r.title}
                </Link>
                <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-grey">
                  <MessageCircle size={11} />
                  {r.commentCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      {/* AI summon card slot: not rendered until AI-Native L1 ships (switch inside the component) */}
      <AiSummonSlot postId={post.id} locale={locale} />
    </>
  );
}
