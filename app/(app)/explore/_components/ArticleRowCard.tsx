"use client";

/* 文章横列卡(20260822 探索简化改版):一篇内容一张卡,WorkCard 行式语法——
   sm 起封面在左固定列、内容在右、整卡覆盖链接、hover 上浮 + 边线亮起。
   系列 = 内容的一种组合,现阶段不展示(系列码不上卡)。
   内容列:eyebrow(章 · 日期 · 产品图标 · 形态标记)+ kb-h3 标题 +
   摘要 + 标签行。 */
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

export default function ArticleRowCard({
  item,
  locale,
}: {
  item: ExploreItem;
  locale: Locale;
}) {
  const zh = locale === "zh";
  const chapter = item.chapter ? findKbChapter(item.chapter) : undefined;
  const shownProducts = item.products.slice(0, 3);
  const overflow = item.products.length - shownProducts.length;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,translate] duration-base ease-standard hover:-translate-y-0.5 hover:border-paper/30 sm:flex-row">
      {/* 整卡链详情;下方无独立交互元素,不抬 z */}
      <Link
        href={`/explore/${item.slug}`}
        aria-label={item.title}
        className="absolute inset-0 z-0 rounded-2xl"
      />
      {/* 封面列:移动端通栏在上,sm+ 固定宽在左(与 WorkCard 行式同构) */}
      <div className="overflow-hidden border-b border-line sm:w-52 sm:shrink-0 sm:border-b-0 sm:border-r">
        <div className="aspect-video h-full transition-transform duration-base group-hover:scale-[1.02] sm:aspect-auto">
          <ArticleCover item={item} zh={zh} />
        </div>
      </div>
      {/* 内容列 */}
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-grey">
          {chapter && <span>{zh ? chapter.zh : chapter.en}</span>}
          <span>· {monthLabel(item.publishedAt)}</span>
          {shownProducts.length > 0 && (
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
              {overflow > 0 && <span>+{overflow}</span>}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
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
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-grey">
            {item.summary}
          </p>
        )}
        {item.tags.length > 0 && (
          <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 font-mono text-[11px] text-grey/80">
            {item.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}
