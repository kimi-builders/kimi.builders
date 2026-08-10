/* 社区 feed:卡片流(头像左 + 标题/摘要 + 底部图标动作行)。
   顶部:VibeCafé 式快速发帖框(登录可见,点击进完整发帖页)+ 热门/最新/订阅页签。
   板块筛选在右栏「浏览社区」;行内顶/踩可交互(reaction 态一条 IN 批量查,避免 N+1)。
   标题非强制:无标题帖正文摘要占主链接位。登录用户的私密帖只在自己的 feed 出现(带标);
   被自己点踩的帖不再出现在自己的 feed。
   分页(P1-4):游标分页 +「加载更多」追加(server action 返回渲染好的一页),
   卡片渲染抽在 _components/PostCard,首屏与追加共用 _components/feed-page。 */
import Link from "next/link";
import { SquarePen } from "lucide-react";
import Avatar from "@/components/Avatar";
import LoadMore from "@/components/LoadMore";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { loadMorePostsAction } from "./actions";
import { loadFeedCards } from "./_components/feed-page";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; cat?: string; sub?: string }>;
}) {
  const { sort, cat, sub } = await searchParams;
  const currentSort = sort === "new" ? "new" : "hot";
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const subOnly = sub === "1" && !!user;
  const feed = await loadFeedCards(
    {
      sort: currentSort,
      category: cat,
      subscriberId: subOnly ? user.id : undefined,
      viewerId: user?.id,
    },
    locale,
  );

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
          className="mb-6 flex items-center gap-3 border border-line bg-card p-3.5 transition-colors hover:border-paper/25"
        >
          <Avatar url={user.avatarUrl} handle={user.handle} size={32} />
          <span className="text-sm text-grey">{t(locale, "feed.quickPost")}</span>
          <SquarePen size={15} className="ml-auto text-grey" />
        </Link>
      )}

      <div className="flex items-center gap-5 border-b border-line font-mono text-sm">
        <Link href={tabHref("hot")} className={tabCls(currentSort === "hot" && !subOnly)}>
          {t(locale, "feed.hot")}
        </Link>
        <Link href={tabHref("new")} className={tabCls(currentSort === "new" && !subOnly)}>
          {t(locale, "feed.new")}
        </Link>
        {user && (
          <Link href="/community?sub=1" className={tabCls(subOnly)}>
            {t(locale, "feed.sub")}
          </Link>
        )}
      </div>

      {feed.nodes.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          {subOnly ? t(locale, "feed.emptySub") : t(locale, "feed.empty")}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {feed.nodes}
          <LoadMore
            key={`${currentSort}-${cat ?? ""}-${subOnly ? "sub" : ""}-${locale}`}
            initialCursor={feed.nextCursor}
            load={loadMorePostsAction.bind(null, {
              sort: currentSort,
              cat: cat ?? null,
              sub: subOnly,
            })}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
