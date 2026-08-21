/* 系列封面(20260821 探索区):可设置(series.cover = 站内路径或 https 图片)
   或自动文字封面(moon 底 + 系列码 + 标题,零图片依赖)。 */
import type { LearnSeries } from "@/src/lib/learn-series";

export default function SeriesCover({
  series,
  zh,
  className = "",
}: {
  series: LearnSeries;
  zh: boolean;
  className?: string;
}) {
  if (series.cover) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={series.cover}
        alt={zh ? series.title.zh : series.title.en}
        loading="lazy"
        className={`block h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`grid h-full w-full place-items-center bg-moon p-4 ${className}`}
    >
      <div className="text-center">
        <p className="font-mono text-[10px] tracking-[0.3em] text-ui-blue">
          {series.code}
        </p>
        <p className="mt-2 line-clamp-3 text-balance text-sm font-semibold leading-snug tracking-tight text-paper">
          {zh ? series.title.zh : series.title.en}
        </p>
      </div>
    </div>
  );
}
