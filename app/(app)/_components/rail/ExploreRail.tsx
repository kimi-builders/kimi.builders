/* /explore rail: a section intro line + chapter distribution (bars) +
   available lens data (products/tags — the same availability judgment
   as the toolbar and the URL channel, so every link here lands on a
   visible, clearable filter) + latest content. Series are a grouping
   and stay unshown for now. */
import Link from "next/link";
import type { Locale } from "@/src/lib/i18n";
import {
  countByChapter,
  countByProduct,
  countByRoles,
  countTags,
  groupByArchive,
  listExploreItems,
} from "@/src/lib/explore";
import { KB_CHAPTERS } from "@/src/lib/kb-chapters";
import { findKbProduct } from "@/src/lib/kb-products";
import { availableExploreFilters } from "@/src/lib/explore-filters";
import Widget from "./Widget";

export default async function ExploreRail({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const items = await listExploreItems(locale);
  const chapterCounts = countByChapter(items);
  const activeChapters = KB_CHAPTERS.filter(
    (chapter) => (chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0) > 0,
  );
  const chapterMax = Math.max(
    1,
    ...activeChapters.map(
      (chapter) => (chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0),
    ),
  );
  const productCounts = countByProduct(items);
  const available = availableExploreFilters({
    product: productCounts.length,
    role: countByRoles(items).length,
    tag: countTags(items).length,
    year: groupByArchive(items).length,
  });
  const products = available.includes("product") ? productCounts : [];
  const tags = available.includes("tag") ? countTags(items) : [];
  const latest = items.slice(0, 5);

  return (
    <>
      {/* Section intro line (the left-blue-line grammar shared by section rails) */}
      <p className="border-l-2 border-blue pl-3 font-mono text-xs leading-relaxed text-grey">
        {zh
          ? "收录方法、证据与出处。"
          : "Methods, evidence, and sources."}
      </p>

      {/* A single populated chapter is not a meaningful distribution. */}
      {activeChapters.length >= 2 && (
        <Widget title={zh ? "章" : "CHAPTERS"} note={zh ? "按内容计数" : "By content"}>
          <ul className="space-y-2.5">
            {activeChapters.map((chapter) => {
              const count = chapterCounts.find((x) => x.value === chapter.id)?.count ?? 0;
              return (
                <li key={chapter.id} className="flex items-center gap-2.5">
                  <span className="flex w-28 shrink-0 items-baseline gap-1.5 text-xs text-grey">
                    <span className="font-semibold text-paper">{zh ? chapter.zh : chapter.en}</span>
                    <span className="truncate text-[10px]">
                      {zh ? chapter.tagline.zh : chapter.tagline.en}
                    </span>
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 rounded-full bg-paper/[0.06]">
                    <span
                      className="block h-full rounded-full bg-blue"
                      style={{ width: `${Math.max((count / chapterMax) * 100, 4)}%` }}
                    />
                  </span>
                  <span className="shrink-0 font-mono text-xs text-grey">{count}</span>
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {/* Product lens (shown when enabled and non-empty; icon + word + count, links back into the filters) */}
      {products.length > 0 && (
        <Widget title={zh ? "产品" : "PRODUCTS"}>
          <ul>
            {products.map((p) => {
              const meta = findKbProduct(p.value);
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <li key={p.value}>
                  <Link
                    href={`/explore?product=${p.value}`}
                    className="group flex items-center gap-2.5 border-b border-line py-2 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                  >
                    <Icon size={14} className="shrink-0 text-grey" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-paper transition-colors group-hover:text-ui-blue">
                      {zh ? meta.zh : meta.en}
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-grey">
                      {p.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {/* Tag lens (shown when enabled and non-empty; capped at 8 so the long tail can't flood the rail) */}
      {tags.length > 0 && (
        <Widget title={zh ? "标签" : "TAGS"}>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {tags.slice(0, 8).map((tg) => (
              <Link
                key={tg.value}
                href={`/explore?tag=${encodeURIComponent(tg.value)}`}
                className="font-mono text-[11px] text-grey transition-colors hover:text-ui-blue"
              >
                #{tg.value}
                <span className="ml-1 opacity-60">{tg.count}</span>
              </Link>
            ))}
          </div>
        </Widget>
      )}

      {/* Latest pieces (numbered list, same style as WorksRail's week favorites) */}
      <Widget title={zh ? "最新" : "LATEST"}>
        {latest.length === 0 ? (
          <p className="text-xs text-grey">
            {zh
              ? "第一篇 Builder 实践正在筹备。"
              : "The first Builder practice is being prepared."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {latest.map((i, idx) => (
              <li key={i.slug} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-xs text-grey">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/explore/${i.slug}`}
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {i.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </>
  );
}
