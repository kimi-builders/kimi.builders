/* Article detail rail (detail slimmed): the hero keeps only "kind ·
   chapter · date + title + summary" — all metadata moved here: this
   article's META (kind/chapter/date/author/duration/language) +
   products + roles + tags, all clickable back into the explore
   lenses. Lens links honor the one availability judgment
   (explore-filters.ts): a link is issued only when the lens renders a
   control on /explore and its URL param takes effect there — no
   invisible or no-op filters. Series info stays unshown for now.
   Data: getArticleRailMeta + listExploreItems (both React-cached, the
   guide detail page reuses the list for neighbors); a rail-meta miss
   -> the whole rail never renders (the page already 404s; the rail
   doesn't prop up an empty shell). */
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { monthLabel } from "@/src/lib/format";
import { countByChapter, countByProduct, countByRoles, countTags, getArticleRailMeta, groupByArchive, listExploreItems } from "@/src/lib/explore";
import { availableExploreFilters } from "@/src/lib/explore-filters";
import { findKbProduct } from "@/src/lib/kb-products";
import { KB_ROLES } from "@/src/lib/kb-roles";
import { articleLanguageLabel, type Locale } from "@/src/lib/i18n";
import { findKbChapter } from "@/src/lib/kb-chapters";
import Widget from "./Widget";

/* META row: label left, paper-colored value right; values may be
   links. */
function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-paper">{value}</span>
    </li>
  );
}

export default async function ArticleRail({
  slug,
  locale,
}: {
  slug: string;
  locale: Locale;
}) {
  const zh = locale === "zh";
  const item = await getArticleRailMeta(slug, locale);
  if (!item) return null;

  /* The one availability judgment (same cached list the /explore page
     reads): a lens is linkable only when it renders a control there and
     its param takes effect; chapters follow the page's ">=2 comparable"
     rule. A non-browsable chapter still shows as plain text — facts
     stay, dead links don't. */
  const allItems = await listExploreItems(locale);
  const available = availableExploreFilters({
    product: countByProduct(allItems).length,
    role: countByRoles(allItems).length,
    tag: countTags(allItems).length,
    year: groupByArchive(allItems).length,
  });
  const chapterCounts = countByChapter(allItems);
  const activeChapterCount = chapterCounts.filter((c) => c.count > 0).length;
  const chapterBrowsable =
    !!item.chapter &&
    activeChapterCount >= 2 &&
    (chapterCounts.find((c) => c.value === item.chapter)?.count ?? 0) > 0;

  const chapter = item.chapter ? findKbChapter(item.chapter) : undefined;

  return (
    <>
      <Widget title={zh ? "本文" : "THIS PIECE"}>
        <ul className="space-y-2 font-mono text-[11px] text-grey">
          <MetaRow
            label={zh ? "类型" : "Type"}
            value={item.kind === "letter" ? (zh ? "月刊评鉴" : "Monthly") : zh ? "文章" : "Article"}
          />
          {chapter && (
            <MetaRow
              label={zh ? "章" : "Chapter"}
              value={
                chapterBrowsable ? (
                  <Link
                    href={`/explore?chapter=${chapter.id}`}
                    className="transition-colors hover:text-ui-blue"
                  >
                    {zh ? `${chapter.zh} · ${chapter.tagline.zh}` : `${chapter.en} · ${chapter.tagline.en}`}
                  </Link>
                ) : (
                  zh ? `${chapter.zh} · ${chapter.tagline.zh}` : `${chapter.en} · ${chapter.tagline.en}`
                )
              }
            />
          )}
          <MetaRow label={zh ? "发布" : "Published"} value={monthLabel(item.publishedAt)} />
          <MetaRow
            label={zh ? "作者" : "Author"}
            value={
              <Link href={`/u/${item.editorHandle}`} className="transition-colors hover:text-ui-blue">
                @{item.editorHandle}
              </Link>
            }
          />
          {item.durationMin !== undefined && (
            <MetaRow
              label={zh ? "时长" : "Length"}
              value={zh ? `约 ${item.durationMin} 分钟` : `~${item.durationMin} min`}
            />
          )}
          <MetaRow
            label={zh ? "语言" : "Language"}
            value={articleLanguageLabel(locale, item.locale, item.fallback)}
          />
        </ul>
      </Widget>

      {item.products.length > 0 && available.includes("product") && (
        <Widget title={zh ? "涉及产品" : "PRODUCTS"}>
          <ul className="space-y-2">
            {item.products.map((id) => {
              const p = findKbProduct(id);
              if (!p) return null;
              const Icon = p.icon;
              return (
                <li key={id}>
                  <Link
                    href={`/explore?product=${id}`}
                    className="flex items-center gap-2 font-mono text-[11px] text-grey transition-colors hover:text-ui-blue"
                  >
                    <Icon size={13} className="shrink-0" aria-hidden="true" />
                    {zh ? p.zh : p.en}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {item.roles.length > 0 && available.includes("role") && (
        <Widget title={zh ? "适合职业" : "FOR ROLES"}>
          <div className="flex flex-wrap gap-1.5">
            {item.roles.map((id) => {
              const r = KB_ROLES.find((x) => x.id === id);
              if (!r) return null;
              return (
                <Link
                  key={id}
                  href={`/explore?role=${id}`}
                  className="rounded-md border border-line px-1.5 py-px font-mono text-[11px] text-grey transition-colors hover:border-ui-blue/50 hover:text-ui-blue"
                >
                  {zh ? r.zh : r.en}
                </Link>
              );
            })}
          </div>
        </Widget>
      )}

      {item.tags.length > 0 && available.includes("tag") && (
        <Widget title={zh ? "标签" : "TAGS"}>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {item.tags.map((tag) => (
              <Link
                key={tag}
                href={`/explore?tag=${encodeURIComponent(tag)}`}
                className="font-mono text-[11px] text-grey transition-colors hover:text-ui-blue"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </Widget>
      )}

      {/* Duration hint row (reading expectation for video/transcript pieces; omitted when there is no duration) */}
      {item.durationMin === undefined && item.formats.includes("video") && (
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-grey/70">
          <Clock3 size={12} aria-hidden="true" />
          {zh ? "含视频形态" : "Includes video"}
        </p>
      )}
    </>
  );
}
