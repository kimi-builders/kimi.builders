/* 学习路径长文详情(S3-1):guide 正文走 components/Markdown;头部是路径序号感的
   返回链 + 署名编辑 + 语言标记(UI 语言无版本时回落并标注)。浏览无需登录。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { getArticleBySlug, normalizeArticleSlug } from "@/src/lib/articles";
import { canModerate } from "@/src/lib/featured";
import { monthLabel } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import Markdown from "@/components/Markdown";
import { ArrowLeft } from "lucide-react";
import SoonPanel from "../../_components/SoonPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  /* 关闸期间(UPCOMING.learn)不出文章标题,也不查库 */
  if (UPCOMING.learn) return { title: "知识库 — kimi.builders" };
  const { slug } = await params;
  const s = normalizeArticleSlug(slug);
  if (!s) return { title: "kimi.builders" };
  const article = await getArticleBySlug("guide", s, "zh");
  if (!article) return { title: "kimi.builders" };
  return { title: `${article.title} — kimi.builders` };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = normalizeArticleSlug(slug);
  if (!s) notFound();
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* 板块未就绪(src/lib/upcoming.ts):详情页同样换「正在路上」,不查库 */
  if (UPCOMING.learn) {
    return <SoonPanel title={t(locale, "nav.learn")} locale={locale} />;
  }
  const article = await getArticleBySlug("guide", s, locale);
  if (!article) notFound();
  const canEdit = !!user && canModerate(user.role);

  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-wider text-grey">
        <Link href="/learn" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper">
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.learn")}
        </Link>
        <span>{monthLabel(article.publishedAt)}</span>
        {article.fallback && (
          <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-paper">
            {t(locale, article.locale === "zh" ? "art.langZh" : "art.langEn")}
          </span>
        )}
        {canEdit && (
          <Link
            href={`/blog/admin/${article.slug}/edit?locale=${article.locale}`}
            className="ml-auto rounded-lg px-2 py-1 text-grey transition-colors hover:bg-moon hover:text-blue"
          >
            {t(locale, "post.edit")}
          </Link>
        )}
      </div>

      <h1 className="mt-4 text-2xl font-semibold leading-snug">{article.title}</h1>
      <div className="mt-3 font-mono text-[11px] text-grey">
        —{" "}
        <Link
          href={`/u/${article.authorHandle}`}
          className="text-paper transition-colors hover:text-blue"
        >
          @{article.authorHandle}
        </Link>
      </div>

      <div className="mt-8 border-t border-line pt-8">
        <Markdown source={article.bodyMd} />
      </div>
    </article>
  );
}
