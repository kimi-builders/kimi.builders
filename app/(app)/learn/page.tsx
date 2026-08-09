/* 知识库(S3-1 重写):策划制学习路径 —— kind='guide' 的文章按编辑定义的 sort_order
   排成编号路径(01/02/03 的 mono 序号),不做 wiki。浏览无需登录;
   语言回落:当前 UI 语言优先,缺失时回落另一语言并标注。空态 = 编辑部撰稿中。 */
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/src/lib/auth/session";
import { listArticles } from "@/src/lib/articles";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";

export const metadata: Metadata = { title: "知识库 — kimi.builders" };

export default async function LearnPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const items = await listArticles("guide", locale);

  return (
    <div>
      <header>
        <h1 className="font-mono text-lg font-semibold">
          {t(locale, "nav.learn")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-grey">
          {t(locale, "learn.intro")}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="mt-8 border border-line bg-card p-6 text-sm leading-relaxed text-grey">
          {t(locale, "learn.empty")}
        </p>
      ) : (
        <div className="mt-8">
          {items.map((a, i) => (
            <article key={a.slug} className="border-t border-line py-6 first:mt-0">
              <div className="flex items-baseline gap-4">
                <span className="shrink-0 font-mono text-sm text-blue">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <Link href={`/learn/${a.slug}`} className="group block">
                    <h2 className="text-lg font-semibold leading-snug text-paper transition-colors group-hover:text-blue">
                      {a.title}
                    </h2>
                    {a.summary && (
                      <p className="mt-2 text-sm leading-relaxed text-grey">
                        {a.summary}
                      </p>
                    )}
                  </Link>
                  <p className="mt-3 flex items-center gap-3 font-mono text-[11px] text-grey">
                    <span>
                      —{" "}
                      <Link
                        href={`/u/${a.authorHandle}`}
                        className="text-paper transition-colors hover:text-blue"
                      >
                        @{a.authorHandle}
                      </Link>
                    </span>
                    {a.fallback && (
                      <span className="border border-line px-1.5 py-px text-[10px] text-paper">
                        {t(locale, a.locale === "zh" ? "art.langZh" : "art.langEn")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </article>
          ))}
          <div className="border-t border-line" />
        </div>
      )}
    </div>
  );
}
