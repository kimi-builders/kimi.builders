/* 作品库 /works:成员作品墙(Kimi Design 改造:头部说明 + sort seg + Agent chips
   + 圆角截图卡双列网格)+ 提交入口。
   只展示 source=site 的成员作品;推荐的站外项目在 /awesome。
   卡片渲染与 /awesome 共用 _components/WorkCard,首屏与「加载更多」共用
   _components/works-page(游标分页:new = id,hot = votes|id 复合)。
   作者已 opt-in 公开用量时,卡片带「已验证构建投入」徽章(见 works-page)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, SquarePen } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import LoadMore from "@/components/LoadMore";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { AGENTS } from "@/src/lib/agents";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { isWorkKind, WORK_KINDS, workKindLabel } from "@/src/lib/work-kinds";
import { getClaimAllowance } from "@/src/lib/works";
import { loadMoreWorksAction } from "./actions";
import { loadWorksCards } from "./_components/works-page";
import WorksFilterBar from "./_components/WorksFilterBar";

export const metadata: Metadata = { title: "作品库 — kimi.builders" };

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; agent?: string; kind?: string }>;
}) {
  const { sort, agent, kind } = await searchParams;
  const currentSort = sort === "hot" ? "hot" : "new";
  const csv = (value?: string) => (value ?? "").split(",").filter(Boolean);
  const activeAgents = csv(agent).filter((id) => AGENTS.some((a) => a.id === id));
  const activeKinds = csv(kind).filter(isWorkKind);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  const page = await loadWorksCards(
    { awesome: false, sort: currentSort, agents: activeAgents, kinds: activeKinds },
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[0.2px] text-paper">
            <Rocket size={20} aria-hidden="true" />
            {t(locale, "works.wallTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-grey">
            {t(locale, "works.wallIntro")}
          </p>
        </div>
        {user && (
          <Link
            href="/works/new"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue bg-blue px-4 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <SquarePen size={13} aria-hidden="true" />
            {t(locale, "works.submit")}
          </Link>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
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
              label: "Agent",
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
                icon: <i className={`size-[7px] rounded-full ${k.dot}`} />,
              })),
            },
          ]}
          selected={{ agent: activeAgents, kind: activeKinds }}
        />
      </div>

      {page.nodes.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center sm:p-10">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-dashed border-line bg-paper/[0.03] text-grey">
            <Rocket size={20} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-paper">
            {t(locale, "works.emptyTitle")}
          </h2>
          {allowance && allowance.total > 0 && (
            <p className="mt-2">
              <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-amber-400">
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
              className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 font-mono text-[11px] text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, "works.emptyCta")}
            </Link>
          ) : (
            <p className="mt-3 text-xs text-grey">
              {t(locale, "works.loginRequired")}
              <a href="/api/auth/github" className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue">GitHub</a>
              <a href="/api/auth/google" className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue">Google</a>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {page.nodes}
          {/* key 带首屏规模与游标:卡片行内删除触发 refresh 后首屏一变即 remount,
              已追加的页作废(同 CommentSection 语义) */}
          <LoadMore
            key={`works-${currentSort}-${activeAgents.join(",")}-${activeKinds.join(",")}-${page.nodes.length}-${page.nextCursor ?? "end"}-${locale}`}
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
