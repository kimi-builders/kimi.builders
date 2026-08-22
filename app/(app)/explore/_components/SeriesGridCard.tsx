/* Series grid card: the WorkGridCard grammar — cover on top (fixed
   16:9, either series.cover or the automatic text cover), content
   below, hover brightens the border + zooms the cover + blues the
   title; the whole card links into the series page. Meta row: episode
   count + total duration + the verification stamp (stale amber / fresh
   mint). matched (under lens filtering): shows "n/N episodes hit" —
   series never hide whole; partial matches stay on the shelf
   (episodes are the matching ones, so the card agrees with the
   results). */
import Link from "next/link";
import { Clock3, ShieldCheck } from "lucide-react";
import { monthLabel } from "@/src/lib/format";
import { findKbChapter } from "@/src/lib/kb-chapters";
import { findKbProduct } from "@/src/lib/kb-products";
import { isPathStale, type LearnSeries } from "@/src/lib/learn-series";
import type { ExploreItem } from "@/src/lib/explore";
import { t } from "@/src/lib/i18n";
import SeriesCover from "./SeriesCover";

export default function SeriesGridCard({
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
  /* The chapter mark (the axis's minimal presence on the card, linking
     back to the chapter view) + joint product icons (<=3). */
  const chapter = series.chapter ? findKbChapter(series.chapter) : undefined;
  const seriesProducts = [...new Set(episodes.flatMap((e) => e.products))].slice(0, 3);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-paper/30">
      {/* 整卡链系列页;hover 语言与作品卡一致 */}
      <Link
        href={`/explore/series/${series.slug}`}
        aria-label={zh ? series.title.zh : series.title.en}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="overflow-hidden border-b border-line">
        <div className="aspect-video transition-transform duration-300 group-hover:scale-[1.02]">
          <SeriesCover series={series} zh={zh} className="h-full w-full" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h2 className="truncate text-base font-semibold leading-snug text-paper transition-colors group-hover:text-ui-blue">
          {zh ? series.title.zh : series.title.en}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
          {zh ? series.summary.zh : series.summary.en}
        </p>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-grey">
          <span className="shrink-0">{series.code}</span>
          {chapter && (
            <Link
              href={`/explore?chapter=${chapter.id}`}
              className="shrink-0 rounded-md border border-line px-1.5 py-px text-paper/80 transition-colors hover:border-ui-blue/50 hover:text-ui-blue"
              title={zh ? chapter.tagline.zh : chapter.tagline.en}
            >
              {zh ? chapter.zh : chapter.en}
            </Link>
          )}
          {seriesProducts.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1">
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
            </span>
          )}
          <span className="shrink-0">
            {matched
              ? t(zh ? "zh" : "en", "explore.matchInSeries", { n: matched.hit, m: matched.total })
              : `${episodes.length} ${zh ? "集" : "ep"}`}
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
