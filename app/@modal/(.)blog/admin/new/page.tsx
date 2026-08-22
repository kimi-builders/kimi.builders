/* Intercepts /blog/admin/new: the explore header's "publish" opens in
   place as a modal; direct access/refresh still gets the full page
   (app/(app)/blog/admin/new/page.tsx). Both share NewArticleContent
   (the same shape as the work-publish interception). */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import NewArticleContent from "@/app/(app)/blog/admin/new/_components/NewArticleContent";

export default async function NewArticleModalPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "artf.newTitle")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(94vw,56rem)]"
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      <NewArticleContent showTitle={false} />
    </RouteModal>
  );
}
