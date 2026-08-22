/* 社区 feed:卡片流(Kimi Design 改造:圆角卡 + 格式化摘要 + pill 动作行)。
   顶部:快速发帖条(登录可见,点击开发帖弹窗)+ 排序 seg(热门/最新/订阅)+ 话题 pills。
   板块筛选从右栏收编进 feedbar;行内顶/踩可交互(reaction 态一条 IN 批量查,避免 N+1)。
   标题非强制:无标题帖正文摘要 + 阅读全文承接。登录用户的私密帖只在自己的 feed 出现(带标);
   被自己点踩的帖不再出现在自己的 feed。
   分页(P1-4):游标分页 +「加载更多」追加(server action 返回渲染好的一页),
   卡片渲染抽在 _components/PostCard,首屏与追加共用 _components/feed-page。 */
import Link from "next/link";
import { SquarePen } from "lucide-react";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";
import LoadMore from "@/components/LoadMore";
import PageHeader from "@/components/PageHeader";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_FLOW,
  SEG_ITEM_IDLE,
  SEG_WRAP,
  SEG_WRAP_FLOW,
} from "@/components/seg-classes";
import { getSessionUser } from "@/src/lib/auth/session";
import { CATEGORIES, categoryLabel } from "@/src/lib/categories";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { loadMorePostsAction } from "./actions";
import { loadFeedCards } from "./_components/feed-page";

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

  /* stagger 入场只在默认视图挂载(20260821 评审):话题/排序切换是服务端
     重渲染,卡片 key 全换会让前 8 项重放入场动画,观感像卡顿 */
  const defaultFeedView =
    currentSort === "hot" && !cat && !subOnly && !solvedOnly;

  const sortItems = [
    { key: "hot", label: t(locale, "feed.hot"), href: feedHref({ sort: "hot", sub: null }), active: currentSort === "hot" && !subOnly },
    { key: "new", label: t(locale, "feed.new"), href: feedHref({ sort: "new", sub: null }), active: currentSort === "new" && !subOnly },
    ...(user
      ? [{ key: "sub", label: t(locale, "feed.sub"), href: "/community?sub=1", active: subOnly }]
      : []),
  ];

  return (
    <div>
      {/* 页头迁移共享 PageHeader(20260821 文案一致性):与其他分区同一语法
          (— 定位语 eyebrow + kb-h1 + kb-lede);原手写 human eyebrow 复读了
          标题词,serif 的品牌回声已由探索区(章横幅/编辑公约)接棒 */}
      <PageHeader
        eyebrow={t(locale, "community.eyebrow")}
        title={t(locale, "nav.community")}
        lede={t(locale, "community.lede")}
      />
      {user && (
        <Link
          href="/community/new"
          className="mb-4 mt-6 flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 transition-colors hover:border-paper/25"
        >
          <Avatar url={user.avatarUrl} handle={user.handle} size={32} />
          <span className="min-w-0 flex-1 truncate text-sm text-grey">
            {t(locale, "feed.quickPost")}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ui-blue">
            <SquarePen size={14} aria-hidden="true" />
            {t(locale, "nav.post")}
          </span>
        </Link>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
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
        {/* 话题 tabs:共享分段语法(20260820 并入 seg-classes,反色实块选中态);
            可换行变体——选项多或 EN 文案长(Showcase/Feedback)时整组折行,
            不再用六等分网格硬挤;圆角跟随 vibe 令牌(旧实现 gap-px 网格
            两种气质都是直角)。已解决开关不动:状态维度,与话题两种心智。 */}
        <nav
          aria-label={t(locale, "feed.topicsAll")}
          className={`${SEG_WRAP_FLOW} order-last min-w-0 md:order-none md:justify-self-start`}
        >
          <Link
            href={feedHref({ cat: null })}
            scroll={false}
            aria-current={!cat ? "page" : undefined}
            className={`${SEG_ITEM_FLOW} ${!cat ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
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
                className={`${SEG_ITEM_FLOW} ${active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
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
          className={`inline-flex h-11 min-h-0 shrink-0 items-center gap-1 justify-self-start rounded-lg border px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue md:justify-self-end ${
            solvedOnly
              ? "border-blue/60 bg-blue/10 font-semibold text-blue"
              : "border-line text-grey hover:border-ui-blue/50 hover:text-ui-blue"
          }`}
        >
          ✓ {t(locale, "feed.solvedOnly")}
        </Link>
      </div>

      {feed.nodes.length === 0 ? (
        /* 空社区 = 显式 CTA 而非只有鼓励(20260821 评审);订阅空态
           (subOnly)是筛选无结果,给内容指引但不给发帖按钮 */
        <EmptyState
          className="mt-4"
          message={subOnly ? t(locale, "feed.emptySub") : t(locale, "feed.empty")}
          hint={!subOnly ? t(locale, "feed.emptyHint") : undefined}
          actions={
            !subOnly ? (
              <Link
                href={
                  user
                    ? "/community/new"
                    : `/login?next=${encodeURIComponent("/community/new")}`
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                <SquarePen size={14} aria-hidden="true" />
                {t(locale, "feed.emptyCta")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={`${defaultFeedView ? "stagger-in " : ""}mt-4 space-y-3`}>
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
