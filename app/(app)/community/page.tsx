/* 社区 feed:卡片流(Kimi Design 改造:圆角卡 + 格式化摘要 + pill 动作行)。
   顶部:快速发帖条(登录可见,点击开发帖弹窗)+ 排序 seg(热门/最新/订阅)+ 话题 pills。
   板块筛选从右栏收编进 feedbar;行内顶/踩可交互(reaction 态一条 IN 批量查,避免 N+1)。
   标题非强制:无标题帖正文摘要 + 阅读全文承接。登录用户的私密帖只在自己的 feed 出现(带标);
   被自己点踩的帖不再出现在自己的 feed。
   分页(P1-4):游标分页 +「加载更多」追加(server action 返回渲染好的一页),
   卡片渲染抽在 _components/PostCard,首屏与追加共用 _components/feed-page。 */
import Link from "next/link";
import { SearchX, SquarePen } from "lucide-react";
import Avatar from "@/components/Avatar";
import LoadMore from "@/components/LoadMore";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { getSessionUser } from "@/src/lib/auth/session";
import { CATEGORIES, categoryLabel } from "@/src/lib/categories";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { loadMorePostsAction } from "./actions";
import { loadFeedCards } from "./_components/feed-page";
import { CATEGORY_DOT } from "./_components/PostCard";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; cat?: string; sub?: string; solved?: string }>;
}) {
  const { sort, cat, sub, solved } = await searchParams;
  const currentSort = sort === "new" ? "new" : "hot";
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const subOnly = sub === "1" && !!user;
  const solvedOnly = solved === "1";
  const feed = await loadFeedCards(
    {
      sort: currentSort,
      category: cat,
      solved: solvedOnly,
      subscriberId: subOnly ? user.id : undefined,
      viewerId: user?.id,
    },
    locale,
  );

  const feedHref = (changes: {
    sort?: string;
    cat?: string | null;
    sub?: string | null;
    solved?: string | null;
  }) => {
    const params = new URLSearchParams();
    const nextSort = changes.sort ?? currentSort;
    const nextCat = changes.cat === undefined ? cat : changes.cat;
    const nextSub = changes.sub === undefined ? (subOnly ? "1" : null) : changes.sub;
    const nextSolved = changes.solved === undefined ? (solvedOnly ? "1" : null) : changes.solved;
    if (nextSort !== "hot") params.set("sort", nextSort);
    if (nextCat) params.set("cat", nextCat);
    if (nextSub) params.set("sub", nextSub);
    if (nextSolved) params.set("solved", nextSolved);
    const qs = params.toString();
    return qs ? `/community?${qs}` : "/community";
  };

  const sortItems = [
    { key: "hot", label: t(locale, "feed.hot"), href: feedHref({ sort: "hot", sub: null }), active: currentSort === "hot" && !subOnly },
    { key: "new", label: t(locale, "feed.new"), href: feedHref({ sort: "new", sub: null }), active: currentSort === "new" && !subOnly },
    ...(user
      ? [{ key: "sub", label: t(locale, "feed.sub"), href: "/community?sub=1", active: subOnly }]
      : []),
  ];

  return (
    <div>
      {user && (
        <Link
          href="/community/new"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 transition-colors hover:border-paper/25"
        >
          <Avatar url={user.avatarUrl} handle={user.handle} size={32} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-grey">
            {t(locale, "feed.quickPost")}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-blue">
            <SquarePen size={14} aria-hidden="true" />
            {t(locale, "nav.post")}
          </span>
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label={t(locale, "feed.hot")} className={SEG_WRAP}>
          {sortItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              scroll={false}
              aria-current={item.active ? "page" : undefined}
              className={`${SEG_ITEM} ${item.active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* 话题 tabs:无框纯文本(安静化,20260813)。移动端与作品/Awesome 的
            筛选行同处理(20260815):整行换行展示、左对齐,不再横向滚动
            (滚动行在窄屏挤成一团、与排序行相互侵入);桌面维持单行横滑 */}
        <nav
          aria-label={t(locale, "feed.topicsAll")}
          className="scrollbar-none order-last flex w-full flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11.5px] sm:order-none sm:min-w-0 sm:flex-1 sm:flex-nowrap sm:overflow-x-auto"
        >
          <Link
            href={feedHref({ cat: null })}
            scroll={false}
            aria-current={!cat ? "page" : undefined}
            className={`shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              !cat ? "font-semibold text-paper" : "text-grey hover:text-paper"
            }`}
          >
            {t(locale, "feed.topicsAll")}
          </Link>
          {CATEGORIES.map((c) => {
            const active = cat === c.id;
            return (
              <Link
                key={c.id}
                href={feedHref({ cat: c.id })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                  active ? "font-semibold text-paper" : "text-grey hover:text-paper"
                }`}
              >
                <i className={`size-[5px] rounded-full ${active ? (CATEGORY_DOT[c.id] ?? CATEGORY_DOT.chat) : "bg-grey/60"}`} />
                {categoryLabel(locale, c.id)}
              </Link>
            );
          })}
        </nav>
        {/* 只看已解决(20260907;20260815 评审移位):状态维度筛选,不属于话题——
            从话题行移到排序行,用有框 pill 与无边框话题区分两种心智模型。
            规格与工具行控件统一(rounded-lg + min-h-11 sm:min-h-9,20260815 二次打磨) */}
        <Link
          href={feedHref({ solved: solvedOnly ? null : "1" })}
          scroll={false}
          aria-current={solvedOnly ? "page" : undefined}
          className={`ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-9 ${
            solvedOnly
              ? "border-blue/60 bg-blue/10 font-semibold text-blue"
              : "border-line text-grey hover:border-blue/50 hover:text-blue"
          }`}
        >
          ✓ {t(locale, "feed.solvedOnly")}
        </Link>
      </div>

      {feed.nodes.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center">
          <SearchX size={22} className="mx-auto text-grey" aria-hidden="true" />
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-grey">
            {subOnly ? t(locale, "feed.emptySub") : t(locale, "feed.empty")}
          </p>
        </div>
      ) : (
        <div className="stagger-in mt-4 space-y-3">
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
