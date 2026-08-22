/* Work card (row variant), shared by /works (member wall), /awesome
   (all sources), and the /u/[handle] works tab. Image in a fixed left
   column (top on mobile, 248px at sm+), one-line truncated title,
   kind/agents/tags/claim/featured collapsed into a mono meta row (blue
   reserved for claim and featured), and a hairline-separated bottom
   row: author/support/links/actions (shared WorkCardFooter). Hover:
   brighter border + slight cover zoom + blue title (group).
   Private/hidden keep their warning pill (author-visible only).
   The whole card links to the detail page (absolute overlay link);
   author/visit/source/action rows raise z-10 to keep their own
   navigation. Editorial featuring: a non-null featured_at adds a ★ to
   the meta row; canFeature (admin/mod) adds a feature/unfeature row at
   the bottom (weekly featured v0). Usage badge (claim-based):
   non-null claimBadge (this work claimed and the author's sum of claims
   <= verifiable total, decided by the assembly layer's claimBadgeOf)
   adds "claimed effort" to the meta row; null = nothing rendered
   (unclaimed / paused over cap — no negative signaling). claimPaused
   (true only for the author) shows a redistribution hint on their own
   cards. */
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

/* Status labels: plain-text tokens in the meta row (no longer pill
   chips); shared by both card variants. */
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
  /* grid=false: the cover's name brick already carries the kind
     eyebrow, so the meta row doesn't repeat it. */
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
          className={`${CHIP} border border-status-danger/60 text-status-danger-fg`}
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
    /* Row card: image on top for mobile, fixed left column at sm+;
       the title takes its own truncated line, kind/agents/claim/
       featured collapse into one mono meta row, and a hairline
       separates the bottom row. group: the hover vehicle for the cover
       zoom + blue title. */
    <article className={`kb-work-card group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,translate] duration-base ease-standard hover:-translate-y-0.5 hover:border-paper/30 sm:flex-row ${
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
      <div className="flex min-w-0 flex-1 flex-col p-6">
        <h2 className="kb-h3 truncate transition-colors group-hover:text-ui-blue">
          {w.name}
        </h2>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-grey">
            {w.tagline}
          </p>
        )}
        {/* meta 区:分类 / Agent / 收录口径分三行,每行带 mute 小标签
            (类型/参与构建/收录——一眼可读,2026-08-14);蓝只给声明投入与精选 */}
        <div className="mb-4 mt-3 flex min-w-0 flex-col gap-2 text-xs leading-5 text-grey">
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
                  className="shrink-0 text-ui-blue"
                  title={t(locale, "works.badgeTitle")}
                >
                  {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
                </span>
              )}
              {w.featuredAt && (
                <span
                  className="shrink-0 text-ui-blue"
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
          <p className="relative z-10 mt-2 rounded-lg bg-moon px-2 py-1.5 text-xs leading-relaxed text-grey">
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
