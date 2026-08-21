/* Awesome Kimi:全世界用 Kimi 构建的项目(全部来源:成员作品 + 推荐的站外项目)。
   头部说明 + sort seg + 筛选下拉(Agent / 类型 / 收录口径);卡片与 /works 共用
   WorkCard(awesome 条目带口径 chip + 推荐人),首屏与「加载更多」共用
   ../works/_components/works-page(游标分页:new = id,hot = votes|id 复合)。
   页头(20260819 版式对齐)接入共享 PageHeader,与 learn/blog 同一语法。
   收录口径见 awesome.intro(放宽:参与即可);推荐规则见右栏。 */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import AgentIcon from "@/components/AgentIcon";
import EmptyState from "@/components/EmptyState";
import LoadMore from "@/components/LoadMore";
import WorkKindIcon from "@/components/WorkKindIcon";
import PageHeader from "@/components/PageHeader";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { AGENTS } from "@/src/lib/agents";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { isWorkKind, WORK_KINDS, workKindLabel } from "@/src/lib/work-kinds";
import { getWorksView } from "@/src/lib/works-view-server";
import { loadMoreWorksAction } from "../works/actions";
import { loadWorksCards } from "../works/_components/works-page";
import WorksFilterBar from "../works/_components/WorksFilterBar";
import WorksViewToggle from "../works/_components/WorksViewToggle";

export const metadata: Metadata = { title: "Awesome — kimi.builders" };

const SCOPES = [
  { id: "base", key: "awesome.scopeBase" as const },
  { id: "eco", key: "awesome.scopeEco" as const },
  { id: "part", key: "awesome.scopePart" as const },
];

export default async function AwesomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; agent?: string; kind?: string; scope?: string }>;
}) {
  const { sort, agent, kind, scope } = await searchParams;
  const requestHeaders = await headers();
  trackEvent("awesome_view", { kind: "page", id: "awesome" }, { headers: requestHeaders });
  const currentSort = sort === "hot" ? "hot" : "new";
  const csv = (value?: string) => (value ?? "").split(",").filter(Boolean);
  const activeAgents = csv(agent).filter((id) => AGENTS.some((a) => a.id === id));
  const activeKinds = csv(kind).filter(isWorkKind);
  const activeScope = SCOPES.some((s) => s.id === scope) ? scope : undefined;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  /* 视图偏好(cookie,与 /works 共用):grid=封面墙,list=行式(默认) */
  const view = await getWorksView();
  const page = await loadWorksCards(
    {
      awesome: true,
      sort: currentSort,
      agents: activeAgents,
      kinds: activeKinds,
      scope_: activeScope,
      view,
    },
    user,
    locale,
  );

  const preservedQuery = currentSort !== "new" ? `sort=${currentSort}` : "";

  /* stagger 入场只在默认视图挂载(20260821 评审,与 /works 同口径):
     筛选/排序切换是服务端重渲染,卡片 key 全换会重放入场动画 */
  const stagger =
    currentSort === "new" &&
    activeAgents.length === 0 &&
    activeKinds.length === 0 &&
    !activeScope;

  /* sort 切换保留筛选 */
  const sortHref = (nextSort: string) => {
    const params = new URLSearchParams();
    if (nextSort !== "new") params.set("sort", nextSort);
    if (activeAgents.length > 0) params.set("agent", activeAgents.join(","));
    if (activeKinds.length > 0) params.set("kind", activeKinds.join(","));
    if (activeScope) params.set("scope", activeScope);
    const qs = params.toString();
    return qs ? `/awesome?${qs}` : "/awesome";
  };

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "awesome.eyebrow")}
        title={t(locale, "nav.awesome")}
        lede={t(locale, "awesome.intro")}
      />

      {/* items-start(20260815 三次打磨):排序 seg 与筛选下拉常驻行顶部对齐,
          筛选结果分组行在 WorksFilterBar 内部向下生长,工具位恒不动 */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <nav aria-label={t(locale, "feed.hot")} className={SEG_WRAP}>
          {(
            [
              { key: "hot", label: t(locale, "feed.hot"), active: currentSort === "hot", href: sortHref("hot") },
              { key: "new", label: t(locale, "feed.new"), active: currentSort === "new", href: sortHref("new") },
            ] as const
          ).map((item) => (
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
        {/* 筛选:Agent / 类型(多选)+ 收录口径(单选)—— 用量中心同款下拉 */}
        <WorksFilterBar
          basePath="/awesome"
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
            {
              key: "scope",
              label: zh ? "口径" : "Scope",
              single: true,
              options: SCOPES.map((s) => ({
                value: s.id,
                label: t(locale, s.key),
                icon: <WorkScopeIcon id={s.id} size={13} />,
              })),
            },
          ]}
          selected={{
            agent: activeAgents,
            kind: activeKinds,
            scope: activeScope ? [activeScope] : [],
          }}
        />
        {/* 视图切换:行式 / 封面墙(cookie 持久,与 /works 共用偏好) */}
        <WorksViewToggle locale={locale} view={view} />
      </div>

      {page.nodes.length === 0 ? (
        <EmptyState
          className="mt-4"
          message={t(locale, "awesome.empty")}
        />
      ) : (
        <div
          className={`mt-8 grid gap-4 ${stagger ? "stagger-in " : ""}${
            view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : ""
          }`}
        >
          {page.nodes}
          <LoadMore
            key={`awesome-${view}-${currentSort}-${activeAgents.join(",")}-${activeKinds.join(",")}-${activeScope ?? ""}-${page.nodes.length}-${page.nextCursor ?? "end"}-${locale}`}
            initialCursor={page.nextCursor}
            load={loadMoreWorksAction.bind(null, {
              awesome: true,
              sort: currentSort,
              agents: activeAgents,
              kinds: activeKinds,
              scope_: activeScope ?? null,
            })}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
