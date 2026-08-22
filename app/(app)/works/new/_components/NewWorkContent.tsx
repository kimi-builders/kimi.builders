/* Submit-work body: shared by the full page (/works/new) and the modal
   (@modal/(.)works/new). showTitle=false collapses the h1 (the modal
   has its own title bar). Claims: the field context = the author's
   verifiable total - the sum of claims; a new work has no name to
   match yet, so the suggestion prefill stays empty (the edit page
   matches the project mix by work name). Graduation attribution:
   ?path=<slug> brings the source-series context (banner + hidden
   field); an invalid slug behaves like no source; the login
   invitation's return URL keeps the path param. */
import { getSessionUser } from "@/src/lib/auth/session";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getWorksSource } from "@/src/lib/works-view-server";
import { getClaimAllowance } from "@/src/lib/works";
import { findLearnSeries, normalizePathSlug } from "@/src/lib/learn-series";
import { createWorkAction } from "../../actions";
import WorkForm from "../../_components/WorkForm";

export default async function NewWorkContent({
  showTitle = true,
  searchParams,
}: {
  showTitle?: boolean;
  /* Graduation attribution: ?path=<slug> brings the source-series
     context; an invalid slug is dropped silently (same as no source). */
  searchParams?: Promise<{ path?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";

  const sp = searchParams ? await searchParams : {};
  const sourceSlug = normalizePathSlug(
    typeof sp.path === "string" ? sp.path : "",
  );
  const sourcePath = sourceSlug ? findLearnSeries(sourceSlug) : undefined;
  /* Returning after login still carries the source context. */
  const newHref = sourceSlug
    ? `/works/new?path=${encodeURIComponent(sourceSlug)}`
    : "/works/new";

  if (!user) {
    return (
      <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
        {showTitle && (
          /* Layout alignment: the header takes eyebrow + .kb-h2; the h1
             carries no icon. */
          <div>
            <p className="kb-eyebrow">{t(locale, "works.newEyebrow")}</p>
            <h1 className="kb-h2 mt-3">
              {t(locale, "works.newTitle")}
            </h1>
          </div>
        )}
        {/* Signed out: unified login-prompt card */}
        <div className={showTitle ? "mt-6" : ""}>
          <LoginGate
            locale={locale}
            title={t(locale, "gate.work")}
            next={newHref}
          />
        </div>
      </div>
    );
  }

  const [allowance, src] = await Promise.all([
    getClaimAllowance(user.id),
    /* Create-intent default follows the source list: entering from
       Awesome's submit entry lands the form directly on "recommend
       external" — the server reads kb-works-src (written by proxy on
       list pages) and renders it directly, no hydration jump; the same
       source of truth as the rail highlight and the detail page's
       "back". */
    getWorksSource(),
  ]);

  return (
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        <div>
          <p className="kb-eyebrow">{t(locale, "works.newEyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "works.newTitle")}
          </h1>
        </div>
      )}
      <WorkForm
        action={createWorkAction}
        locale={locale}
        modal={!showTitle}
        defaultKind={src === "awesome" ? "awesome" : "site"}
        sourcePath={
          sourcePath && sourceSlug
            ? {
                slug: sourceSlug,
                /* Localized server-side (keeps the client form from
                   importing the whole series mock data). */
                text: zh
                  ? `来自系列 ${sourcePath.code} · ${sourcePath.title.zh} — 发布后计入这个系列的毕业作品`
                  : `From series ${sourcePath.code} · ${sourcePath.title.en} — your work will count as a graduate of this series`,
              }
            : null
        }
        claim={{
          initial: null,
          hasUsage: allowance.total > 0,
          remaining: allowance.remaining,
          suggested: null,
        }}
      />
    </div>
  );
}
