/* New-post body: shared by the full page (/community/new) and the
   modal (@modal/(.)community/new). showTitle=false collapses the h1
   (the modal has its own title bar). The login gate is server-side,
   the form interaction (PostForm) client-side; signed out = the
   unified login-invitation card (the same face as every login gate on
   the site). */
import { getSessionUser } from "@/src/lib/auth/session";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import PostForm from "../../_components/PostForm";

export default async function NewPostContent({
  showTitle = true,
}: {
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        /* Layout alignment: the header takes eyebrow + .kb-h2, the
           section landing pages' grammar. */
        <div>
          <p className="kb-eyebrow">{t(locale, "form.eyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "form.pageTitle")}
          </h1>
        </div>
      )}
      {user ? (
        <PostForm aiDefault={user.aiRepliesEnabled} locale={locale} />
      ) : (
        <div className={showTitle ? "mt-6" : ""}>
          <LoginGate
            locale={locale}
            title={t(locale, "gate.post")}
            next="/community/new"
          />
        </div>
      )}
    </div>
  );
}
