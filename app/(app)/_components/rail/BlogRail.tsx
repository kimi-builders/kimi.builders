/* /blog 右栏:期号归档 + 编辑署名卡 + 订阅说明。文章详情页同 rail(right-rail.ts)。
   20260920 起读真实数据:articles(kind=letter)已发布期次(src/lib/monthly.ts);
   一封未发时归档卡显示「首期筹备中」,不撑空壳。 */
import Link from "next/link";
import { t, type Locale } from "@/src/lib/i18n";
import { listLetterIssueMetas } from "@/src/lib/monthly";
import Widget from "./Widget";

export default async function BlogRail({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const metas = await listLetterIssueMetas(locale);
  /* 署名编辑:按期次出现顺序去重 */
  const editors = [...new Set(metas.map((i) => i.editorHandle))].filter(Boolean);

  return (
    <>
      <Widget title={t(locale, "rail.blogArchive")}>
        {metas.length === 0 ? (
          <p className="text-xs leading-relaxed text-grey">
            {zh ? "首期筹备中,发刊后按期归档。" : "Issue one in the works — archived here once shipped."}
          </p>
        ) : (
          /* 期次累积后右栏不能无限变长:最新 6 期 + 「全部」尾链(20260921) */
          <ul className="space-y-2.5">
            {metas.slice(0, 6).map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/blog/${i.slug}`}
                  className="block truncate text-xs text-paper transition-colors hover:text-ui-blue"
                >
                  {i.title}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-grey">
                  ISSUE {String(i.issue).padStart(2, "0")} · {i.month}
                </p>
              </li>
            ))}
            {metas.length > 6 && (
              <li>
                <Link
                  href="/blog"
                  className="font-mono text-xs text-ui-blue transition-opacity hover:opacity-80"
                >
                  {zh ? `全部 ${metas.length} 期 →` : `All ${metas.length} issues →`}
                </Link>
              </li>
            )}
          </ul>
        )}
      </Widget>

      <Widget title={t(locale, "rail.blogEditors")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "home.featuredSub")}
        </p>
        {editors.length > 0 && (
          <p className="mt-2 font-mono text-xs leading-relaxed text-grey">
            {editors.map((h) => `@${h}`).join(" ")}
          </p>
        )}
      </Widget>

      <Widget title={t(locale, "rail.blogSubscribe")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "rail.blogSubscribeBody")}
        </p>
        <Link
          href="/community"
          className="mt-3 inline-block font-mono text-xs text-grey underline decoration-ui-blue/50 underline-offset-4 transition-colors hover:text-ui-blue"
        >
          {t(locale, "nav.community")}
        </Link>
      </Widget>
    </>
  );
}
