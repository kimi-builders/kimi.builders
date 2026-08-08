/* 社区 feed:卡片流(头像左 + 标题 + 两行摘要 + 底部图标动作行)。
   顶部:VibeCafé 式快速发帖框(登录可见,点击进完整发帖页)+ 热门/最新/订阅页签。
   板块筛选在左栏;行内点赞可交互(点赞态一条 IN 批量查,避免 N+1)。 */
import Link from "next/link";
import { ArrowBigUp, MessageCircle, SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryZh, getFeed, getUpvotedPostIds } from "@/src/lib/posts";
import { relTime } from "@/src/lib/format";
import { toggleUpAction } from "./actions";

const TYPE_BADGE: Record<string, string> = {
  link: "链接",
  poll: "投票",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; cat?: string; sub?: string }>;
}) {
  const { sort, cat, sub } = await searchParams;
  const currentSort = sort === "new" ? "new" : "hot";
  const user = await getSessionUser();
  const subOnly = sub === "1" && !!user;
  const posts = await getFeed({
    sort: currentSort,
    category: cat,
    subscriberId: subOnly ? user.id : undefined,
  });
  const upvoted = user
    ? await getUpvotedPostIds(user.id, posts.map((p) => p.id))
    : new Set<number>();

  const tabHref = (s: string) =>
    `/community?sort=${s}${cat ? `&cat=${cat}` : ""}${subOnly ? "&sub=1" : ""}`;
  const tabCls = (active: boolean) =>
    `pb-2 transition-colors ${
      active
        ? "text-paper underline decoration-blue underline-offset-8"
        : "text-grey hover:text-paper"
    }`;

  return (
    <div>
      {user && (
        <Link
          href="/community/new"
          className="mb-6 flex items-center gap-3 border border-moon bg-white/[0.015] p-3.5 transition-colors hover:border-paper/25"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full border border-paper/10"
          />
          <span className="text-sm text-grey">有什么新鲜事?(支持 Markdown)</span>
          <SquarePen size={15} className="ml-auto text-grey" />
        </Link>
      )}

      <div className="flex items-center gap-5 border-b border-moon font-mono text-sm">
        <Link href={tabHref("hot")} className={tabCls(currentSort === "hot" && !subOnly)}>
          热门
        </Link>
        <Link href={tabHref("new")} className={tabCls(currentSort === "new" && !subOnly)}>
          最新
        </Link>
        {user && (
          <Link href="/community?sub=1" className={tabCls(subOnly)}>
            订阅
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          {subOnly
            ? "还没有订阅任何帖子 —— 在帖子页点「订阅」,重点讨论就会聚到这里。"
            : "还没有帖子。来发第一帖 —— 你建的这个社区,第一条内容也该是你的。"}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {posts.map((p) => {
            const up = upvoted.has(p.id);
            return (
              <article
                key={p.id}
                className="border border-moon bg-white/[0.015] p-4 transition-colors hover:border-paper/20"
              >
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-paper/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
                      <span className="text-paper">@{p.handle}</span>
                      <span>·</span>
                      <span>{relTime(p.createdAt)}</span>
                      <span className="ml-auto shrink-0 tracking-wider">
                        {categoryZh(p.category)}
                      </span>
                    </div>
                    <Link
                      href={`/community/${p.id}`}
                      className="mt-1 block text-[15px] font-medium leading-snug text-paper transition-colors hover:text-blue"
                    >
                      {p.title}
                      {TYPE_BADGE[p.type] && (
                        <span className="ml-2 border border-moon px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-grey">
                          {TYPE_BADGE[p.type]}
                        </span>
                      )}
                    </Link>
                    {p.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
                        {p.excerpt}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center gap-5 font-mono text-[11px] text-grey">
                      {user ? (
                        <form action={toggleUpAction}>
                          <input type="hidden" name="post_id" value={p.id} />
                          <button
                            type="submit"
                            aria-label={up ? "取消点赞" : "点赞"}
                            className={`inline-flex items-center gap-1 transition-colors ${
                              up ? "text-blue" : "text-grey hover:text-blue"
                            }`}
                          >
                            <ArrowBigUp
                              size={14}
                              fill={up ? "currentColor" : "none"}
                            />
                            {p.score}
                          </button>
                        </form>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1"
                          title="登录后点赞"
                        >
                          <ArrowBigUp size={14} />
                          {p.score}
                        </span>
                      )}
                      <Link
                        href={`/community/${p.id}#comments`}
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
          })}
        </div>
      )}
    </div>
  );
}
