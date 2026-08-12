/* 作品卡片:/works(成员作品墙)与 /awesome(全来源)、/u/[handle] 作品页签共用。
   Kimi Design 改造:rounded-2xl + tint 芯片;头部 = 名称 + 口径/状态/精选/声明徽章;
   Agent 带图标小 chip;标签 tint pill;底行作者(awesome 条目带推荐人)/支持/链接/操作。
   整卡链到详情页(P1-2,absolute 覆盖链接);作者/访问/源码/操作行抬 z-10 保持独立跳转。
   编辑精选:featured_at 非空的卡片带「编辑精选」蓝芯片;canFeature(admin/mod,
   由页面用 session role 判断)时底部多一行设/撤精选操作(每周精选 v0)。
   用量徽章(声明制,20260822_work_claims):claimBadge 非空(本作品已声明且
   作者 Σ声明 ≤ 可验证总量,不变式由组装层 claimBadgeOf 判定)时标题旁多一颗
   「声明构建投入」芯片;null = 完全不渲染(未声明/超额暂停,无负面标记)。
   claimPaused(仅作者本人为 true)时作者在自己的卡片上看到重新分配提示。 */
import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import { agentName } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";
import { workKind, workKindLabel } from "@/src/lib/work-kinds";
import type { WorkRow } from "@/src/lib/works";
import Avatar from "@/components/Avatar";
import AgentIcon from "@/components/AgentIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import WorkFeaturedToggle from "./WorkFeaturedToggle";
import WorkOwnerActions from "./WorkOwnerActions";
import WorkScreenshot from "./WorkScreenshot";

/* 状态芯片:released 不显示(默认态);planning 琥珀 / building 蓝 / archived 灰。 */
const STATUS_CHIP: Record<
  string,
  {
    cls: string;
    key: "works.statusPlanning" | "works.statusBuilding" | "works.statusArchived";
  }
> = {
  planning: { cls: "bg-moon text-grey", key: "works.statusPlanning" },
  building: { cls: "bg-blue/10 text-blue", key: "works.statusBuilding" },
  archived: { cls: "bg-paper/[0.07] text-grey", key: "works.statusArchived" },
};

/* Awesome 收录口径芯片:base 蓝 / eco 绿 / part 琥珀。 */
const SCOPE_CHIP: Record<
  string,
  {
    cls: string;
    key: "awesome.scopeBase" | "awesome.scopeEco" | "awesome.scopePart";
  }
> = {
  base: { cls: "bg-blue/10 text-blue", key: "awesome.scopeBase" },
  eco: { cls: "bg-paper/[0.07] text-paper", key: "awesome.scopeEco" },
  part: { cls: "bg-moon text-grey", key: "awesome.scopePart" },
};

const CHIP = "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-medium";

export default function WorkCard({
  work: w,
  locale,
  meId,
  canFeature = false,
  claimBadge = null,
  claimPaused = false,
}: {
  work: WorkRow;
  locale: Locale;
  meId: number | null;
  canFeature?: boolean;
  claimBadge?: number | null;
  claimPaused?: boolean;
}) {
  const statusChip = STATUS_CHIP[w.status];
  const scopeChip = w.source === "awesome" ? SCOPE_CHIP[w.scope] : undefined;
  return (
    <article className="relative flex flex-col rounded-2xl border border-line bg-card transition-colors hover:border-paper/20">
      {/* 整卡链详情页(P1-2,absolute 覆盖链接);下方交互元素抬 z-10 保持独立跳转 */}
      <Link
        href={`/works/${w.id}`}
        aria-label={w.name}
        className="absolute inset-0 rounded-2xl"
      />
      <div className="overflow-hidden rounded-t-2xl border-b border-line">
        <WorkScreenshot
          url={w.screenshotUrl}
          name={w.name}
          logoUrl={w.logoKey ? mediaUrl(w.logoKey) : ""}
          kindLabel={workKindLabel(w.kind, locale === "zh")}
          embedded
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 text-[15px] font-semibold leading-snug text-paper">
            {w.name}
          </h2>
          <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
            {/* 私密/被屏蔽徽标:数据层已保证只有作者本人看得到这类卡片(同 PostCard 口径) */}
            {w.visibility === "private" && (
              <span className={`${CHIP} border border-line text-grey`}>
                {t(locale, "works.private")}
              </span>
            )}
            {w.hiddenAt && (
              <span
                className={`${CHIP} border border-red-400/60 text-red-400`}
                title={w.hiddenReason ?? undefined}
              >
                {t(locale, "mod.hiddenBadge")}
              </span>
            )}
            <span className={`${CHIP} ${workKind(w.kind).tint}`}>
              <WorkKindIcon id={w.kind} size={11} />
              {workKindLabel(w.kind, locale === "zh")}
            </span>
            {scopeChip && (
              <span className={`${CHIP} ${scopeChip.cls}`}>
                <WorkScopeIcon id={w.scope} size={11} />
                {t(locale, scopeChip.key)}
              </span>
            )}
            {statusChip && (
              <span className={`${CHIP} ${statusChip.cls}`}>
                {t(locale, statusChip.key)}
              </span>
            )}
            {w.featuredAt && (
              <span
                className={`${CHIP} bg-blue/10 text-blue`}
                title={w.featuredReason ?? undefined}
              >
                {t(locale, "featured.badge")}
              </span>
            )}
            {claimBadge !== null && claimBadge > 0 && (
              <span
                className={`${CHIP} bg-blue/10 font-mono text-blue`}
                title={t(locale, "works.badgeTitle")}
              >
                {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
              </span>
            )}
          </span>
        </div>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-grey">
            {w.tagline}
          </p>
        )}
        {w.agents.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {w.agents.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-paper/[0.03] px-1.5 py-0.5 text-[10.5px] text-grey"
              >
                <AgentIcon id={a} size={12} />
                {agentName(a)}
              </span>
            ))}
          </div>
        )}
        {w.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {w.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-paper/[0.05] px-1.5 py-px font-mono text-[10px] text-grey"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-3 font-mono text-[11px] text-grey">
            {w.source === "awesome" && w.authorLabel ? (
              <span className="min-w-0 truncate">
                {t(locale, "awesome.by", { name: w.authorLabel })}
                {w.handle && (
                  <span className="text-grey/70">
                    {" · "}
                    {t(locale, "awesome.recommender", { handle: w.handle })}
                  </span>
                )}
              </span>
            ) : w.handle ? (
              <Link
                href={`/u/${w.handle}`}
                className="relative z-10 flex min-w-0 items-center gap-1.5 text-grey transition-colors hover:text-blue"
              >
                <Avatar url={w.avatarUrl} handle={w.handle} size={16} />
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
          {/* 声明超额提示(声明制):仅作者本人可见,引导去编辑页重新分配 */}
          {claimPaused && meId !== null && w.userId === meId && (
            <p className="relative z-10 mt-2 rounded-lg bg-moon px-2 py-1.5 font-mono text-[10px] leading-relaxed text-grey">
              {t(locale, "works.claimPaused")}
            </p>
          )}
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
