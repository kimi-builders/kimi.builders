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
import { workKind, workKindLabel } from "@/src/lib/work-kinds";
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
        {work.handle ? (
          <Link
            href={`/u/${work.handle}`}
            className="flex items-center gap-2.5 transition-colors hover:text-blue"
          >
            <Avatar
              url={work.avatarUrl}
              handle={work.handle}
              size={28}
              className="shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs text-paper">
                @{work.handle}
              </span>
              <span className="block truncate font-mono text-[10px] text-grey">
                {relTime(work.createdAt, locale)}
              </span>
            </span>
          </Link>
        ) : (
          <p className="text-xs text-grey">
            {t(locale, "awesome.by", { name: work.authorLabel })}
          </p>
        )}

        {claimBadge !== null && (
          <p className="mt-3">
            <span
              className="inline-block rounded-md bg-blue/10 px-1.5 py-px font-mono text-[10px] font-medium text-blue"
              title={t(locale, "works.badgeTitle")}
            >
              {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
            </span>
          </p>
        )}

        {/* 状态 + 收录口径(awesome) */}
        {(work.status !== "released" || work.scope) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {work.scope && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue/10 px-1.5 py-px text-[10px] font-medium text-blue">
                <WorkScopeIcon id={work.scope} size={11} />
                {t(
                  locale,
                  work.scope === "eco"
                    ? "awesome.scopeEco"
                    : work.scope === "part"
                      ? "awesome.scopePart"
                      : "awesome.scopeBase",
                )}
              </span>
            )}
            {work.status !== "released" && (
              <span className="inline-flex items-center rounded-md bg-paper/[0.07] px-1.5 py-px text-[10px] font-medium text-grey">
                {t(
                  locale,
                  work.status === "planning"
                    ? "works.statusPlanning"
                    : work.status === "building"
                      ? "works.statusBuilding"
                      : "works.statusArchived",
                )}
              </span>
            )}
          </div>
        )}

        {work.agents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {work.agents.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-grey"
              >
                <AgentIcon id={a} size={13} />
                {agentName(a)}
              </span>
            ))}
          </div>
        )}

        {work.kind && (
          <div className="mt-3 border-t border-line pt-3">
            <h4 className="font-mono text-[10px] tracking-wider text-grey">
              {t(locale, "works.kind")}
            </h4>
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] ${workKind(work.kind).tint}`}>
                <WorkKindIcon id={work.kind} size={12} />
                {workKindLabel(work.kind, locale === "zh")}
              </span>
            </div>
          </div>
        )}

        {work.models.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <h4 className="font-mono text-[10px] tracking-wider text-grey">
              {t(locale, "works.sideModels")}
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {work.models.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-md bg-paper/[0.05] px-2 py-1 font-mono text-[10px] text-grey"
                >
                  <ModelIcon id={m} size={13} />
                  {modelFamilyName(m, locale)}
                </span>
              ))}
            </div>
          </div>
        )}


        {work.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
            {work.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-paper/[0.05] px-1.5 py-px font-mono text-[10px] text-grey"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {(work.url || work.repoUrl) && (
          <div className="mt-3 space-y-2 border-t border-line pt-3 font-mono text-xs">
            {work.url && (
              <a
                href={work.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 break-all text-blue underline-offset-4 hover:underline"
              >
                <ExternalLink size={12} className="shrink-0" />
                {t(locale, "works.visit")}
              </a>
            )}
            {work.repoUrl && (
              <a
                href={work.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 break-all text-grey transition-colors hover:text-blue"
              >
                <ExternalLink size={12} className="shrink-0" />
                {t(locale, "works.repo")}
              </a>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[11px] text-grey">
          <span className="inline-flex items-center gap-1">
            <Heart size={11} />
            {work.voteCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={11} />
            {work.commentCount}
          </span>
        </div>
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
                <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-grey">
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
