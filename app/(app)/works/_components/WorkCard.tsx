/* 作品卡片:/works(成员作品墙)与 /awesome(全来源)、/u/[handle] 作品页签共用。
   截图(无图占位)→ 名称/介绍 → Agent 徽章(lobehub 图标)→ 标签 →
   作者行(站内作者链主页;awesome 条目用 author_label);自己的条目带编辑/删除。
   整卡链到详情页(P1-2,absolute 覆盖链接);作者/访问/源码/操作行抬 z-10 保持独立跳转。
   编辑精选:featured_at 非空的卡片带「编辑精选」蓝芯片;canFeature(admin/mod,
   由页面用 session role 判断)时底部多一行设/撤精选操作(每周精选 v0)。
   用量徽章(S2-2):badgeTokens 非空(作者已自愿公开用量且有数据)时标题旁多一颗
   「已验证构建投入」芯片;null = 完全不渲染(未 opt-in / 无数据,无负面标记)。 */
import Link from "next/link";
import { ExternalLink, Heart, Rocket } from "lucide-react";
import { agentName } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import type { WorkRow } from "@/src/lib/works";
import AgentIcon from "@/components/AgentIcon";
import WorkFeaturedToggle from "./WorkFeaturedToggle";
import WorkOwnerActions from "./WorkOwnerActions";

export default function WorkCard({
  work: w,
  locale,
  meId,
  canFeature = false,
  badgeTokens = null,
}: {
  work: WorkRow;
  locale: Locale;
  meId: number | null;
  canFeature?: boolean;
  badgeTokens?: number | null;
}) {
  return (
    <article className="relative flex flex-col border border-line bg-card transition-colors hover:border-paper/20">
      {/* 整卡链详情页(P1-2,absolute 覆盖链接);下方交互元素抬 z-10 保持独立跳转 */}
      <Link
        href={`/works/${w.id}`}
        aria-label={w.name}
        className="absolute inset-0"
      />
      {w.screenshotUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={w.screenshotUrl}
          alt={w.name}
          className="aspect-video w-full border-b border-line object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center border-b border-line text-grey/40">
          <Rocket size={28} />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-medium leading-snug text-paper">
          {w.name}
          {w.featuredAt && (
            <span
              className="ml-2 inline-block border border-blue/60 px-1.5 py-px align-middle font-mono text-[10px] font-normal text-blue"
              title={w.featuredReason ?? undefined}
            >
              {t(locale, "featured.badge")}
            </span>
          )}
          {badgeTokens !== null && badgeTokens > 0 && (
            <span
              className="ml-2 inline-block border border-emerald-400/60 px-1.5 py-px align-middle font-mono text-[10px] font-normal text-emerald-400"
              title={t(locale, "works.badgeTitle")}
            >
              {t(locale, "works.badge", { n: compactNumber(badgeTokens, locale) })}
            </span>
          )}
        </h2>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
            {w.tagline}
          </p>
        )}
        {w.agents.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-grey">
            {w.agents.map((a) => (
              <span key={a} title={agentName(a)} className="inline-flex">
                <AgentIcon id={a} size={15} />
              </span>
            ))}
          </div>
        )}
        {w.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {w.tags.map((tag) => (
              <span
                key={tag}
                className="border border-line px-1.5 py-px font-mono text-[10px] text-grey"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-3 font-mono text-[11px] text-grey">
            {w.source === "awesome" && w.authorLabel ? (
              <span className="truncate">
                {t(locale, "awesome.by", { name: w.authorLabel })}
              </span>
            ) : w.handle ? (
              <Link
                href={`/u/${w.handle}`}
                className="relative z-10 flex min-w-0 items-center gap-1.5 text-grey transition-colors hover:text-blue"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={w.avatarUrl ?? ""}
                  alt=""
                  className="h-4 w-4 rounded-full"
                />
                <span className="truncate text-paper">@{w.handle}</span>
              </Link>
            ) : (
              <span className="truncate">
                {t(locale, "awesome.by", { name: w.authorLabel })}
              </span>
            )}
            <span className="relative z-10 ml-auto flex shrink-0 items-center gap-3">
              {/* 支持数(P1-2):只读展示,投票在详情页 */}
              <span
                className="inline-flex items-center gap-1"
                title={t(locale, "works.support")}
              >
                <Heart size={12} />
                {w.voteCount}
              </span>
              {w.url && (
                <a
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t(locale, "works.visit")}
                  className="inline-flex items-center gap-1 transition-colors hover:text-blue"
                >
                  <ExternalLink size={12} />
                  {t(locale, "works.visit")}
                </a>
              )}
              {w.repoUrl && (
                <a
                  href={w.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t(locale, "works.repo")}
                  className="inline-flex items-center gap-1 transition-colors hover:text-blue"
                >
                  {t(locale, "works.repo")}
                </a>
              )}
              {meId !== null && w.userId === meId && (
                <WorkOwnerActions workId={w.id} locale={locale} />
              )}
            </span>
          </div>
          {canFeature && (
            <div className="relative z-10">
              <WorkFeaturedToggle
                workId={w.id}
                featuredReason={w.featuredAt ? (w.featuredReason ?? "") : null}
                locale={locale}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
