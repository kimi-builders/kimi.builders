/* 社区 feed:?sort=hot|new(默认 hot)& cat=<category>。
   行内 ▲/💬 只读,互动在详情页做(feed 不为每行查投票态,避免 N+1)。 */
import Link from "next/link";
import { categoryZh, CATEGORIES, getFeed } from "@/src/lib/posts";
import { relTime } from "@/src/lib/format";

const TYPE_BADGE: Record<string, string> = {
  link: "链接",
  poll: "投票",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; cat?: string }>;
}) {
  const { sort, cat } = await searchParams;
  const currentSort = sort === "new" ? "new" : "hot";
  const posts = await getFeed({ sort: currentSort, category: cat });

  const tabHref = (s: string) =>
    `/community?sort=${s}${cat ? `&cat=${cat}` : ""}`;
  const catHref = (c?: string) =>
    `/community?sort=${currentSort}${c ? `&cat=${c}` : ""}`;

  return (
    <div className="pt-8">
      <div className="flex items-center gap-5 font-mono text-sm">
        <Link
          href={tabHref("hot")}
          className={currentSort === "hot" ? "text-paper" : "text-grey hover:text-paper"}
        >
          热门
        </Link>
        <Link
          href={tabHref("new")}
          className={currentSort === "new" ? "text-paper" : "text-grey hover:text-paper"}
        >
          最新
        </Link>
        <Link
          href="/community/new"
          className="ml-auto border border-blue px-4 py-1.5 text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
        >
          + 发帖
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs">
        <Link
          href={catHref()}
          className={`border px-3 py-1 ${!cat ? "border-paper/40 text-paper" : "border-moon text-grey hover:text-paper"}`}
        >
          全部
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            href={catHref(c.id)}
            className={`border px-3 py-1 ${cat === c.id ? "border-paper/40 text-paper" : "border-moon text-grey hover:text-paper"}`}
          >
            {c.zh}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          还没有帖子。来发第一帖 —— 你建的这个社区,第一条内容也该是你的。
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-moon border-y border-moon">
          {posts.map((p) => (
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
                <span className="ml-auto">▲ {p.score}</span>
                <span>💬 {p.commentCount}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
