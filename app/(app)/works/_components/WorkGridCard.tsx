/* 作品卡片(网格版,20260918):/works 与 /awesome 的「封面墙」视图——
   封面在上(恒定 16:9),内容在下,sm 两列 / lg 三列。与行式 WorkCard 并列
   (非变体分支):信息密度刻意更低——tagline 放宽到两行,meta 压成一行
   (类型/状态/前两个 Agent;★精选与声明投入保留蓝色),收录口径(scope)
   按约定省略(详情页可看),底行复用 WorkCardFooter(compact:链接只留图标)。
   hover 语言与行式卡一致:边框提亮 + 封面轻放大 + 标题变蓝(group)。
   整卡覆盖链接 + 交互元素 z-10 的模式与行式卡相同(P1-2)。 */
import Link from "next/link";
import { agentName } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";
import { workKindLabel } from "@/src/lib/work-kinds";
import type { WorkRow } from "@/src/lib/works";
import AgentIcon from "@/components/AgentIcon";
import WorkFeaturedToggle from "./WorkFeaturedToggle";
import WorkCardFooter from "./WorkCardFooter";
import { statusLabelOf, WorkMetaChips } from "./WorkCard";
import WorkScreenshot from "./WorkScreenshot";

export default function WorkGridCard({
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
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-paper/30">
      {/* 整卡链详情页(P1-2);下方交互元素抬 z-10 保持独立跳转 */}
      <Link
        href={`/works/${w.id}`}
        aria-label={w.name}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="border-b border-line">
        <WorkScreenshot
          url={w.coverKey ? mediaUrl(w.coverKey) : w.screenshotUrl}
          name={w.name}
          logoUrl={w.logoKey ? mediaUrl(w.logoKey) : ""}
          kindLabel={kindLabel}
          kindId={w.kind}
          tone={w.coverTone}
          fit={w.coverFit}
          embedded
          variant="grid"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h2 className="truncate text-[15px] font-semibold leading-snug text-paper transition-colors group-hover:text-blue">
          {w.name}
        </h2>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-grey">
            {w.tagline}
          </p>
        )}
        {/* meta 压缩一行:状态/Agent/声明/精选;蓝只给声明投入与精选。
           分类不重复出——封面名称砖左上已有类型 eyebrow(20260918)。
           Agent 在网格下只出图标(最多 3 个 + "+N",title 悬浮全名列表)——
           卡宽有限,名字会挤爆 meta 行;全名在详情页与行式卡都可看 */}
        <div className="mb-3 mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-grey">
          <WorkMetaChips
            w={w}
            locale={locale}
            statusLabel={statusLabel}
            kindLabel={kindLabel}
            showKind={false}
          />
          {w.agents.length > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1"
              title={w.agents.map((a) => agentName(a)).join(", ")}
            >
              {w.agents.slice(0, 3).map((a) => (
                <AgentIcon key={a} id={a} size={12} />
              ))}
              {w.agents.length > 3 && <span>+{w.agents.length - 3}</span>}
            </span>
          )}
          {claimBadge !== null && claimBadge > 0 && (
            <span className="shrink-0 text-blue" title={t(locale, "works.badgeTitle")}>
              {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
            </span>
          )}
          {w.featuredAt && (
            <span className="shrink-0 text-blue" title={w.featuredReason ?? undefined}>
              ★
            </span>
          )}
        </div>
        <WorkCardFooter work={w} locale={locale} meId={meId} compact />
        {claimPaused && meId !== null && w.userId === meId && (
          <p className="relative z-10 mt-2 rounded-lg bg-moon px-2 py-1.5 font-mono text-[11px] leading-relaxed text-grey">
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
