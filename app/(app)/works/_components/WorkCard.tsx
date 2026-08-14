/* 作品卡片(行式,20260813 改版):/works(成员作品墙)与 /awesome(全来源)、
   /u/[handle] 作品页签共用。图在左固定列(移动端在上),标题一行截断,
   类型/Agent/标签/声明/精选收成一条 mono meta 行(蓝只给声明与精选),
   底行 hairline 分隔:作者/支持/链接/操作。私密/屏蔽保留警示 pill(仅作者可见)。
   整卡链到详情页(P1-2,absolute 覆盖链接);作者/访问/源码/操作行抬 z-10 保持独立跳转。
   编辑精选:featured_at 非空时 meta 行带 ★ 精选;canFeature(admin/mod)时底部多
   一行设/撤精选操作(每周精选 v0)。
   用量徽章(声明制,20260822_work_claims):claimBadge 非空(本作品已声明且
   作者 Σ声明 ≤ 可验证总量,不变式由组装层 claimBadgeOf 判定)时 meta 行带
   「声明投入」;null = 完全不渲染(未声明/超额暂停,无负面标记)。
   claimPaused(仅作者本人为 true)时作者在自己的卡片上看到重新分配提示。 */
import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import { agentName } from "@/src/lib/agents";
import { awesomeToneFor } from "@/src/lib/cover-tones";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";
import { workKindLabel } from "@/src/lib/work-kinds";
import type { WorkRow } from "@/src/lib/works";
import Avatar from "@/components/Avatar";
import AgentIcon from "@/components/AgentIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkFeaturedToggle from "./WorkFeaturedToggle";
import WorkOwnerActions from "./WorkOwnerActions";
import WorkScreenshot from "./WorkScreenshot";

const CHIP = "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-medium";

/* 状态/口径标签:meta 行纯文本 token(不再是 pill 芯片)。 */
function statusLabelOf(status: string, locale: Locale): string | null {
  if (status === "released") return null;
  return t(
    locale,
    status === "planning"
      ? "works.statusPlanning"
      : status === "building"
        ? "works.statusBuilding"
        : "works.statusArchived",
  );
}

function scopeLabelOf(scope: string, locale: Locale): string {
  return t(
    locale,
    scope === "eco"
      ? "awesome.scopeEco"
      : scope === "part"
        ? "awesome.scopePart"
        : "awesome.scopeBase",
  );
}

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
  const kindLabel = workKindLabel(w.kind, locale === "zh");
  const scopeLabel = w.source === "awesome" && w.scope ? scopeLabelOf(w.scope, locale) : null;
  const statusLabel = statusLabelOf(w.status, locale);
  return (
    /* 行式卡:移动端图在上,sm+ 图在左固定列;标题独占一行截断,
       类型/Agent/声明/精选收成一条 mono meta 行,底行 hairline 分隔。 */
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-paper/20 sm:flex-row">
      {/* 整卡链详情页(P1-2,absolute 覆盖链接);下方交互元素抬 z-10 保持独立跳转 */}
      <Link
        href={`/works/${w.id}`}
        aria-label={w.name}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="shrink-0 border-b border-line sm:w-[220px] sm:self-stretch sm:border-b-0 sm:border-r">
        {/* 封面 = 配图第一张(表单承诺的语义);无配图才回落旧的 screenshot_url 外链,
            再空则 WorkScreenshot 兜底「名称砖」:作品=作者选定色/theme,
            Awesome=按类型族指派(awesomeToneFor) */}
        <WorkScreenshot
          url={w.imageKeys[0] ? mediaUrl(w.imageKeys[0]) : w.screenshotUrl}
          name={w.name}
          logoUrl={w.logoKey ? mediaUrl(w.logoKey) : ""}
          kindLabel={kindLabel}
          kindId={w.kind}
          tone={
            w.source === "awesome" && w.coverTone === "theme"
              ? awesomeToneFor(w.kind)
              : w.coverTone
          }
          fit={w.coverFit}
          embedded
          fill
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <h2 className="truncate text-[15px] font-semibold leading-snug text-paper">
          {w.name}
        </h2>
        {w.tagline && (
          <p className="mt-1 truncate text-[13px] leading-relaxed text-grey">
            {w.tagline}
          </p>
        )}
        {/* meta 行:mono 灰字一条;蓝只给声明投入与精选;私密/屏蔽保留警示 pill(仅作者/治理可见) */}
        <div className="mb-4 mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-grey">
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
          <span className="inline-flex shrink-0 items-center gap-1">
            <WorkKindIcon id={w.kind} size={11} />
            {kindLabel}
          </span>
          {w.agents.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1">
              ·
              {w.agents.map((a) => (
                <span key={a} className="inline-flex shrink-0 items-center gap-1">
                  <AgentIcon id={a} size={11} />
                  {agentName(a)}
                </span>
              ))}
            </span>
          )}
          {w.tags.length > 0 && (
            <span className="truncate">· {w.tags.slice(0, 3).join(", ")}</span>
          )}
          {scopeLabel && <span className="shrink-0">· {scopeLabel}</span>}
          {statusLabel && <span className="shrink-0">· {statusLabel}</span>}
          {claimBadge !== null && claimBadge > 0 && (
            <span
              className="shrink-0 text-blue"
              title={t(locale, "works.badgeTitle")}
            >
              · {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
            </span>
          )}
          {w.featuredAt && (
            <span
              className="shrink-0 text-blue"
              title={w.featuredReason ?? undefined}
            >
              · ★ {t(locale, "featured.badge")}
            </span>
          )}
        </div>
        {/* 底行:hairline 分隔;作者 / 支持 / 链接 / 作者操作 */}
        <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 font-mono text-[11px] text-grey">
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
          <div className="relative z-10 mt-2">
            <WorkFeaturedToggle
              workId={w.id}
              featuredReason={w.featuredAt ? (w.featuredReason ?? "") : null}
              locale={locale}
            />
          </div>
        )}
      </div>
    </article>
  );
}
