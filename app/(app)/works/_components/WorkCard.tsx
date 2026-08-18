/* 作品卡片(行式,20260813 改版;20260918 完善):/works(成员作品墙)与
   /awesome(全来源)、/u/[handle] 作品页签共用。图在左固定列(移动端在上,
   sm+ 248px),标题一行截断,类型/Agent/标签/声明/精选收成 mono meta 行
   (蓝只给声明与精选),底行 hairline 分隔:作者/支持/链接/操作(共享
   WorkCardFooter)。hover:边框提亮 + 封面轻放大 + 标题变蓝(group)。
   私密/屏蔽保留警示 pill(仅作者可见)。
   整卡链到详情页(P1-2,absolute 覆盖链接);作者/访问/源码/操作行抬 z-10 保持独立跳转。
   编辑精选:featured_at 非空时 meta 行带 ★ 精选;canFeature(admin/mod)时底部多
   一行设/撤精选操作(每周精选 v0)。
   用量徽章(声明制,20260822_work_claims):claimBadge 非空(本作品已声明且
   作者 Σ声明 ≤ 可验证总量,不变式由组装层 claimBadgeOf 判定)时 meta 行带
   「声明投入」;null = 完全不渲染(未声明/超额暂停,无负面标记)。
   claimPaused(仅作者本人为 true)时作者在自己的卡片上看到重新分配提示。 */
import Link from "next/link";
import { agentName } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";
import { workKindLabel } from "@/src/lib/work-kinds";
import type { WorkRow } from "@/src/lib/works";
import AgentIcon from "@/components/AgentIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import WorkFeaturedToggle from "./WorkFeaturedToggle";
import WorkCardFooter from "./WorkCardFooter";
import WorkScreenshot from "./WorkScreenshot";

const CHIP = "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-xs font-medium";

/* 状态标签:meta 行纯文本 token(不再是 pill 芯片);两种卡片共用。 */
export function statusLabelOf(status: string, locale: Locale): string | null {
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

export function WorkMetaChips({
  w,
  locale,
  statusLabel,
  kindLabel,
  showKind = true,
}: {
  w: WorkRow;
  locale: Locale;
  statusLabel: string | null;
  kindLabel: string;
  /* 网格卡=false:封面名称砖上已有类型 eyebrow,meta 行不重复出分类 */
  showKind?: boolean;
}) {
  return (
    <>
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
      {showKind && (
        <span className="inline-flex shrink-0 items-center gap-1">
          <WorkKindIcon id={w.kind} size={11} />
          {kindLabel}
        </span>
      )}
      {statusLabel && <span className="shrink-0">· {statusLabel}</span>}
    </>
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
  const statusLabel = statusLabelOf(w.status, locale);
  return (
    /* 行式卡:移动端图在上,sm+ 图在左固定列;标题独占一行截断,
       类型/Agent/声明/精选收成一条 mono meta 行,底行 hairline 分隔。
       group:封面轻放大 + 标题变蓝的 hover 载体。 */
    <article className={`kb-work-card group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-paper/30 sm:flex-row ${
      w.source === "awesome" ? "kb-awesome-card" : "kb-member-card"
    }`}>
      {/* 整卡链详情页(P1-2,absolute 覆盖链接);下方交互元素抬 z-10 保持独立跳转 */}
      <Link
        href={`/works/${w.id}`}
        aria-label={w.name}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="kb-work-card-cover shrink-0 border-b border-line sm:w-[232px] sm:self-stretch sm:border-b-0 sm:border-r">
        {/* 封面 = 独立上传封面(cover_key,20260916 起不再取配图第一张);
            无封面回落旧 screenshot_url 外链,再空则 WorkScreenshot 兜底色卡名称砖
            (作品=用户选定色/theme,Awesome=类型族或选定色) */}
        <WorkScreenshot
          url={w.coverKey ? mediaUrl(w.coverKey) : w.screenshotUrl}
          name={w.name}
          logoUrl={w.logoKey ? mediaUrl(w.logoKey) : ""}
          kindLabel={kindLabel}
          kindId={w.kind}
          tone={w.coverTone}
          fit={w.coverFit}
          embedded
          variant="row"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <h2 className="truncate text-lg font-semibold leading-snug text-paper transition-colors group-hover:text-blue">
          {w.name}
        </h2>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-grey">
            {w.tagline}
          </p>
        )}
        {/* meta 区:分类 / Agent / 收录口径分三行,每行带 mute 小标签
            (类型/参与构建/收录——一眼可读,2026-08-14);蓝只给声明投入与精选 */}
        <div className="mb-4 mt-3 flex min-w-0 flex-col gap-1.5 font-mono text-xs leading-5 text-grey">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="shrink-0 text-grey/55">{t(locale, "works.metaKind")}</span>
            <WorkMetaChips w={w} locale={locale} statusLabel={statusLabel} kindLabel={kindLabel} />
            {w.tags.length > 0 && (
              <span className="truncate">· {w.tags.slice(0, 2).join(", ")}</span>
            )}
          </span>
          {w.agents.length > 0 && (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="shrink-0 text-grey/55">{t(locale, "works.metaAgents")}</span>
              {w.agents.slice(0, 2).map((a) => (
                <span key={a} className="inline-flex shrink-0 items-center gap-1">
                  <AgentIcon id={a} size={11} />
                  {agentName(a)}
                </span>
              ))}
              {w.agents.length > 2 && (
                <span className="text-grey/70">+{w.agents.length - 2}</span>
              )}
            </span>
          )}
          {(w.source === "awesome" && w.scope) || (claimBadge !== null && claimBadge > 0) || w.featuredAt ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {w.source === "awesome" && w.scope && (
                <>
                  <span className="shrink-0 text-grey/55">{t(locale, "works.metaScope")}</span>
                  <span className="shrink-0">{scopeLabelOf(w.scope, locale)}</span>
                </>
              )}
              {claimBadge !== null && claimBadge > 0 && (
                <span
                  className="shrink-0 text-blue"
                  title={t(locale, "works.badgeTitle")}
                >
                  {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
                </span>
              )}
              {w.featuredAt && (
                <span
                  className="shrink-0 text-blue"
                  title={w.featuredReason ?? undefined}
                >
                  ★ {t(locale, "featured.badge")}
                </span>
              )}
            </span>
          ) : null}
        </div>
        {/* 底行:hairline 分隔;作者 / 支持 / 链接 / 作者操作(共享 WorkCardFooter) */}
        <WorkCardFooter work={w} locale={locale} meId={meId} />
        {/* 声明超额提示(声明制):仅作者本人可见,引导去编辑页重新分配 */}
        {claimPaused && meId !== null && w.userId === meId && (
          <p className="relative z-10 mt-2 rounded-lg bg-moon px-2 py-1.5 font-mono text-xs leading-relaxed text-grey">
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
