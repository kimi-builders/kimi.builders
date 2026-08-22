/* /explore 右栏(20260822 对齐 WorksRail 语法):使命引句 + 章分布(条形)
   + 启用的透镜数据(只出 explore-filters.ts 启用且有内容的维度——
   当前:产品、标签;职业/归档翻开配置即用)+ 最新内容。
   系列 = 内容组合,现阶段不显示。 */
import Link from "next/link";
import type { Locale } from "@/src/lib/i18n";
import {
  countByChapter,
  countByProduct,
  countTags,
  listExploreItems,
} from "@/src/lib/explore";
import { KB_CHAPTERS } from "@/src/lib/kb-chapters";
import { findKbProduct } from "@/src/lib/kb-products";
import { isExploreFilterEnabled } from "@/src/lib/explore-filters";
import Widget from "./Widget";

export default async function ExploreRail({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const items = await listExploreItems(locale);
  const chapterCounts = countByChapter(items);
  const chapterMax = Math.max(1, ...chapterCounts.map((c) => c.count));
  const products = isExploreFilterEnabled("product") ? countByProduct(items) : [];
  const tags = isExploreFilterEnabled("tag") ? countTags(items) : [];
  const latest = items.slice(0, 5);

  return (
    <>
      {/* 使命引句(与 WorksRail 的 about.quote 同一左蓝线语法) */}
      <p className="border-l-2 border-blue pl-3 font-mono text-xs leading-relaxed text-grey">
        {zh
          ? "探索将智能转化为创造力的最优解——学、做、得、立。"
          : "Seeking the optimal conversion from intelligence to creativity — Learn, Build, Gain, Become."}
      </p>

      {/* 章分布:条形(与 WorksRail 活跃 Agent 同款) */}
      <Widget title={zh ? "章" : "CHAPTERS"} note={zh ? "主轴,按内容计数" : "Primary axis, by content"}>
        <ul className="space-y-2.5">
          {KB_CHAPTERS.map((c) => {
            const count = chapterCounts.find((x) => x.value === c.id)?.count ?? 0;
            return (
              <li key={c.id} className="flex items-center gap-2.5">
                <span className="flex w-28 shrink-0 items-baseline gap-1.5 text-xs text-grey">
                  <span className="font-semibold text-paper">{zh ? c.zh : c.en}</span>
                  <span className="truncate text-[10px]">{zh ? c.tagline.zh : c.tagline.en}</span>
                </span>
                <span className="h-1.5 min-w-0 flex-1 rounded-full bg-paper/[0.06]">
                  <span
                    className={`block h-full rounded-full ${count > 0 ? "bg-blue" : "bg-transparent"}`}
                    style={{ width: `${Math.max((count / chapterMax) * 100, count > 0 ? 4 : 0)}%` }}
                  />
                </span>
                <span className="shrink-0 font-mono text-xs text-grey">{count}</span>
              </li>
            );
          })}
        </ul>
      </Widget>

      {/* 产品透镜(启用且有内容才出;icon + 词 + 计数,链回筛选) */}
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

      {/* 标签透镜(启用且有内容才出;≤8 个防长尾刷屏) */}
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

      {/* 最新内容(编号列表,与 WorksRail 本周最受欢迎同款) */}
      <Widget title={zh ? "最新" : "LATEST"}>
        {latest.length === 0 ? (
          <p className="text-xs text-grey">
            {zh ? "第一篇内容在筹备。" : "The first piece is being prepared."}
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
