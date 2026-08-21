/* /explore 右栏(20260821 月刊 × 教程合并):四维计数 + 最新内容。
   目录/详情/系列页同 rail(right-rail.ts);0 内容时只留说明卡。 */
import Link from "next/link";
import type { Locale } from "@/src/lib/i18n";
import {
  categoryLabelOf,
  countByKind,
  countSeries,
  countTags,
  groupByArchive,
  listExploreItems,
} from "@/src/lib/explore";
import { LEARN_SERIES } from "@/src/lib/learn-series";
import Widget from "./Widget";

export default async function ExploreRail({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const items = await listExploreItems(locale);
  const kinds = countByKind(items);
  const series = countSeries(items);
  const tags = countTags(items);
  const archives = groupByArchive(items);
  const latest = items.slice(0, 5);

  return (
    <>
      {items.length > 0 && (
        <Widget title={zh ? "维度" : "DIMENSIONS"}>
          <ul className="space-y-2 font-mono text-[11px] text-grey">
            {kinds.map((k) => (
              <li key={k.value} className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/explore?view=categories&category=${k.value}`}
                  className="truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {categoryLabelOf(k.value, zh)}
                </Link>
                <span>{k.count}</span>
              </li>
            ))}
            {series.map((s) => {
              const meta = LEARN_SERIES.find((x) => x.slug === s.slug);
              return (
                <li key={s.slug} className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/explore/series/${s.slug}`}
                    className="truncate text-paper transition-colors hover:text-ui-blue"
                  >
                    {meta ? (zh ? meta.title.zh : meta.title.en) : s.slug}
                  </Link>
                  <span>{s.count}</span>
                </li>
              );
            })}
            {tags.length > 0 && (
              <li className="flex items-baseline justify-between gap-2">
                <Link
                  href="/explore?view=tags"
                  className="truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {zh ? "标签" : "Tags"}
                </Link>
                <span>{tags.length}</span>
              </li>
            )}
            {archives.length > 0 && (
              <li className="flex items-baseline justify-between gap-2">
                <Link
                  href="/explore?view=archives"
                  className="truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {zh ? "归档" : "Archives"}
                </Link>
                <span>{archives.length}</span>
              </li>
            )}
          </ul>
        </Widget>
      )}

      {latest.length > 0 && (
        <Widget title={zh ? "最新" : "LATEST"}>
          <ul className="space-y-2.5">
            {latest.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/explore/${i.slug}`}
                  className="block truncate text-xs text-paper transition-colors hover:text-ui-blue"
                >
                  {i.title}
                </Link>
                <p className="mt-0.5 font-mono text-[11px] text-grey">
                  {categoryLabelOf(i.kind, zh)} · {i.publishedAt.toISOString().slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        </Widget>
      )}

      <Widget title={zh ? "关于探索" : "ABOUT"}>
        <p className="text-xs leading-relaxed text-grey">
          {zh
            ? "月刊评鉴与教程是同一架上的文章——分类、系列、标签、时间,四维都是入口。"
            : "The monthly review and the tutorials live on the same shelf — browse by category, series, tag, or time."}
        </p>
      </Widget>
    </>
  );
}
