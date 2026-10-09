"use client";

/* Article cover-wall card: cover on top (fixed 16:9), content below —
   the WorkGridCard grammar; hover brightens the border + zooms the
   cover + blues the title; the whole card links to the detail. */
import Link from "next/link";
import { FileText, Play, Presentation } from "lucide-react";
import { monthLabel } from "@/src/lib/format";
import type { ExploreItem } from "@/src/lib/explore";
import { findKbChapter } from "@/src/lib/kb-chapters";
import { findKbProduct } from "@/src/lib/kb-products";
import { t, type Locale } from "@/src/lib/i18n";
import ArticleCover from "./ArticleCover";

const FORMAT_ICON = {
  read: FileText,
  video: Play,
  deck: Presentation,
} as const;

const FORMAT_LABEL_KEY = {
  read: "explore.formatRead",
  video: "explore.formatVideo",
  deck: "explore.formatDeck",
} as const;

export default function ArticleGridCard({
  item,
  locale,
}: {
  item: ExploreItem;
  locale: Locale;
}) {
  const zh = locale === "zh";
  const chapter = item.chapter ? findKbChapter(item.chapter) : undefined;
  const shownProducts = item.products.slice(0, 3);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,translate] duration-base ease-standard hover:-translate-y-0.5 hover:border-paper/30">
      <Link
        href={`/explore/${item.slug}`}
        aria-label={item.title}
        className="flex h-full flex-1 flex-col rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-blue"
      >
        <div className="overflow-hidden border-b border-line">
          <div className="aspect-video transition-transform duration-base group-hover:scale-[1.02]">
            {/* Wall variant: the brick carries the title, so the card body
               repeats it only when a real cover image occupies the brick. */}
            <ArticleCover item={item} zh={zh} variant="wall" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-grey">
            {chapter && <span>{zh ? chapter.zh : chapter.en}</span>}
            <span>· {monthLabel(item.publishedAt)}</span>
            <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
              {shownProducts.map((id) => {
                const p = findKbProduct(id);
                if (!p) return null;
                const Icon = p.icon;
                return (
                  <span key={id} data-tip={zh ? p.zh : p.en} aria-label={zh ? p.zh : p.en}>
                    <Icon size={12} aria-hidden="true" />
                  </span>
                );
              })}
              {item.formats.map((f) => {
                const Icon = FORMAT_ICON[f];
                return (
                  <span key={f} data-tip={t(locale, FORMAT_LABEL_KEY[f])} aria-label={t(locale, FORMAT_LABEL_KEY[f])}>
                    <Icon size={12} aria-hidden="true" className="text-grey/70" />
                  </span>
                );
              })}
            </span>
            {item.fallback && (
              <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
                {t(locale, item.locale === "zh" ? "art.langZh" : "art.langEn")}
              </span>
            )}
          </p>
          {item.cover && (
            <h3 className="kb-h3 mt-2 line-clamp-2 break-words transition-colors group-hover:text-ui-blue">
              {item.title}
            </h3>
          )}
          {item.summary && (
            <p className={`line-clamp-2 text-sm leading-relaxed text-grey ${item.cover ? "mt-1.5" : "mt-2"}`}>
              {item.summary}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
