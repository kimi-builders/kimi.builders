/* /learn 右栏:路径栈(MOCK 预览期读 app/(app)/learn/_data.ts,Widget note 标
   「设计预览」)+ 路径说明卡。文章详情页同 rail(right-rail.ts)。
   正式内容接管后,路径栈改读真实数据源。 */
import Link from "next/link";
import { t, type Locale } from "@/src/lib/i18n";
import { LEARN_PATHS, isPathStale } from "../../learn/_data";
import Widget from "./Widget";

export default function LearnRail({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  return (
    <>
      <Widget
        title={zh ? "路径栈" : "PATH STACK"}
        note={zh ? "设计预览 · 模拟数据" : "PREVIEW · MOCK DATA"}
      >
        <ul className="space-y-2.5">
          {LEARN_PATHS.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/learn/${p.slug}`}
                className="block truncate text-xs text-paper transition-colors hover:text-ui-blue"
              >
                {zh ? p.title.zh : p.title.en}
              </Link>
              <p className="mt-0.5 font-mono text-xs text-grey">
                {p.code.replace("PATH-", "P")} · {p.levels.length} {zh ? "层" : "levels"} ·{" "}
                {zh ? `约 ${p.hours} 小时` : `~${p.hours}h`}
                {isPathStale(p) && (zh ? " · 待重验" : " · re-verify")}
              </p>
            </li>
          ))}
        </ul>
      </Widget>

      <Widget title={t(locale, "rail.learnPath")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "rail.learnBody")}
        </p>
      </Widget>
    </>
  );
}
