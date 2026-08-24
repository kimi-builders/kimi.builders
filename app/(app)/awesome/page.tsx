/* Awesome: member-recommended external Kimi ecosystem projects. Header
   copy + a sort seg +
   filter dropdowns (agent / kind / scope); cards share WorkCard with
   /works (awesome entries carry a scope chip + recommender), and the
   first page and "load more" share ../works/_components/works-page
   (keyset paging: new = id, hot = the votes|id composite). The header
   uses the shared PageHeader grammar. Scope rules live in awesome.intro
   (relaxed: participation is enough); recommendation rules in the
   rail. */
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
import { getWorksView, isMobileRequest } from "@/src/lib/works-view-server";
import { loadMoreWorksAction } from "../works/actions";
import { loadWorksCards } from "../works/_components/works-page";
import WorksFilterBar from "../works/_components/WorksFilterBar";
import WorksViewToggle from "../works/_components/WorksViewToggle";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.awesome"), description: t(locale, "metaDesc.awesome") };
}

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
  /* Dedupe csv values: URLs are external input — un-converged duplicate
     ids amplify into the query layer. */
  const csv = (value?: string) => [...new Set((value ?? "").split(",").filter(Boolean))];
  const activeAgents = csv(agent).filter((id) => AGENTS.some((a) => a.id === id));
  const activeKinds = csv(kind).filter(isWorkKind);
  const activeScope = SCOPES.some((s) => s.id === scope) ? scope : undefined;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  /* View preference (cookie, shared with /works): grid = cover wall,
     list = rows (default); mobile is always rows (converged inside
     getWorksView) and the toggle isn't rendered. */
  const [view, mobile] = await Promise.all([getWorksView(), isMobileRequest()]);
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

  /* Stagger entrance only on the default view: filter/sort switches are
     server re-renders — all card keys change and the entrance animation
     would replay. */
  const stagger =
    currentSort === "new" &&
    activeAgents.length === 0 &&
    activeKinds.length === 0 &&
    !activeScope;

  /* Sort switches keep the filters. */
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

      {/* items-start: the sort seg and filter dropdowns stay aligned at the
          top of the standing row while grouped filter results grow downward
          inside WorksFilterBar — the tool positions never move. */}
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
        {/* Filters: agent / type (multi) + listing scope (single) — usage-hub style dropdowns */}
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
        {/* View toggle: rows / cover wall (cookie-persisted, shared with /works); hidden on mobile, which stays row-style */}
        {!mobile && <WorksViewToggle locale={locale} view={view} />}
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
