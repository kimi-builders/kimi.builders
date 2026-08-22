/* 系列行式卡(20260821 探索区):WorkCard 行式语法——sm 起封面在左、内容在右、
   整卡覆盖链接;与 SeriesGridCard(封面墙)共用 SeriesCover,由视图切换分流。
   meta 行:系列码 + 集数 + 总时长 + 最新日期 + 验证戳;
   matched(透镜筛选时)显示「命中 n/N 集」,部分命中不整卡隐藏。 */
import Link from "next/link";
import { Clock3, ShieldCheck } from "lucide-react";
import { monthLabel } from "@/src/lib/format";
import { findKbProduct } from "@/src/lib/kb-products";
import { isPathStale, type LearnSeries } from "@/src/lib/learn-series";
import type { ExploreItem } from "@/src/lib/explore";
import { t } from "@/src/lib/i18n";
import SeriesCover from "./SeriesCover";

export default function SeriesRowCard({
  series,
  episodes,
  zh,
  matched,
}: {
  series: LearnSeries;
  episodes: ExploreItem[];
  zh: boolean;
  matched?: { hit: number; total: number };
}) {
  const stale = isPathStale(series);
  const mins = episodes.reduce((n, e) => n + (e.durationMin ?? 0), 0);
  const latest = episodes.reduce<ExploreItem | null>(
    (acc, e) => (acc && acc.publishedAt > e.publishedAt ? acc : e),
    null,
  );
  /* 联合产品图标(≤3):透镜在货架卡上的最小存在 */
  const seriesProducts = [...new Set(episodes.flatMap((e) => e.products))].slice(0, 3);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-paper/30 sm:flex-row">
      {/* 整卡链系列页 */}
      <Link
        href={`/explore/series/${series.slug}`}
        aria-label={zh ? series.title.zh : series.title.en}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      {/* 封面:移动端通栏在上,sm+ 固定宽在左(与 WorkCard 行式同构) */}
      <div className="overflow-hidden border-b border-line sm:w-56 sm:shrink-0 sm:border-b-0 sm:border-r">
        <div className="aspect-video h-full transition-transform duration-300 group-hover:scale-[1.02] sm:aspect-auto">
          <SeriesCover series={series} zh={zh} className="h-full w-full" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey/70">
          — {zh ? "系列" : "Series"} · {series.code}
        </p>
        <h2 className="mt-1.5 truncate text-base font-semibold leading-snug text-paper transition-colors group-hover:text-ui-blue">
          {zh ? series.title.zh : series.title.en}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
          {zh ? series.summary.zh : series.summary.en}
        </p>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-grey">
          <span className="inline-flex shrink-0 items-center gap-1">
            {seriesProducts.length > 0 && (
              <>
                {seriesProducts.map((id) => {
                  const p = findKbProduct(id);
                  if (!p) return null;
                  const Icon = p.icon;
                  return (
                    <span key={id} title={zh ? p.zh : p.en}>
                      <Icon size={12} aria-hidden="true" />
                    </span>
                  );
                })}
                <span aria-hidden="true" className="text-grey/50">|</span>
              </>
            )}
            <span>
              {matched
                ? t(zh ? "zh" : "en", "explore.matchInSeries", { n: matched.hit, m: matched.total })
                : `${episodes.length} ${zh ? "集" : "ep"}`}
            </span>
          </span>
          {mins > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Clock3 size={12} aria-hidden="true" />
              {zh ? `约 ${mins} 分钟` : `~${mins} min`}
            </span>
          )}
          {latest && <span className="shrink-0">{monthLabel(latest.publishedAt)}</span>}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            <ShieldCheck
              size={12}
              className={stale ? "text-status-warn-fg" : "text-status-ok-fg"}
              aria-hidden="true"
            />
            {stale ? (zh ? "待重验" : "stale") : zh ? "已验证" : "verified"}
          </span>
        </div>
      </div>
    </article>
  );
}
