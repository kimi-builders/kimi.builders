/* 文章详情右栏(20260822 详情瘦身):hero 只留「类型 · 章 · 日期 + 标题 +
   摘要」,元数据全部搬到这里——本文 META(类型/章/日期/作者/时长/语言)+
   产品 + 职业 + 标签,全部可点回探索透镜。系列信息现阶段不显示。
   数据:getArticleRailMeta(React cache 与同请求调用去重);查无 → 整栏不渲染
   (页面层已 404,右栏不撑空壳)。 */
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { monthLabel } from "@/src/lib/format";
import { getArticleRailMeta } from "@/src/lib/explore";
import { findKbChapter } from "@/src/lib/kb-chapters";
import { findKbProduct } from "@/src/lib/kb-products";
import { KB_ROLES } from "@/src/lib/kb-roles";
import type { Locale } from "@/src/lib/i18n";
import Widget from "./Widget";

/* META 行:label 左 paper 右,值可为链接 */
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
                <Link
                  href={`/explore?chapter=${chapter.id}`}
                  className="transition-colors hover:text-ui-blue"
                >
                  {zh ? `${chapter.zh} · ${chapter.tagline.zh}` : `${chapter.en} · ${chapter.tagline.en}`}
                </Link>
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
            value={
              item.fallback
                ? (item.locale === "zh" ? "中文(回退)" : "EN (fallback)")
                : item.locale === "zh" ? "中文" : "EN"
            }
          />
        </ul>
      </Widget>

      {item.products.length > 0 && (
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

      {item.roles.length > 0 && (
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

      {item.tags.length > 0 && (
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

      {/* 时长提示行(有视频/文稿的阅读预期;无时长不上) */}
      {item.durationMin === undefined && item.formats.includes("video") && (
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-grey/70">
          <Clock3 size={12} aria-hidden="true" />
          {zh ? "含视频形态" : "Includes video"}
        </p>
      )}
    </>
  );
}
