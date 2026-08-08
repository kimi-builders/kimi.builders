/* 社区 feed:?sort=hot|new(默认 hot)& cat=<category> & sub=1(只看订阅,登录可见)。
   行内点赞可交互(点赞态一条 IN 批量查,避免 N+1);评论数链到详情锚点。 */
import Link from "next/link";
import { ArrowBigUp, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryZh, CATEGORIES, getFeed, getUpvotedPostIds } from "@/src/lib/posts";
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

  const qs = (over: { sort?: string; cat?: string; sub?: string }) => {
    const s = over.sort ?? currentSort;
    const c = over.cat !== undefined ? over.cat : cat;
    const b = over.sub !== undefined ? over.sub : subOnly ? "1" : "";
    return `/community?sort=${s}${c ? `&cat=${c}` : ""}${b === "1" ? "&sub=1" : ""}`;
  };

  return (
    <div className="pt-8">
      <div className="flex items-center gap-5 font-mono text-sm">
        <Link
          href={qs({ sort: "hot" })}
          className={currentSort === "hot" && !subOnly ? "text-paper" : "text-grey hover:text-paper"}
        >
          热门
        </Link>
        <Link
          href={qs({ sort: "new" })}
          className={currentSort === "new" && !subOnly ? "text-paper" : "text-grey hover:text-paper"}
        >
          最新
        </Link>
        {user && (
          <Link
            href={qs({ sub: "1" })}
            className={subOnly ? "text-paper" : "text-grey hover:text-paper"}
          >
            订阅
          </Link>
        )}
        <Link
          href="/community/new"
          className="ml-auto border border-blue px-4 py-1.5 text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
        >
          + 发帖
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs">
        <Link
          href={qs({ cat: "" })}
          className={`border px-3 py-1 ${!cat ? "border-paper/40 text-paper" : "border-moon text-grey hover:text-paper"}`}
        >
          全部
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            href={qs({ cat: c.id })}
            className={`border px-3 py-1 ${cat === c.id ? "border-paper/40 text-paper" : "border-moon text-grey hover:text-paper"}`}
          >
            {c.zh}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          {subOnly
            ? "还没有订阅任何帖子 —— 在帖子页点「订阅」,重点讨论就会聚到这里。"
            : "还没有帖子。来发第一帖 —— 你建的这个社区,第一条内容也该是你的。"}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-moon border-y border-moon">
          {posts.map((p) => {
            const up = upvoted.has(p.id);
            return (
              <li key={p.id} className="py-4">
                <div className="flex items-baseline gap-3">
                  <span className="shrink-0 font-mono text-[10px] tracking-wider text-grey">
                    {categoryZh(p.category)}
                  </span>
                  <Link
                    href={`/community/${p.id}`}
                    className="min-w-0 flex-1 truncate text-[15px] font-medium text-paper transition-colors hover:text-blue"
                  >
                    {p.title}
                  </Link>
                  {TYPE_BADGE[p.type] && (
                    <span className="shrink-0 border border-moon px-1.5 py-0.5 font-mono text-[10px] text-grey">
                      {TYPE_BADGE[p.type]}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] text-grey">
                  <span>@{p.handle}</span>
                  <span>{relTime(p.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-4">
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
                          <ArrowBigUp size={14} fill={up ? "currentColor" : "none"} />
                          {p.score}
                        </button>
                      </form>
                    ) : (
                      <span className="inline-flex items-center gap-1" title="登录后点赞">
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
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
