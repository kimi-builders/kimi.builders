/* 知识库(S3-1 重写):策划制学习路径 —— kind='guide' 的文章按编辑定义的 sort_order
   排成编号路径(01/02/03 的 mono 序号),不做 wiki。浏览无需登录;
   语言回落:当前 UI 语言优先,缺失时回落另一语言并标注。空态 = 编辑部撰稿中。 */
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/src/lib/auth/session";
import { listArticles } from "@/src/lib/articles";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../_components/SoonPanel";

export const metadata: Metadata = { title: "知识库 — kimi.builders" };

export default async function LearnPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* 板块未就绪(src/lib/upcoming.ts):整页换「正在路上」,不查库 */
  if (UPCOMING.learn) {
    return <SoonPanel title={t(locale, "nav.learn")} locale={locale} expect={t(locale, "soon.learnExpect")} />;
  }
  const items = await listArticles("guide", locale);

  return (
    <div>
      <header className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h1 className="font-mono text-xl font-semibold">
          {t(locale, "nav.learn")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-grey">
          {t(locale, "learn.intro")}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-card p-6 text-sm leading-relaxed text-grey">
          {t(locale, "learn.empty")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((a, i) => (
            <article key={a.slug} className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-paper/20">
              <div className="flex items-start gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-moon font-mono text-xs text-blue">
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
                      <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-paper">
                        {t(locale, a.locale === "zh" ? "art.langZh" : "art.langEn")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
