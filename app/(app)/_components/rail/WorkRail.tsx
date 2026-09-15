/* Work detail rail (/works/[id]): the work metadata card
   (declaration/agents/kind/models/tags — structural attributes only;
   author/time live in the page byline, support in the action bar,
   links in the action row, so none repeat here) + related works (same
   author or shared agent, 5 rows). From xl it replaces the detail
   page's inline panel (xl:hidden there). Work and badge data reuse the
   detail queries (getWorkDetail / getAuthorClaimContext both ride
   React cache, deduped per request); a missing work gets friendly page
   copy and no rail. Private works: the detail page treats them as
   missing for non-authors and the rail follows (the layout shell still
   mounts — the rail must never leak a private work's metadata; same
   rule as PostRail). */
import Link from "next/link";
import { Heart } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import ModelIcon from "@/components/ModelIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import { agentName } from "@/src/lib/agents";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { modelFamilyName } from "@/src/lib/model-families";
import { workKindLabel } from "@/src/lib/work-kinds";
import {
  canViewWork,
  claimBadgeOf,
  getAuthorClaimContext,
  getRelatedWorks,
  getWorkDetail,
} from "@/src/lib/works";
import Widget from "./Widget";

export default async function WorkRail({
  id,
  locale,
}: {
  id: number;
  locale: Locale;
}) {
  const work = await getWorkDetail(id);
  if (!work) return null;
  if (work.visibility !== "public" || work.hiddenAt) {
    const user = await getSessionUser();
    if (!canViewWork(work, user)) return null;
  }

  const [claimCtx, related] = await Promise.all([
    work.userId !== null
      ? getAuthorClaimContext(work.userId)
      : Promise.resolve(null),
    getRelatedWorks(work),
  ]);
  /* claimBadgeOf's invariant wants a Map; the single-author case
     builds it on the spot (values from the same query as the detail
     page). */
  const claimBadge =
    work.userId !== null && claimCtx
      ? claimBadgeOf(
          work,
          new Map([[work.userId, claimCtx.total]]),
          new Map([[work.userId, claimCtx.claimSum]]),
        )
      : null;

  return (
    <>
      <Widget title={t(locale, "rail.workMeta")}>
        {/* Label/value hairline rows: declaration / scope / stage / agents
            / type / models / tags — identity, time, engagement, and links
            render once on the page itself and never here */}
        <dl className="font-mono text-xs [&>div:last-child]:border-b-0">
          {claimBadge !== null && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "works.declared")}</dt>
              <dd className="text-ui-blue" title={t(locale, "works.badgeTitle")}>
                {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
              </dd>
            </div>
          )}
          {work.scope && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "awesome.scope")}</dt>
              <dd className="inline-flex items-center gap-1 text-paper">
                <WorkScopeIcon id={work.scope} size={11} />
                {t(
                  locale,
                  work.scope === "eco"
                    ? "awesome.scopeEco"
                    : work.scope === "part"
                      ? "awesome.scopePart"
                      : "awesome.scopeBase",
                )}
              </dd>
            </div>
          )}
          {work.status !== "released" && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "works.status")}</dt>
              <dd className="text-paper">
                {t(
                  locale,
                  work.status === "planning"
                    ? "works.statusPlanning"
                    : work.status === "building"
                      ? "works.statusBuilding"
                      : "works.statusArchived",
                )}
              </dd>
            </div>
          )}
          {work.agents.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="shrink-0 text-grey">{t(locale, "works.agents")}</dt>
              <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-paper">
                {work.agents.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1">
                    <AgentIcon id={a} size={11} />
                    {agentName(a)}
                  </span>
                ))}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <dt className="text-grey">{t(locale, "works.kind")}</dt>
            <dd className="inline-flex items-center gap-1 text-paper">
              <WorkKindIcon id={work.kind} size={11} />
              {workKindLabel(work.kind, locale === "zh")}
            </dd>
          </div>
          {work.models.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="shrink-0 text-grey">{t(locale, "works.sideModels")}</dt>
              <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-paper">
                {work.models.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1">
                    <ModelIcon id={m} size={11} />
                    {modelFamilyName(m, locale)}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {work.tags.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="shrink-0 text-grey">{t(locale, "works.tagsShort")}</dt>
              <dd className="min-w-0 truncate text-right text-paper" title={work.tags.join(", ")}>
                {work.tags.join(", ")}
              </dd>
            </div>
          )}
        </dl>
      </Widget>

      <Widget title={t(locale, "rail.relatedWorks")}>
        {related.length === 0 ? (
          <p className="text-xs text-grey">
            {t(locale, "rail.relatedWorksEmpty")}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {related.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 text-xs">
                <Link
                  href={`/works/${r.id}`}
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {r.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-grey">
                  <Heart size={11} />
                  {r.voteCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </>
  );
}
