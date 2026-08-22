"use client";

/* 文章封面墙卡(20260822):封面在上恒定 16:9、内容在下,WorkGridCard 同一
   语法;hover 边框亮起 + 封面轻放大 + 标题变蓝,整卡覆盖链详情。 */
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
        className="absolute inset-0 z-0 rounded-2xl"
      />
      <div className="overflow-hidden border-b border-line">
        <div className="aspect-video transition-transform duration-base group-hover:scale-[1.02]">
          <ArticleCover item={item} zh={zh} />
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
                <span key={id} title={zh ? p.zh : p.en}>
                  <Icon size={12} aria-hidden="true" />
                </span>
              );
            })}
            {item.formats.map((f) => {
              const Icon = FORMAT_ICON[f];
              return (
                <span key={f} title={t(locale, FORMAT_LABEL_KEY[f])}>
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
        <h3 className="kb-h3 mt-2 line-clamp-2 break-words transition-colors group-hover:text-ui-blue">
          {item.title}
        </h3>
        {item.summary && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-grey">
            {item.summary}
          </p>
        )}
      </div>
    </article>
  );
}
