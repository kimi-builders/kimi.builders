/* New-article body (shared by the full page and the intercepted
   modal): section switch + admin/mod gate + ArticleForm.
   showTitle=false hands the title to RouteModal's header, leaving just
   the form (the same division as NewWorkContent). */
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../../../../_components/SoonPanel";
import ArticleForm from "../../../_components/ArticleForm";

export default async function NewArticleContent({
  showTitle = true,
}: {
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* Section not ready (src/lib/upcoming.ts): the edit console closes
     with it. */
  if (UPCOMING.explore) {
    return <SoonPanel title={t(locale, "nav.explore")} locale={locale} />;
  }
  if (!user || !canModerate(user.role)) {
    return (
      <p className="mt-8 rounded-2xl border border-line bg-card p-6 font-mono text-xs text-grey">
        {t(locale, user ? "err.forbidden" : "err.login")}
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      {showTitle && (
        <>
          {/* 20260819 版式对齐:页头接入 eyebrow + .kb-h2 */}
          <p className="kb-eyebrow">{t(locale, "artf.eyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "artf.newTitle")}
          </h1>
        </>
      )}
      <ArticleForm locale={locale} />
    </div>
  );
}
