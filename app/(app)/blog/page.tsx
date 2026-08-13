/* 月刊《给 Kimi 官方的一封信》(S3-1,战略支柱 1:结构洞收费口):
   letter 文章列表 —— 大字距 mono 小标签 + 标题 + 摘要 + 「— @handle」编辑署名 + 期号月份。
   硬边细线风格(无圆角无阴影)。浏览无需登录;
   语言回落:当前 UI 语言优先,缺失时回落另一语言并在卡片标注实际语言。
   空态:创刊号筹备中的文案,不做空壳硬撑。 */
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/src/lib/auth/session";
import { listArticles } from "@/src/lib/articles";
import { canModerate } from "@/src/lib/featured";
import { monthLabel } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../_components/SoonPanel";

export const metadata: Metadata = {
  /* 关闸期间(UPCOMING.blog)标签页标题用板块名,不露出具体刊物名 */
  title: UPCOMING.blog
    ? "月刊 — kimi.builders"
    : "给 Kimi 官方的一封信 — kimi.builders",
};

export default async function BlogPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* 板块未就绪(src/lib/upcoming.ts):整页换「正在路上」,不查库 */
  if (UPCOMING.blog) {
    return <SoonPanel title={t(locale, "nav.blog")} locale={locale} />;
  }
  const items = await listArticles("letter", locale);
  /* 编辑入口:admin/mod 可见,action 层再校验一次 */
  const canEdit = !!user && canModerate(user.role);

  return (
    <div>
      <header className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <p className="font-mono text-[10px] tracking-[0.25em] text-blue">
          {t(locale, "blog.sub")}
        </p>
        <div className="mt-2 flex items-baseline gap-4">
          <h1 className="text-2xl font-semibold leading-snug">
            {t(locale, "blog.title")}
          </h1>
          {canEdit && (
            <Link
              href="/blog/admin/new"
              className="ml-auto shrink-0 rounded-lg bg-blue px-3 py-2 font-mono text-[11px] font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90"
            >
              {t(locale, "blog.new")}
            </Link>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-card p-6 text-sm leading-relaxed text-grey">
          {t(locale, "blog.empty")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((a) => (
            <article key={a.slug} className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-paper/20">
              <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.25em] text-grey">
                <span>{monthLabel(a.publishedAt)}</span>
                {a.fallback && (
                  <span className="rounded-md border border-line px-1.5 py-px text-paper">
                    {t(locale, a.locale === "zh" ? "art.langZh" : "art.langEn")}
                  </span>
                )}
              </div>
              <Link href={`/blog/${a.slug}`} className="group mt-2 block">
                <h2 className="text-lg font-semibold leading-snug text-paper transition-colors group-hover:text-blue">
                  {a.title}
                </h2>
                {a.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-grey">
                    {a.summary}
                  </p>
                )}
              </Link>
              <p className="mt-3 font-mono text-[11px] text-grey">
                —{" "}
                <Link
                  href={`/u/${a.authorHandle}`}
                  className="text-paper transition-colors hover:text-blue"
                >
                  @{a.authorHandle}
                </Link>
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
