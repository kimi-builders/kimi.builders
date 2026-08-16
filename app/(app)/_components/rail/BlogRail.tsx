/* /blog 右栏:期号归档(articles kind=letter,复用 src/lib/articles 的列表查询)
   + 编辑署名卡(归档里实际署名的编辑)+ 订阅说明。文章详情页同 rail(right-rail.ts)。
   冷启动没有已发布期刊时归档/署名卡不渲染,只留订阅说明。 */
import Link from "next/link";
import { listArticles } from "@/src/lib/articles";
import { monthLabel } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import Widget from "./Widget";

export default async function BlogRail({ locale }: { locale: Locale }) {
  const items = await listArticles("letter", locale);
  /* 署名编辑:按归档出现顺序去重 */
  const editors = [...new Set(items.map((a) => a.authorHandle))].filter(Boolean);

  return (
    <>
      {items.length > 0 && (
        <Widget title={t(locale, "rail.blogArchive")}>
          <ul className="space-y-2.5">
            {items.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/blog/${a.slug}`}
                  className="block truncate text-xs text-paper transition-colors hover:text-blue"
                >
                  {a.title}
                </Link>
                <p className="mt-0.5 font-mono text-[11px] text-grey">
                  {monthLabel(a.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
        </Widget>
      )}

      {editors.length > 0 && (
        <Widget title={t(locale, "rail.blogEditors")}>
          <p className="text-xs leading-relaxed text-grey">
            {t(locale, "home.featuredSub")}
          </p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-grey">
            {editors.map((h) => `@${h}`).join(" ")}
          </p>
        </Widget>
      )}

      <Widget title={t(locale, "rail.blogSubscribe")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "rail.blogSubscribeBody")}
        </p>
        <Link
          href="/community"
          className="mt-3 inline-block font-mono text-[11px] text-grey underline decoration-blue/50 underline-offset-4 transition-colors hover:text-blue"
        >
          {t(locale, "nav.community")}
        </Link>
      </Widget>
    </>
  );
}
