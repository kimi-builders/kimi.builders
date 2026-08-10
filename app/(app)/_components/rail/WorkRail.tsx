/* 作品详情右栏(/works/[id]):作品元数据卡(作者/agents/链接/声明徽章/支持·评论数)
   + 相关作品(同作者或同 Agent,5 条)。≥xl 取代详情页内联侧栏(页面侧 xl:hidden)。
   作品与徽章数据复用详情页查询(getWorkDetail / getAuthorClaimContext 都走
   React cache,同一请求去重);作品不存在时页面给友好文案,右栏整个不渲染。 */
import Link from "next/link";
import { ExternalLink, Heart, MessageCircle } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import { agentName } from "@/src/lib/agents";
import { compactNumber, relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import {
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={work.avatarUrl ?? ""}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full border border-paper/10"
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
              className="inline-block border border-emerald-400/60 px-1.5 py-px font-mono text-[10px] text-emerald-400"
              title={t(locale, "works.badgeTitle")}
            >
              {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
            </span>
          </p>
        )}

        {work.agents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {work.agents.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 border border-line px-2 py-1 font-mono text-[10px] text-grey"
              >
                <AgentIcon id={a} size={13} />
                {agentName(a)}
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
