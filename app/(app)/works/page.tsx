/* /works: the member work wall (Kimi Design rework: header copy + sort
   seg + agent chips + a two-column grid of rounded screenshot cards) +
   a submit entry. Shows source=site member works only; recommended
   external projects live on /awesome. The header uses the shared
   PageHeader (eyebrow + kb-h1 + kb-lede); cards share
   _components/WorkCard with /awesome, and the first page and "load
   more" share _components/works-page (keyset paging: new = id, hot =
   the votes|id composite). When the author opted into public usage,
   cards carry the "verified build effort" badge (see works-page). */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Shell } from "lucide-react";
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
import { getWorksView, isMobileRequest } from "@/src/lib/works-view-server";
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
  /* Dedupe csv values: URLs are external input — un-converged duplicate
     ids amplify into the query layer. */
  const csv = (value?: string) => [...new Set((value ?? "").split(",").filter(Boolean))];
  const activeAgents = csv(agent).filter((id) => AGENTS.some((a) => a.id === id));
  const activeKinds = csv(kind).filter(isWorkKind);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  /* View preference (cookie): grid = cover wall (two/three columns),
     list = rows (default); mobile is always rows (converged inside
     getWorksView) and the toggle isn't rendered. */
  const [view, mobile] = await Promise.all([getWorksView(), isMobileRequest()]);
  const page = await loadWorksCards(
    { awesome: false, sort: currentSort, agents: activeAgents, kinds: activeKinds, view },
    user,
    locale,
  );

  const preservedQuery = currentSort !== "new" ? `sort=${currentSort}` : "";

  /* Sort switches keep the filters (agent/kind ride the link,
     complementing the filter bar). */
  const sortHref = (nextSort: string) => {
    const params = new URLSearchParams();
    if (nextSort !== "new") params.set("sort", nextSort);
    if (activeAgents.length > 0) params.set("agent", activeAgents.join(","));
    if (activeKinds.length > 0) params.set("kind", activeKinds.join(","));
    const qs = params.toString();
    return qs ? `/works?${qs}` : "/works";
  };

  /* Empty state (signed in): carries a claimable-allowance pill when
     usage data exists. */
  const allowance = user && page.nodes.length === 0
    ? await getClaimAllowance(user.id)
    : null;

  /* Stagger entrance only on the default view: filter/sort switches are
     server re-renders — all card keys change and the first 8 cards
     would replay the entrance animation, reading as a stutter; only the
     default view (no filter params) mounts stagger-in, keeping soft
     navigation fluid. */
  const stagger = currentSort === "new" && activeAgents.length === 0 && activeKinds.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "works.eyebrow")}
        title={t(locale, "works.wallTitle")}
        lede={t(locale, "works.wallIntro")}
      />

      {/* items-start: the sort seg and filter dropdowns stay aligned at the
          top of the standing row while grouped filter results grow downward
          inside WorksFilterBar — the tool positions never move. */}
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
        {/* Filters: agent + type multi-select dropdowns (usage-hub style); all state lives in the URL */}
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
        {/* View toggle: rows / cover wall (cookie-persisted, shared with Awesome); hidden on mobile, which stays row-style */}
        {!mobile && <WorksViewToggle locale={locale} view={view} />}
      </div>

      {page.nodes.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center sm:p-12">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-dashed border-line bg-paper/[0.03] text-grey">
            <Shell size={20} aria-hidden="true" />
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
            /* The unified login-invitation card: shared with other gated
               pages, carrying the next redirect. */
            <div className="mx-auto mt-4 max-w-sm text-left">
              <LoginGate locale={locale} title={t(locale, "gate.work")} next="/works" />
            </div>
          )}
        </div>
      ) : (
        <div
          className={`mt-8 grid gap-4 ${stagger ? "stagger-in " : ""}${
            view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : ""
          }`}
        >
          {page.nodes}
          {/* The key carries first-page size and cursor: an inline delete triggers a
            refresh, any first-page change remounts, and already-appended pages are
            discarded (same semantics as CommentSection); view switches remount the
            same way. */}
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
