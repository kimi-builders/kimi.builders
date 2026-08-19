/* 作品库 /works:成员作品墙(Kimi Design 改造:头部说明 + sort seg + Agent chips
   + 圆角截图卡双列网格)+ 提交入口。
   只展示 source=site 的成员作品;推荐的站外项目在 /awesome。
   页头(20260819 版式对齐)接入共享 PageHeader:eyebrow + kb-h1 + kb-lede,
   与 learn/blog 同一语法;工具行/列表间距归位 4px 序列。
   卡片渲染与 /awesome 共用 _components/WorkCard,首屏与「加载更多」共用
   _components/works-page(游标分页:new = id,hot = votes|id 复合)。
   作者已 opt-in 公开用量时,卡片带「已验证构建投入」徽章(见 works-page)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { GalleryVerticalEnd } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import LoadMore from "@/components/LoadMore";
import WorkKindIcon from "@/components/WorkKindIcon";
import LoginGate from "@/app/(app)/_components/LoginGate";
import PageHeader from "@/components/PageHeader";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { AGENTS } from "@/src/lib/agents";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { isWorkKind, WORK_KINDS, workKindLabel } from "@/src/lib/work-kinds";
import { getClaimAllowance } from "@/src/lib/works";
import { getWorksView } from "@/src/lib/works-view-server";
import { loadMoreWorksAction } from "./actions";
import { loadWorksCards } from "./_components/works-page";
import WorksFilterBar from "./_components/WorksFilterBar";
import WorksViewToggle from "./_components/WorksViewToggle";

export const metadata: Metadata = { title: "作品库 — kimi.builders" };

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; agent?: string; kind?: string }>;
}) {
  const { sort, agent, kind } = await searchParams;
  const requestHeaders = await headers();
  trackEvent("works_view", { kind: "page", id: "works" }, { headers: requestHeaders });
  const currentSort = sort === "hot" ? "hot" : "new";
  const csv = (value?: string) => (value ?? "").split(",").filter(Boolean);
  const activeAgents = csv(agent).filter((id) => AGENTS.some((a) => a.id === id));
  const activeKinds = csv(kind).filter(isWorkKind);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  /* 视图偏好(cookie):grid=封面墙(两/三列),list=行式(默认) */
  const view = await getWorksView();
  const page = await loadWorksCards(
    { awesome: false, sort: currentSort, agents: activeAgents, kinds: activeKinds, view },
    user,
    locale,
  );

  const preservedQuery = currentSort !== "new" ? `sort=${currentSort}` : "";

  /* sort 切换保留筛选(agent/kind 随链接走,与筛选条互补) */
  const sortHref = (nextSort: string) => {
    const params = new URLSearchParams();
    if (nextSort !== "new") params.set("sort", nextSort);
    if (activeAgents.length > 0) params.set("agent", activeAgents.join(","));
    if (activeKinds.length > 0) params.set("kind", activeKinds.join(","));
    const qs = params.toString();
    return qs ? `/works?${qs}` : "/works";
  };

  /* 空态(登录):带可声明额度 pill(有用量数据时) */
  const allowance = user && page.nodes.length === 0
    ? await getClaimAllowance(user.id)
    : null;

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "works.eyebrow")}
        title={t(locale, "works.wallTitle")}
        lede={t(locale, "works.wallIntro")}
      />

      {/* items-start(20260815 三次打磨):排序 seg 与筛选下拉常驻行顶部对齐,
          筛选结果分组行在 WorksFilterBar 内部向下生长,工具位恒不动 */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <nav aria-label={t(locale, "feed.hot")} className={SEG_WRAP}>
          {(
            [
              { key: "hot", label: t(locale, "feed.hot"), active: currentSort === "hot" },
              { key: "new", label: t(locale, "feed.new"), active: currentSort === "new" },
            ] as const
          ).map((item) => (
            <Link
              key={item.key}
              href={sortHref(item.key)}
              scroll={false}
              aria-current={item.active ? "page" : undefined}
              className={`${SEG_ITEM} ${item.active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* 筛选:Agent + 类型 多选下拉(用量中心同款);状态全在 URL */}
        <WorksFilterBar
          basePath="/works"
          preservedQuery={preservedQuery}
          locale={locale}
          filters={[
            {
              key: "agent",
              label: t(locale, "works.agents"),
              options: AGENTS.map((a) => ({
                value: a.id,
                label: a.name,
                icon: <AgentIcon id={a.id} size={13} />,
              })),
            },
            {
              key: "kind",
              label: zh ? "类型" : "Type",
              options: WORK_KINDS.map((k) => ({
                value: k.id,
                label: workKindLabel(k.id, zh),
                icon: <WorkKindIcon id={k.id} size={13} />,
              })),
            },
          ]}
          selected={{ agent: activeAgents, kind: activeKinds }}
        />
        {/* 视图切换:行式 / 封面墙(cookie 持久,两页共用) */}
        <WorksViewToggle locale={locale} view={view} />
      </div>

      {page.nodes.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center sm:p-12">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-dashed border-line bg-paper/[0.03] text-grey">
            <GalleryVerticalEnd size={20} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-paper">
            {t(locale, "works.emptyTitle")}
          </h2>
          {allowance && allowance.total > 0 && (
            <p className="mt-2">
              <span className="inline-flex items-center rounded-full border border-blue/30 bg-blue/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue">
                {t(locale, "works.emptyQuota", {
                  n: `${compactNumber(allowance.remaining, locale)} tokens`,
                })}
              </span>
            </p>
          )}
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-grey">
            {t(locale, "works.emptyBody")}
          </p>
          {user ? (
            <Link
              href="/works/new"
              className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 font-mono text-xs text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, "works.emptyCta")}
            </Link>
          ) : (
            /* 统一登录引导卡(20260816 收编):与各受限页同源,带 next 回跳 */
            <div className="mx-auto mt-4 max-w-sm text-left">
              <LoginGate locale={locale} title={t(locale, "gate.work")} next="/works" />
            </div>
          )}
        </div>
      ) : (
        <div
          className={`stagger-in mt-8 grid gap-4 ${
            view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : ""
          }`}
        >
          {page.nodes}
          {/* key 带首屏规模与游标:卡片行内删除触发 refresh 后首屏一变即 remount,
              已追加的页作废(同 CommentSection 语义);视图切换同理 remount */}
          <LoadMore
            key={`works-${view}-${currentSort}-${activeAgents.join(",")}-${activeKinds.join(",")}-${page.nodes.length}-${page.nextCursor ?? "end"}-${locale}`}
            initialCursor={page.nextCursor}
            load={loadMoreWorksAction.bind(null, {
              awesome: false,
              sort: currentSort,
              agents: activeAgents,
              kinds: activeKinds,
              scope_: null,
            })}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
