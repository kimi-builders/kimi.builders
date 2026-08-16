/* 作品详情右栏(/works/[id]):作品元数据卡(作者/agents/链接/声明徽章/支持·评论数)
   + 相关作品(同作者或同 Agent,5 条)。≥xl 取代详情页内联侧栏(页面侧 xl:hidden)。
   作品与徽章数据复用详情页查询(getWorkDetail / getAuthorClaimContext 都走
   React cache,同一请求去重);作品不存在时页面给友好文案,右栏整个不渲染。
   私密作品:详情页对非作者按不存在处理,右栏同样不渲染(布局壳仍挂载,
   不能借右栏把私密作品元数据漏给外人;同 PostRail 口径)。 */
import Link from "next/link";
import { ExternalLink, Heart, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import AgentIcon from "@/components/AgentIcon";
import ModelIcon from "@/components/ModelIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import { agentName } from "@/src/lib/agents";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber, relTime } from "@/src/lib/format";
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
  /* claimBadgeOf 的不变式需要 Map 形态;单作者场景现场构造(值与详情页同一次查询) */
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
        {/* label/value hairline 行(20260813 改版):作者/声明/口径/阶段/Agent/
            类型/模型/标签/链接/发布/支持/评论 */}
        <dl className="font-mono text-[11px]">
          <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <dt className="text-grey">
              {t(locale, work.source === "awesome" && work.authorLabel ? "works.sideOriginalAuthor" : "works.sideAuthor")}
            </dt>
            <dd className="min-w-0 text-paper">
              {work.source === "awesome" && work.authorLabel ? (
                <span className="truncate">{work.authorLabel}</span>
              ) : work.handle ? (
                <Link
                  href={`/u/${work.handle}`}
                  className="flex items-center gap-1.5 transition-colors hover:text-blue"
                >
                  <Avatar url={work.avatarUrl} handle={work.handle} size={18} className="shrink-0" />
                  <span className="truncate">@{work.handle}</span>
                </Link>
              ) : (
                <span className="truncate">{work.authorLabel}</span>
              )}
            </dd>
          </div>
          {claimBadge !== null && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "works.declared")}</dt>
              <dd className="text-blue" title={t(locale, "works.badgeTitle")}>
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
          {(work.url || work.repoUrl) && (
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "works.sideLinks")}</dt>
              <dd className="inline-flex items-center gap-3">
                {work.url && (
                  <a
                    href={work.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue underline-offset-4 hover:underline"
                  >
                    <ExternalLink size={11} />
                    {t(locale, "works.visit")}
                  </a>
                )}
                {work.repoUrl && (
                  <a
                    href={work.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-grey transition-colors hover:text-blue"
                  >
                    <ExternalLink size={11} />
                    {t(locale, "works.repo")}
                  </a>
                )}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <dt className="text-grey">{t(locale, "works.published")}</dt>
            <dd className="text-paper">{relTime(work.createdAt, locale)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-grey">{t(locale, "works.support")}</dt>
            <dd className="inline-flex items-center gap-2.5 text-paper">
              <span className="inline-flex items-center gap-1">
                <Heart size={11} />
                {work.voteCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle size={11} />
                {work.commentCount}
              </span>
            </dd>
          </div>
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
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-blue"
                >
                  {r.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-grey">
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
